package policy

import (
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"os"
	"path/filepath"
	"testing"
)

func TestCanonicalRejectsSymlinkCycle(t *testing.T) {
	dir := t.TempDir()
	link := filepath.Join(dir, "loop")
	if err := os.Symlink(link, link); err != nil {
		t.Skipf("cannot create symlink: %v", err)
	}
	if _, err := Canonical(link); err == nil {
		t.Fatal("symlink cycle accepted")
	}
	if _, err := Enforce(link, protocol.Policy{}, false); err == nil {
		t.Fatal("policy accepted symlink cycle")
	}
}
func TestSensitiveCustomRootsAndTaskPrefixEscape(t *testing.T) {
	root := t.TempDir()
	hidden := filepath.Join(root, "secrets")
	os.Mkdir(hidden, 0700)
	filename := filepath.Join(hidden, "key.txt")
	os.WriteFile(filename, []byte("secret"), 0600)
	p := protocol.Policy{WorkspaceRoots: []string{root}, SensitivePaths: []string{hidden}}
	if _, err := Enforce(filename, p, false); err == nil {
		t.Fatal("custom sensitive root leaked")
	}
	p.SensitiveAllowPaths = []string{filename}
	if _, err := Enforce(filename, p, false); err != nil {
		t.Fatalf("narrow sensitive exception refused: %v", err)
	}
	p.TaskWorkspaceRoot = filepath.Join(root, "task")
	if _, err := Enforce(filepath.Join(root, "task-escape", "file"), p, true); err == nil {
		t.Fatal("task workspace prefix bypass")
	}
}
