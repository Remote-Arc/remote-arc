package execution

import (
	"context"
	"fmt"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDirectoryListingAndBrowsingRemainBounded(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	fileDir := filepath.Join(dir, "files")
	browseDir := filepath.Join(dir, "dirs")
	for _, path := range []string{fileDir, browseDir} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 2001; i++ {
		path := filepath.Join(fileDir, fmt.Sprintf("entry-%04d.txt", i))
		if err := os.WriteFile(path, nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	c := New("safe")
	defer c.Close()
	files, err := c.Call(context.Background(), "list_directory", map[string]any{"path": fileDir}, protocol.Policy{})
	if err != nil || !strings.Contains(files.Content[0].Text, "truncated after 2000 entries") {
		t.Fatalf("unbounded directory list: %v %v", files, err)
	}
	for i := 0; i < 301; i++ {
		if err := os.Mkdir(filepath.Join(browseDir, fmt.Sprintf("folder-%03d", i)), 0700); err != nil {
			t.Fatal(err)
		}
	}
	browsed, err := c.Call(context.Background(), "browse_directories", map[string]any{"path": browseDir}, protocol.Policy{})
	if err != nil || !strings.Contains(browsed.Content[0].Text, "\"truncated\": true") {
		t.Fatalf("unbounded directory browser: %v %v", browsed, err)
	}
}
