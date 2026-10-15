package execution

import (
	"context"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"os"
	"path/filepath"
 "runtime"
	"strings"
	"testing"
)

func TestManagedProcessStopAndErrorExitReceipts(t *testing.T) {
	p := NewProcesses()
	defer p.Close()
	invalid := filepath.Join(t.TempDir(), "not-a-directory")
	if _, err := p.Run(context.Background(), "echo okay", invalid, 1000); err == nil {
		t.Fatal("nonexistent cwd was accepted")
	}
	if _, err := p.Background("echo okay", invalid, 0); err == nil {
		t.Fatal("background accepted nonexistent cwd")
	}
	if _, err := p.Background("echo okay", "", -1); err == nil {
		t.Fatal("negative duration accepted")
	}
	if _, err := p.Background("echo okay", "", 8*86400); err == nil {
		t.Fatal("unbounded background duration accepted")
	}
	failureCommand := "echo okay; exit 7"
	if runtime.GOOS == "windows" { failureCommand = "echo okay & exit /b 7" }
	r, err := p.Run(context.Background(), failureCommand, "", 4000)
	if err != nil || r["exit_code"] == 0 || strings.TrimSpace(r["stdout"].(string)) != "okay" {
		t.Fatalf("failed command receipt: %v %v", r, err)
	}
	bg, err := p.Background(helper(t, "wait"), "", 0)
	if err != nil {
		t.Fatal(err)
	}
	id := bg["process_id"].(string)
	stopped, err := p.Stop(id)
	if err != nil || stopped["stopped"] != true || stopped["already_exited"] != false {
		t.Fatalf("active stop result: %v %v", stopped, err)
	}
	output, err := p.Output(id)
	if err != nil || output["status"] != "exited" {
		t.Fatalf("stopped output inaccessible: %v %v", output, err)
	}
	again, err := p.Stop(id)
	if err != nil || again["already_exited"] != true {
		t.Fatalf("repeat stop should be safe: %v %v", again, err)
	}
}

func TestTextFileBoundaryPathsAndLargeFileReject(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	c := New("safe")
	defer c.Close()
	dirPath := filepath.Join(dir, "nested")
	if err := os.Mkdir(dirPath, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dirPath, "text.txt")
	if err := os.WriteFile(file, []byte("one\r\ntwo\r\nthree"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		offset, length int
		fragment       string
	}{
		{0, 0, "one"}, {1, 1, "two"}, {2, 1, "three"}, {-1, 1, "three"}, {999, 1, "0 lines"},
	} {
		reply, err := c.Call(context.Background(), "read_file", map[string]any{"path": file, "offset": tt.offset, "length": tt.length}, protocol.Policy{})
		if err != nil || !strings.Contains(reply.Content[0].Text, tt.fragment) {
			t.Fatalf("read offset=%d: %v %v", tt.offset, reply, err)
		}
	}
	if _, err := c.Call(context.Background(), "read_file", map[string]any{"path": dirPath}, protocol.Policy{}); err == nil {
		t.Fatal("directory accepted as text file")
	}
	tooLarge := filepath.Join(dir, "too-large.txt")
	f, err := os.Create(tooLarge)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(MaxTextBytes + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if _, err := c.Call(context.Background(), "read_file", map[string]any{"path": tooLarge}, protocol.Policy{}); err == nil {
		t.Fatal("oversized text file did not refuse")
	}
	for _, tt := range []struct {
		path  string
		depth int
	}{
		{dir, 0}, {dir, 20}, {dir, -3},
	} {
		got, err := c.Call(context.Background(), "list_directory", map[string]any{"path": tt.path, "depth": tt.depth}, protocol.Policy{})
		if err != nil || !strings.Contains(got.Content[0].Text, "[DIR] nested") {
			t.Fatalf("depth=%d: %v %v", tt.depth, got, err)
		}
	}
	if _, err := c.Call(context.Background(), "list_directory", map[string]any{"path": file}, protocol.Policy{}); err == nil {
		t.Fatal("plain file accepted as directory")
	}
}
