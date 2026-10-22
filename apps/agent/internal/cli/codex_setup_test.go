package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/codexsetup"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
)

func TestLocalSetupCommandsDoNotAcquireDeviceExecutionOrPair(t *testing.T) {
	home := t.TempDir()
	profile := filepath.Join(home, "codex-profile")
	t.Setenv("REMOTEARC_HOME", home)
	t.Setenv("CODEX_HOME", profile)
	device, err := lease.Acquire(filepath.Join(home, ".remotearc", "agent"), "execution")
	if err != nil || device == nil {
		t.Fatal(err)
	}
	defer device.Release()
	for _, prefix := range [][]string{{}, {"--go"}} {
		for _, action := range []string{"status", "uninstall"} {
			args := append(append([]string{}, prefix...), "setup", action, "--agent", "codex", "--workspace", home, "--codex-binary", filepath.Join(home, "missing-codex"))
			var out, diagnostics bytes.Buffer
			if err = Main(context.Background(), args, "test", os.Stdin, &out, &diagnostics); err != nil {
				t.Fatal(err)
			}
			var report codexsetup.Result
			if err = json.Unmarshal(out.Bytes(), &report); err != nil {
				t.Fatal(err)
			}
			if report.Status != "not_installed" || report.ToolsVerified || report.Action != action || diagnostics.Len() != 0 {
				t.Fatal("read-only setup action affected device execution")
			}
		}
	}
	if _, err = os.Stat(filepath.Join(home, ".remotearc", "config.json")); !os.IsNotExist(err) {
		t.Fatal("setup created pairing", err)
	}
	var out, diagnostics bytes.Buffer
	err = Main(context.Background(), []string{"setup", "install", "--workspace", home, "--codex-binary", filepath.Join(home, "missing-codex")}, "test", os.Stdin, &out, &diagnostics)
	if err == nil {
		t.Fatal("missing Codex accepted")
	}
	var report codexsetup.Result
	if e := json.Unmarshal(out.Bytes(), &report); e != nil || report.ErrorCode != "codex_not_found" {
		t.Fatal("missing-client receipt", e)
	}
}

func TestSetupActionFlagsAndWorkspaceIdentityOptions(t *testing.T) {
	var out bytes.Buffer
	for _, args := range [][]string{{"setup", "install", "--help"}, {"setup", "doctor", "-h"}, {"setup", "repair", "--help"}, {"setup", "uninstall", "--help"}} {
		if err := Main(context.Background(), args, "test", os.Stdin, &out, &out); err != nil {
			t.Fatal(err)
		}
	}
	for _, args := range [][]string{{"setup", "install"}, {"setup", "install", "--workspace", "relative"}, {"setup", "install", "--agent", "claude", "--workspace", t.TempDir()}, {"setup", "inspect", "--workspace", t.TempDir()}} {
		if err := Main(context.Background(), args, "test", os.Stdin, &out, &out); err == nil {
			t.Fatal("invalid/unsupported setup accepted", args)
		}
	}
	for _, args := range [][]string{{"--mcp-workspace-id=identity"}, {"--mcp", "--mcp-workspace=" + t.TempDir(), "--mcp-workspace-id="}} {
		if _, err := Parse(args); err == nil {
			t.Fatal("invalid workspace identity option", args)
		}
	}
	parsed, err := Parse([]string{"--mcp", "--mcp-workspace=" + t.TempDir(), "--mcp-workspace-id=directory-id"})
	if err != nil || parsed.MCPWorkspaceID != "directory-id" {
		t.Fatal(err)
	}
}
