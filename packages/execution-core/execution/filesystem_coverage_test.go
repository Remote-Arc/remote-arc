package execution

import (
	"context"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBinaryMediaRecognitionAcrossSignaturesAndExtensions(t *testing.T) {
	cases := []struct {
		file     string
		data     []byte
		expected string
	}{
		{"upload", []byte{137, 80, 78, 71, 13, 10, 26, 10}, "image/png"},
		{"upload", []byte{255, 216, 255, 1, 2}, "image/jpeg"},
		{"upload", []byte("GIF87a..."), "image/gif"},
		{"upload", []byte("GIF89a..."), "image/gif"},
		{"upload", []byte("%PDF-1.7"), "application/pdf"},
		{"upload", []byte{31, 139, 0, 0}, "application/gzip"},
		{"upload", []byte{0, 97, 115, 109, 0}, "application/wasm"},
		{"upload", []byte("RIFF0123WEBP1234"), "image/webp"},
		{"upload", []byte{80, 75, 3, 4, 0}, "application/zip"},
		{"upload", []byte{80, 75, 5, 6}, "application/zip"},
		{"upload", []byte{80, 75, 7, 8}, "application/zip"},
		{"plain.docx", nil, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
		{"plain.xlsx", nil, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
		{"plain.pptx", nil, "application/vnd.openxmlformats-officedocument.presentationml.presentation"},
		{"plain.PNG", nil, "image/png"},
		{"plain.JPG", nil, "image/jpeg"},
		{"plain.jpeg", nil, "image/jpeg"},
		{"plain.gif", nil, "image/gif"},
		{"plain.webp", nil, "image/webp"},
		{"plain.pdf", nil, "application/pdf"},
		{"plain.zip", nil, "application/zip"},
		{"plain.gz", nil, "application/gzip"},
		{"plain.wasm", nil, "application/wasm"},
		{"unknown", nil, "application/octet-stream"},
	}
	for _, tt := range cases {
		t.Run(tt.file+"-"+tt.expected, func(t *testing.T) {
			if got := mimeType(tt.file, tt.data); got != tt.expected {
				t.Fatalf("mimeType(%s) = %s; want %s", tt.file, got, tt.expected)
			}
		})
	}
	for _, tc := range []struct {
		n    int64
		want string
	}{
		{0, "0 B"}, {1023, "1023 B"}, {1024, "1.0 KB"}, {1024 * 1024, "1.0 MB"},
	} {
		if got := sizeString(tc.n); got != tc.want {
			t.Fatalf("sizeString(%d)=%q", tc.n, got)
		}
	}
}
func TestBrowseDirectoryDoesNotLeakProtectedPathsOrFollowSymlinks(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	root := filepath.Join(dir, "root")
	for _, p := range []string{root, filepath.Join(root, "subdir"), filepath.Join(root, "nested")} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("text"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, ".ssh"), 0700); err != nil {
		t.Fatal(err)
	}
	symlink := filepath.Join(root, "escape")
	if err := os.Symlink(outside, symlink); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	c := New("safe")
	defer c.Close()
	p := protocol.Policy{WorkspaceRoots: []string{root}, TaskWorkspaceRoot: root, SensitivePaths: []string{filepath.Join(root, ".ssh")}}
	resp, err := c.Call(context.Background(), "browse_directories", map[string]any{"path": root}, p)
	if err != nil {
		t.Fatal(err)
	}
	got := resp.Content[0].Text
	if !strings.Contains(got, "subdir") || !strings.Contains(got, "nested") || strings.Contains(got, "escape") || strings.Contains(got, ".ssh") {
		t.Fatalf("browser exposed protected entries or dropped allowed ones: %s", got)
	}
	if !strings.Contains(got, "protected_entries_omitted") {
		t.Fatal("missing omission accounting:", got)
	}
	if _, err := c.Call(context.Background(), "browse_directories", map[string]any{"path": filepath.Join(root, "note.txt")}, p); err == nil {
		t.Fatal("file was browsed as directory")
	}
	if _, err := c.Call(context.Background(), "browse_directories", map[string]any{"path": filepath.Join(root, "does-not-exist")}, p); err == nil {
		t.Fatal("missing directory did not fail")
	}
	if _, err := c.Call(context.Background(), "browse_directories", map[string]any{"path": symlink}, p); err == nil {
		t.Fatal("symlink escape was allowed")
	}
}
func TestBinaryBoundsAndAppendWritePermissions(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	t.Setenv("REMOTEARC_FILE_DURABILITY", "atomic")
	c := New("managed")
	defer c.Close()
	file := filepath.Join(dir, "data.bin")
	if err := os.WriteFile(file, []byte{1, 2, 3, 4}, 0600); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		offset, length int
		bad            bool
	}{
		{0, 0, true}, {0, -1, true}, {0, 262145, true}, {0, 262144, false}, {99, 4, false}, {-1, 3, false},
	} {
		_, err := c.Call(context.Background(), "read_binary_file", map[string]any{"path": file, "offset": tt.offset, "length": tt.length}, protocol.Policy{})
		if (err != nil) != tt.bad {
			t.Fatalf("binary offset=%d length=%d returned %v", tt.offset, tt.length, err)
		}
	}
	target := filepath.Join(dir, "append", "new.txt")
	for _, text := range []string{"one", "two"} {
		_, err := c.Call(context.Background(), "write_file", map[string]any{"path": target, "content": text, "mode": "append"}, protocol.Policy{})
		if err != nil {
			t.Fatal(err)
		}
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != "onetwo" {
		t.Fatalf("append result %q: %v", got, err)
	}
	info, err := c.Call(context.Background(), "get_file_info", map[string]any{"path": dir}, protocol.Policy{})
	if err != nil || !strings.Contains(info.Content[0].Text, "directory") {
		t.Fatalf("directory metadata %v %v", info, err)
	}
	if err := os.Symlink(target, filepath.Join(dir, "file-link")); err == nil {
		meta, err := c.Call(context.Background(), "get_file_info", map[string]any{"path": filepath.Join(dir, "file-link")}, protocol.Policy{})
		// The policy enforcer resolves in-scope symlinks before metadata lookup.
		if err != nil || !strings.Contains(meta.Content[0].Text, "\"type\": \"file\"") {
			t.Fatalf("symlink info %v %v", meta, err)
		}
	}
}
