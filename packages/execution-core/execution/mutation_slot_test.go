package execution

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func mutationFixture(t *testing.T) (*Core, string, protocol.Policy) {
	t.Helper()
	root := t.TempDir()
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(root, "undo"))
	t.Setenv("REMOTEARC_FILE_DURABILITY", "atomic")
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "atomic")
	c := New("full")
	t.Cleanup(c.Close)
	return c, root, protocol.Policy{WorkspaceRoots: []string{root}}
}

// stallMutation holds the slot the way an in-flight write does, for example
// one blocked on a Windows file lock, until the returned function runs.
func stallMutation(t *testing.T, c *Core) func() {
	t.Helper()
	c.mutation <- struct{}{}
	released := false
	release := func() {
		if !released {
			released = true
			<-c.mutation
		}
	}
	t.Cleanup(release)
	return release
}

func undoCount(t *testing.T) int {
	t.Helper()
	items, err := undoCandidates()
	if err != nil {
		t.Fatal(err)
	}
	return len(items)
}

func TestQueuedWriteBehindStalledWriteIsRefusedAndNeverRuns(t *testing.T) {
	c, root, p := mutationFixture(t)
	release := stallMutation(t, c)
	queued := filepath.Join(root, "queued.txt")
	edited := filepath.Join(root, "edited.txt")
	if err := os.WriteFile(edited, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	calls := []struct {
		tool string
		args map[string]any
	}{
		{"write_file", map[string]any{"path": queued, "content": "late"}},
		{"edit_block", map[string]any{"file_path": edited, "old_string": "before", "new_string": "late"}},
		{"undo_last_change", nil},
	}
	for _, call := range calls {
		// The Relay would stop waiting 300 ms from now plus the reply margin.
		ctx, cancel := context.WithTimeout(context.Background(), mutationReplyMargin+300*time.Millisecond)
		started := time.Now()
		_, err := c.Call(ctx, call.tool, call.args, p)
		waited := time.Since(started)
		cancel()
		if !errors.Is(err, ErrDeviceBusy) || !strings.HasPrefix(err.Error(), "DEVICE_BUSY:") {
			t.Fatalf("%s behind a stalled write: %v", call.tool, err)
		}
		if waited < 250*time.Millisecond || waited > 3*time.Second {
			t.Fatalf("%s gave up after %s, not at the reply margin", call.tool, waited)
		}
	}
	// The stalled write finishes; a refused call must not run afterwards.
	release()
	if _, err := c.Call(context.Background(), "write_file", map[string]any{"path": filepath.Join(root, "next.txt"), "content": "next"}, p); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	if _, err := os.Stat(queued); !os.IsNotExist(err) {
		t.Fatal("refused write_file created its file after the stall cleared")
	}
	if b, _ := os.ReadFile(edited); string(b) != "before" {
		t.Fatalf("refused edit_block changed its file: %q", b)
	}
	if n := undoCount(t); n != 1 {
		t.Fatalf("refused calls left Undo records: %d", n)
	}
}

func TestQueuedWriteGivesUpWhenItsCallIsCancelled(t *testing.T) {
	c, root, p := mutationFixture(t)
	stallMutation(t, c)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	target := filepath.Join(root, "cancelled.txt")
	go func() {
		_, err := c.Call(ctx, "write_file", map[string]any{"path": target, "content": "late"}, p)
		done <- err
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, ErrDeviceBusy) {
			t.Fatalf("cancelled queued write: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled queued write kept waiting")
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("cancelled write changed the file")
	}
}

func TestWriteWithTooLittleTimeLeftIsNotStarted(t *testing.T) {
	c, root, p := mutationFixture(t)
	target := filepath.Join(root, "late.txt")
	if err := os.WriteFile(target, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	// The slot is free, but the reply could not reach the Relay in time.
	ctx, cancel := context.WithTimeout(context.Background(), mutationReplyMargin-time.Second)
	defer cancel()
	if _, err := c.Call(ctx, "write_file", map[string]any{"path": target, "content": "late"}, p); !errors.Is(err, ErrDeviceBusy) {
		t.Fatalf("late write: %v", err)
	}
	if b, _ := os.ReadFile(target); string(b) != "before" {
		t.Fatalf("late write changed the file: %q", b)
	}
	if n := undoCount(t); n != 0 {
		t.Fatalf("late write left an Undo record: %d", n)
	}
}

func TestWritesStillQueueAndRunWithinTheirDeadline(t *testing.T) {
	c, root, p := mutationFixture(t)
	target := filepath.Join(root, "normal.txt")
	// No deadline, as from the local MCP server.
	r := payload(t, call(t, c, "write_file", map[string]any{"path": target, "content": "one"}, p))
	if r["undo_available"] != true {
		t.Fatalf("write without a deadline: %v", r)
	}
	// A Relay deadline that leaves time to finish.
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if _, err := c.Call(ctx, "edit_block", map[string]any{"file_path": target, "old_string": "one", "new_string": "two"}, p); err != nil {
		t.Fatal(err)
	}
	// A write queued behind a short stall waits for it and then runs.
	release := stallMutation(t, c)
	done := make(chan error, 1)
	go func() {
		_, err := c.Call(ctx, "write_file", map[string]any{"path": target, "content": "three"}, p)
		done <- err
	}()
	time.Sleep(100 * time.Millisecond)
	select {
	case err := <-done:
		t.Fatalf("write ran while another held the slot: %v", err)
	default:
	}
	release()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(target); string(b) != "three" {
		t.Fatalf("queued write result: %q", b)
	}
	if n := undoCount(t); n != 3 {
		t.Fatalf("expected 3 Undo records, got %d", n)
	}
	call(t, c, "undo_last_change", nil, p)
	if b, _ := os.ReadFile(target); string(b) != "two" {
		t.Fatalf("Undo after queued write: %q", b)
	}
}
