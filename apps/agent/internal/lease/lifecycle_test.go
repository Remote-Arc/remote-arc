package lease

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHeartbeatRefreshesOwnershipAndLossNeverRemovesReplacement(t *testing.T) {
	dir := t.TempDir()
	owner, err := Acquire(dir, "execution")
	if err != nil || owner == nil {
		t.Fatal(err)
	}
	defer owner.Release()
	path := filepath.Join(dir, "execution.lock")
	initial, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.After(Interval + 2*time.Second)
	for {
		current, err := os.Stat(path)
		if err == nil && current.ModTime().After(initial.ModTime()) {
			break
		}
		select {
		case <-owner.Lost():
			t.Fatal("healthy lease lost")
		case <-deadline:
			t.Fatal("heartbeat did not refresh lease")
		case <-time.After(10 * time.Millisecond):
		}
	}
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	select {
	case <-owner.Lost():
	case <-time.After(Interval + 2*time.Second):
		t.Fatal("deleted lease not detected")
	}
	if err = os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(path, "replacement"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	owner.Release()
	owner.Release()
	if _, err = os.Stat(filepath.Join(path, "replacement")); err != nil {
		t.Fatal("release damaged replacement owner", err)
	}
}

func TestLeaseRejectsInvalidParentAndDoesNotRemoveFreshFiles(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	if owner, err := Acquire(filepath.Join(file, "nested"), "execution"); owner != nil || err == nil {
		t.Fatalf("invalid parent accepted: %v %v", owner, err)
	}
	if owner, err := Acquire(root, "missing/nested"); owner != nil || err == nil {
		t.Fatalf("invalid role accepted: %v %v", owner, err)
	}
	path := filepath.Join(root, "execution.lock")
	if err := os.WriteFile(path, []byte("foreign"), 0600); err != nil {
		t.Fatal(err)
	}
	if owner, err := Acquire(root, "execution"); owner != nil || err != nil {
		t.Fatalf("fresh foreign lock replaced: %v %v", owner, err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "foreign" {
		t.Fatal("foreign lock damaged", err)
	}
}
