package cli

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTakeoverHelpDoesNotStartOrPairAgent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	var out bytes.Buffer
	if err := Main(context.Background(), []string{"takeover", "--help"}, "test", os.Stdin, &out, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Local session discovery") {
		t.Fatal("not routed to discovery")
	}
	if err := Main(context.Background(), []string{"--go", "takeover", "--help"}, "test", os.Stdin, &out, &out); err != nil {
		t.Fatal("native --go alias", err)
	}
	if err := Main(context.Background(), []string{"takeover", "workspace", "--help"}, "test", os.Stdin, &out, &out); err != nil || !strings.Contains(out.String(), "Read-only Git/worktree inspection") {
		t.Fatal("workspace inspection routing", err)
	}
	if err := Main(context.Background(), []string{"takeover", "session", "--help"}, "test", os.Stdin, &out, &out); err != nil || !strings.Contains(out.String(), "Verify one selected Codex") {
		t.Fatal("session binding routing", err)
	}
	if _, err := os.Stat(filepath.Join(home, ".remotearc")); !os.IsNotExist(err) {
		t.Fatal("discovery created pairing or execution state")
	}
}
