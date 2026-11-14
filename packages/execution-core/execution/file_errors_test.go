package execution

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// The Relay reads the leading code; the platform's own text, path included,
// stays after it so the AI can still see what went wrong.
func TestCallPrefixesFileErrorsWithFixedCode(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(file, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(dir, "missing.txt")
	core := &Core{Mode: "safe"}
	for _, tc := range []struct {
		tool string
		path string
		code string
	}{
		{"read_file", missing, "PATH_NOT_FOUND"},
		{"get_file_info", missing, "PATH_NOT_FOUND"},
		{"list_directory", filepath.Join(dir, "gone"), "PATH_NOT_FOUND"},
		{"read_binary_file", missing, "PATH_NOT_FOUND"},
	} {
		_, err := core.Call(context.Background(), tc.tool, map[string]any{"path": tc.path}, protocol.Policy{})
		if err == nil {
			t.Fatalf("%s %s: expected an error", tc.tool, tc.path)
		}
		if !strings.HasPrefix(err.Error(), tc.code+": ") {
			t.Fatalf("%s: got %q, want prefix %s", tc.tool, err.Error(), tc.code)
		}
		if !strings.Contains(err.Error(), "missing.txt") && !strings.Contains(err.Error(), "gone") {
			t.Fatalf("%s: original message lost: %q", tc.tool, err.Error())
		}
		if !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("%s: cause no longer unwraps to fs.ErrNotExist", tc.tool)
		}
	}
}

func TestFileErrorCode(t *testing.T) {
	notDir := &fs.PathError{Op: "open", Path: "/a/file.txt/child", Err: syscall.ENOTDIR}
	// Windows has no separate "not a directory" error: syscall.ENOTDIR is
	// ERROR_PATH_NOT_FOUND there, so the honest code is PATH_NOT_FOUND.
	notDirCode := "PATH_TYPE_MISMATCH: "
	if runtime.GOOS == "windows" {
		notDirCode = "PATH_NOT_FOUND: "
	}
	ownCheck := &fs.PathError{Op: "chdir", Path: "/a/file.txt", Err: errNotADirectory}
	for _, tc := range []struct {
		err  error
		want string
	}{
		{&fs.PathError{Op: "lstat", Path: "/a/missing", Err: fs.ErrNotExist}, "PATH_NOT_FOUND: lstat /a/missing: file does not exist"},
		{&fs.PathError{Op: "open", Path: "/root/x", Err: fs.ErrPermission}, "FILE_PERMISSION_DENIED: open /root/x: permission denied"},
		{&os.LinkError{Op: "rename", Old: "/a", New: "/b", Err: fs.ErrNotExist}, "PATH_NOT_FOUND: rename /a /b: file does not exist"},
		{notDir, notDirCode + notDir.Error()},
		{ownCheck, "PATH_TYPE_MISMATCH: chdir /a/file.txt: not a directory"},
	} {
		if got := fileErrorCode(tc.err); got == nil || got.Error() != tc.want {
			t.Fatalf("fileErrorCode(%q) = %v, want %q", tc.err, got, tc.want)
		}
	}
	// Only os file errors get a code: coded, policy and plain errors are untouched.
	for _, err := range []error{
		nil,
		errors.New("Blocked by Remote Arc Trusted Write Locations: /a"),
		ErrDeviceBusy,
		errors.New("Path is not a file: /a"),
		&fs.PathError{Op: "read", Path: "/a", Err: errors.New("input/output error")},
	} {
		if got := fileErrorCode(err); got != err {
			t.Fatalf("fileErrorCode(%v) = %v, want it unchanged", err, got)
		}
	}
	if runtime.GOOS != "windows" {
		if _, err := os.ReadFile(filepath.Join(t.TempDir(), "x", "y")); !strings.HasPrefix(fileErrorCode(err).Error(), "PATH_NOT_FOUND: ") {
			t.Fatalf("a real os error was not coded: %v", err)
		}
	}
}

// Windows sets SysProcAttr on every command, which turns off Go's own working
// directory check, so a missing cwd must be checked before the process starts.
func TestStartProcessMissingCwdIsPathError(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	p := NewProcesses()
	defer p.Close()
	for cwd, code := range map[string]string{filepath.Join(dir, "gone"): "PATH_NOT_FOUND", file: "PATH_TYPE_MISMATCH"} {
		_, err := p.Run(context.Background(), "echo hi", cwd, 1000)
		if err == nil || !strings.HasPrefix(fileErrorCode(err).Error(), code+": chdir ") {
			t.Fatalf("cwd %s: got %v, want %s", cwd, err, code)
		}
		if _, err = p.Background("echo hi", cwd, 10); err == nil || !strings.HasPrefix(fileErrorCode(err).Error(), code+": chdir ") {
			t.Fatalf("background cwd %s: got %v, want %s", cwd, err, code)
		}
	}
}
