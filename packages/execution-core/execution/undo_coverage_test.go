package execution

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestUndoCandidateValidationAndExpiry(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "snapshots")
	t.Setenv("REMOTEARC_UNDO_ROOT", root)
	if err := os.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	save := func(name string, m manifest, invalid bool) {
		t.Helper()
		location := filepath.Join(root, name)
		if err := os.Mkdir(location, 0700); err != nil {
			t.Fatal(err)
		}
		data, _ := json.Marshal(m)
		if invalid {
			data = []byte("{")
		}
		if err := os.WriteFile(filepath.Join(location, "manifest.json"), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	makeM := func(id string, age time.Duration) manifest {
		return manifest{ID: id, Created: now.Add(-age).Format(time.RFC3339Nano), Target: filepath.Join(dir, "file.txt"), Bytes: 1}
	}
	save("valid", makeM("valid", time.Second), false)
	save("stale", makeM("stale", 8*24*time.Hour), false)
	save("mismatched", makeM("other", time.Second), false)
	save("negative", manifest{ID: "negative", Created: now.Format(time.RFC3339Nano), Target: filepath.Join(dir, "f"), Bytes: -1}, false)
	save("missing", manifest{ID: "missing", Created: now.Format(time.RFC3339Nano), Bytes: 1}, false)
	save("bad-json", makeM("bad-json", time.Second), true)
	save("bad-date", manifest{ID: "bad-date", Created: "not-a-date", Target: filepath.Join(dir, "f"), Bytes: 1}, false)
	if err := os.WriteFile(filepath.Join(root, "not-a-directory"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "valid"), filepath.Join(root, "symlink")); err != nil {
		t.Skip(err)
	}
	candidates, err := undoCandidates()
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].Manifest.ID != "valid" {
		t.Fatalf("invalid receipts leaked: %+v", candidates)
	}
	if _, err := os.Stat(filepath.Join(root, "stale")); !os.IsNotExist(err) {
		t.Fatalf("expired receipt remained: %v", err)
	}
	// Store must gracefully handle an unusable root; never weaken validation.
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(root, "not-a-directory"))
	if _, err := undoCandidates(); err == nil {
		t.Fatal("unusable snapshot store should fail closed")
	}
}

func TestUndoReceiptStatusesForReadyConflictMissingAndLegacy(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(dir, "undo"))
	target := filepath.Join(dir, "tracked.txt")
	if err := os.WriteFile(target, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	snap, err := createSnapshot("edit_block", target)
	if err != nil || snap == nil {
		t.Fatalf("snapshot %v %v", snap, err)
	}
	if err := os.WriteFile(target, []byte("after"), 0600); err != nil {
		t.Fatal(err)
	}
	if !finalizeSnapshot(snap) {
		t.Fatal("valid snapshot not finalized")
	}
	for _, tc := range []struct {
		label, status string
		mutate        func()
	}{
		{"ready", "ready", func() {}},
		{"conflict", "conflict", func() { os.WriteFile(target, []byte("newer edits"), 0600) }},
		{"missing", "missing", func() { os.Remove(target) }},
		{"legacy", "legacy", func() { snap.Manifest.Hash = "" }},
	} {
		t.Run(tc.label, func(t *testing.T) {
			tc.mutate()
			m, err := listUndoFiltered([]snapshot{*snap}, 1)
			if err != nil || len(m) != 1 || m[0]["status"] != tc.status {
				t.Fatalf("receipt %s: %+v / %v", tc.label, m, err)
			}
			if m[0]["can_undo"] != (tc.status == "ready") {
				t.Fatal("unsafe undo marked as available")
			}
		})
	}
	if _, err := listUndoFiltered([]snapshot{*snap}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreUndoSnapshot(*snap); err == nil {
		t.Fatal("legacy snapshot was automatically restored")
	}
}

func TestUndoRestoreResistsNewerWorkAndMissingEvidence(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(dir, "undo"))
	target := filepath.Join(dir, "file.txt")
	os.WriteFile(target, []byte("original"), 0600)
	snap, err := createSnapshot("edit_block", target)
	if err != nil || snap == nil {
		t.Fatal(err)
	}
	os.WriteFile(target, []byte("changed"), 0600)
	if !finalizeSnapshot(snap) {
		t.Fatal("snapshot not finalized")
	}
	if err := os.Remove(filepath.Join(snap.Dir, "content.bin")); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreUndoSnapshot(*snap); err == nil {
		t.Fatal("missing original content should be refused")
	}
	if data, _ := os.ReadFile(target); string(data) != "changed" {
		t.Fatal("missing evidence mutated target")
	}
	if _, err := restoreUndo("nonexistent"); err == nil {
		t.Fatal("nonexistent undo ID accepted")
	}
	if err := os.WriteFile(target, []byte("changed again"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := restoreUndo(snap.Manifest.ID); err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatalf("conflict not detected: %v", err)
	}
}

func TestUndoBudgetPrunesOldestReceipts(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "snapshots")
	t.Setenv("REMOTEARC_UNDO_ROOT", root)
	now := time.Now().UTC()
	for i, tt := range []struct {
		id   string
		age  time.Duration
		size int64
	}{
		{"recent", time.Second, 1},
		{"old-large", 2 * time.Second, 201 * 1024 * 1024},
	} {
		_ = i
		path := filepath.Join(root, tt.id)
		if err := os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
		m := manifest{ID: tt.id, Created: now.Add(-tt.age).Format(time.RFC3339Nano), Tool: "test", Target: filepath.Join(dir, "test"), Bytes: tt.size}
		data, _ := json.Marshal(m)
		if err := os.WriteFile(filepath.Join(path, "manifest.json"), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	items, err := undoCandidates()
	if err != nil || len(items) != 1 || items[0].Manifest.ID != "recent" {
		t.Fatalf("oldest receipt not pruned: %+v %v", items, err)
	}
	if _, err := os.Stat(filepath.Join(root, "old-large")); !os.IsNotExist(err) {
		t.Fatalf("pruned snapshot still present: %v", err)
	}
}
func TestSnapshotSkipsNonRegularAndOversizedSources(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(dir, "undo"))
	snap, err := createSnapshot("edit_block", dir)
	if err != nil || snap != nil {
		t.Fatalf("directory was snapshot: %#v %v", snap, err)
	}
	big := filepath.Join(dir, "big")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(MaxTextBytes + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	snap, err = createSnapshot("edit_block", big)
	if err != nil || snap != nil {
		t.Fatalf("oversized content was snapshot: %#v %v", snap, err)
	}
}
