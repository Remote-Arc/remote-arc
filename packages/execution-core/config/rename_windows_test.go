//go:build windows

package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A reader holding the target open blocks a Windows rename over it. The write
// waits for the reader instead of failing, which would stop an Agent starting.
func TestAtomicWriteWaitsForReaderOnWindows(t *testing.T) {
	path := filepath.Join(t.TempDir(), "control.json")
	if e := os.WriteFile(path, []byte("old"), 0600); e != nil {
		t.Fatal(e)
	}
	reader, e := os.Open(path)
	if e != nil {
		t.Fatal(e)
	}
	timer := time.AfterFunc(100*time.Millisecond, func() { reader.Close() })
	defer timer.Stop()
	if e = AtomicWrite(path, []byte("new"), 0600); e != nil {
		t.Fatal(e)
	}
	if b, e := os.ReadFile(path); e != nil || string(b) != "new" {
		t.Fatalf("content=%q err=%v", b, e)
	}
}
