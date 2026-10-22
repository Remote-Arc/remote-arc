package browserrunner

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A first start of a task profile can be slow (first-run setup, antivirus
// scanning on Windows); CI runners hit 20 s on cold starts.
func TestStartupWaitGivesANewProfileLonger(t *testing.T) {
	profile := t.TempDir()
	if got := startupWait(filepath.Join(profile, "new")); got != 60*time.Second {
		t.Fatalf("new profile: %s", got)
	}
	if e := os.WriteFile(filepath.Join(profile, "Local State"), []byte("{}"), 0600); e != nil {
		t.Fatal(e)
	}
	if got := startupWait(profile); got != 30*time.Second {
		t.Fatalf("profile that started before: %s", got)
	}
}
