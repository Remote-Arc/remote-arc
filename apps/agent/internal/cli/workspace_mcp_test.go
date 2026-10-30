package cli

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceMCPOptionsRejectDeviceActions(t *testing.T) {
	root := t.TempDir()
	for _, option := range []string{"--developer", "--foreground", "--background", "--no-background", "--reset", "--status", "--stop", "--logs", "--agent", "--supervise", "--origin=https://example.com"} {
		if _, err := Parse([]string{"--mcp", "--mcp-workspace=" + root, option}); err == nil {
			t.Fatal("conflicting option accepted", option)
		}
	}
	for _, args := range [][]string{{"--mcp-workspace=" + root}, {"--mcp", "--mcp-workspace="}} {
		if _, err := Parse(args); err == nil {
			t.Fatal("invalid workspace options", args)
		}
	}
	parsed, err := Parse([]string{"--mcp", "--safe", "--mcp-workspace=" + root})
	if err != nil || parsed.MCPWorkspace != root {
		t.Fatal("workspace flag lost", err)
	}
}

func TestWorkspaceMCPDoesNotPairOrUseBroaderEnvironmentMode(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	t.Setenv("REMOTEARC_MODE", "full")
	t.Setenv("REMOTE_LINK_MODE", "developer")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var out, diagnostics bytes.Buffer
	if err := Main(ctx, []string{"--mcp", "--mcp-workspace=" + home}, "test", os.Stdin, &out, &diagnostics); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled MCP server did not return cancellation", err)
	}
	if out.Len() != 0 || !strings.Contains(diagnostics.String(), "read-only workspace") {
		t.Fatal("nonprotocol stdout or broader mode")
	}
	if _, err := os.Stat(filepath.Join(home, ".remotearc")); !os.IsNotExist(err) {
		t.Fatal("MCP paired or created device state", err)
	}
	if err := Main(ctx, []string{"--mcp", "--mcp-workspace=relative"}, "test", os.Stdin, &out, &diagnostics); err == nil {
		t.Fatal("relative root accepted")
	}
}
