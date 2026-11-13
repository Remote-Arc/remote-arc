package execution

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// A drive root often contains folders the user cannot read ("System Volume
// Information"). They must be marked, not abort the whole listing.
func TestListDirectorySkipsUnreadableSubfolders(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("chmod-based permission fixture needs a non-root Unix user")
	}
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "locked"), 0700)
	os.MkdirAll(filepath.Join(root, "open", "inner"), 0700)
	os.WriteFile(filepath.Join(root, "file.txt"), []byte("x"), 0600)
	os.Chmod(filepath.Join(root, "locked"), 0)
	defer os.Chmod(filepath.Join(root, "locked"), 0700)
	out, err := listDirectory(root, 2, protocol.Policy{})
	if err != nil {
		t.Fatalf("one unreadable subfolder failed the listing: %v", err)
	}
	for _, want := range []string{"[DIR] locked", "(not readable:", "[DIR] open", "[DIR] inner", "[FILE] file.txt", "1 subfolder(s) could not be read"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in:\n%s", want, out)
		}
	}
	os.Chmod(filepath.Join(root, "locked"), 0700)
	if _, err := listDirectory(filepath.Join(root, "missing"), 1, protocol.Policy{}); err == nil {
		t.Fatal("a missing requested folder must still fail")
	}
}
