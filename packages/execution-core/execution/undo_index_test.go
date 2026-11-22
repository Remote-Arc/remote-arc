package execution

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// resetUndoIndex forgets what this process has read, as a fresh process would.
func resetUndoIndex() {
	undoIndex.mu.Lock()
	defer undoIndex.mu.Unlock()
	undoIndex.root, undoIndex.byID = "", nil
}

func saveManifest(t *testing.T, m manifest) string {
	t.Helper()
	dir := filepath.Join(undoRoot(), m.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(m)
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestWriteReusesIndexedManifestsButSeesOtherWriters(t *testing.T) {
	c, root, p := mutationFixture(t)
	target := filepath.Join(root, "target.txt")
	call(t, c, "write_file", map[string]any{"path": target, "content": "one"}, p)
	first, err := undoCandidates()
	if err != nil || len(first) != 1 {
		t.Fatal("missing first record", err)
	}
	// A write does not read manifests it has already indexed. Listing still
	// reads every manifest, so it is never misled by the index.
	if err := os.WriteFile(filepath.Join(first[0].Dir, "manifest.json"), []byte("{"), 0600); err != nil {
		t.Fatal(err)
	}
	cached, err := scanUndo(true)
	if err != nil || len(cached) != 1 || cached[0].Manifest.ID != first[0].Manifest.ID {
		t.Fatalf("write path reread an indexed manifest: %+v %v", cached, err)
	}
	if n := undoCount(t); n != 0 {
		t.Fatalf("listing trusted the index over the store: %d", n)
	}
	// Another process adds a record whose clock is ahead, and removes one.
	ahead := manifest{ID: "other-ahead", Created: time.Now().Add(time.Minute).UTC().Format(time.RFC3339Nano), Tool: "write_file", Target: filepath.Join(root, "other.txt"), Bytes: 1}
	saveManifest(t, ahead)
	gone := saveManifest(t, manifest{ID: "other-gone", Created: time.Now().UTC().Format(time.RFC3339Nano), Tool: "write_file", Target: filepath.Join(root, "other.txt"), Bytes: 1})
	if _, err := scanUndo(true); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(gone); err != nil {
		t.Fatal(err)
	}
	cached, err = scanUndo(true)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range cached {
		if item.Manifest.ID == "other-gone" {
			t.Fatal("write path kept a record another process removed")
		}
	}
	call(t, c, "write_file", map[string]any{"path": target, "content": "two"}, p)
	items, err := undoCandidates()
	if err != nil {
		t.Fatal(err)
	}
	// Compare IDs: the stored target is the resolved path, which differs from
	// the temp path on macOS (/private/var) and Windows (case).
	if len(items) != 2 || items[0].Manifest.ID == ahead.ID || items[1].Manifest.ID != ahead.ID {
		t.Fatalf("new record not ordered after another writer's record: %+v", items)
	}
}

func TestWritePathKeepsUndoRetention(t *testing.T) {
	c, root, p := mutationFixture(t)
	target := filepath.Join(root, "target.txt")
	call(t, c, "write_file", map[string]any{"path": target, "content": "one"}, p)
	items, err := undoCandidates()
	if err != nil || len(items) != 1 {
		t.Fatal("missing record", err)
	}
	// An indexed record passes retention while this process runs.
	undoIndex.mu.Lock()
	m := undoIndex.byID[items[0].Manifest.ID]
	m.Created = time.Now().Add(-8 * 24 * time.Hour).UTC().Format(time.RFC3339Nano)
	undoIndex.byID[m.ID] = m
	undoIndex.mu.Unlock()
	// Another process left a record that overflows the size budget.
	large := saveManifest(t, manifest{ID: "other-large", Created: time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano), Tool: "write_file", Target: filepath.Join(root, "other.txt"), Bytes: undoMaxBytes + 1})
	if _, err := c.Call(context.Background(), "write_file", map[string]any{"path": target, "content": "two"}, p); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(items[0].Dir); !os.IsNotExist(err) {
		t.Fatalf("expired record survived a write: %v", err)
	}
	if _, err := os.Stat(large); !os.IsNotExist(err) {
		t.Fatalf("oversized history survived a write: %v", err)
	}
	if n := undoCount(t); n != 1 {
		t.Fatalf("expected only the new record, got %d", n)
	}
}
