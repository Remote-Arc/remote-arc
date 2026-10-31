package onboarding

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func isolatedClients(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	for _, name := range []string{"HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "REMOTEARC_HOME", "CODEX_HOME", "CLAUDE_CONFIG_DIR"} {
		t.Setenv(name, home)
	}
	t.Setenv("PATH", t.TempDir())
}

func TestDisappearedClientCannotClaimAutomaticSetupSuccess(t *testing.T) {
	isolatedClients(t)
	// Discovery is a snapshot: a package update can remove the candidate
	// before optional setup starts. Exercise both real setup entrypoints.
	for _, agent := range []string{"codex", "claude"} {
		client := Client{Agent: agent, Candidates: []Candidate{{Path: filepath.Join(t.TempDir(), agent+".exe"), Source: "path"}}}
		result := globalSetupWith(context.Background(), client, "install", "test", false)
		if result.Agent != agent || result.ToolsVerified || result.ConnectionVerified || result.Hint == "" || result.Status == "installed" || result.Status == "not_found" {
			t.Fatalf("disappeared %s returned a misleading receipt: %+v", agent, result)
		}
	}
	if runtime.GOOS == "linux" {
		t.Setenv("WSL_DISTRO_NAME", "fixture-distro")
		if !IsWSL() {
			t.Fatal("Windows-side install guidance would be hidden in WSL")
		}
	}
}

type rejectedOutput struct{ err error }

func (w rejectedOutput) Write([]byte) (int, error) { return 0, w.err }

func TestProjectSetupAndInspectionPropagateOutputFailures(t *testing.T) {
	isolatedClients(t)
	workspace := t.TempDir()
	for _, binary := range []string{"", filepath.Join(t.TempDir(), "missing-codex.exe")} {
		args := []string{"setup", "status", "--workspace", workspace}
		if binary != "" {
			args = append(args, "--codex-binary", binary)
		}
		var out bytes.Buffer
		if err := Run(context.Background(), args, "test", &out); err != nil {
			t.Fatal(err)
		}
		var receipt struct {
			Status        string `json:"status"`
			ToolsVerified bool   `json:"client_tools_verified"`
		}
		if err := json.Unmarshal(out.Bytes(), &receipt); err != nil || receipt.Status != "not_installed" || receipt.ToolsVerified {
			t.Fatalf("status ran or claimed a missing installation: %s (%v)", out.String(), err)
		}
	}
	closed := errors.New("fixture output closed")
	for _, args := range [][]string{{"setup", "inspect"}, {"setup", "status", "--workspace", workspace}} {
		if err := Run(context.Background(), args, "test", rejectedOutput{closed}); !errors.Is(err, closed) {
			t.Fatalf("%v swallowed output failure: %v", args, err)
		}
	}
	if err := Run(context.Background(), []string{"setup", "unknown"}, "test", io.Discard); err == nil {
		t.Fatal("unknown action accepted")
	}
	if _, err := os.Stat(filepath.Join(workspace, "config.toml")); !os.IsNotExist(err) {
		t.Fatal("read-only status changed the workspace", err)
	}
}

func TestPublicAutomaticCommandsHaveHonestMissingClientReceipts(t *testing.T) {
	isolatedClients(t)
	for _, skip := range []bool{false, true} {
		var out bytes.Buffer
		if err := encodeAutomatic(context.Background(), "all", "status", "test", skip, json.NewEncoder(&out)); err != nil {
			t.Fatal(err)
		}
		var result struct {
			Contract string            `json:"contract"`
			Clients  []AutomaticResult `json:"clients"`
		}
		if err := json.Unmarshal(out.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Contract != "remotearc.automatic-client-mcp/v1" || len(result.Clients) != 2 {
			t.Fatalf("missing receipt: %s", out.String())
		}
		for _, client := range result.Clients {
			if client.Status != "not_found" || client.ConnectionVerified || client.ToolsVerified {
				t.Fatalf("uninstalled client claimed ready: %+v", client)
			}
		}
	}
	if r := Automatic(context.Background(), "invalid-agent", "status", "test"); len(r) != 1 || r[0].Status != "setup_skipped" {
		t.Fatalf("invalid inspection not bounded: %+v", r)
	}
	notices := make(chan string, 2)
	stop := StartAutomatic(context.Background(), "test", func(_, message string) { notices <- message })
	defer stop()
	for range 2 {
		select {
		case message := <-notices:
			if !strings.Contains(message, "skipped") {
				t.Fatal(message)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("missing asynchronous receipt")
		}
	}
	for _, args := range [][]string{{"setup", "auto"}, {"setup", "install", "--global", "--skip-connector-check"}, {"setup", "doctor", "--global", "--agent", "all"}, {"setup", "inspect", "--help"}} {
		var out bytes.Buffer
		if err := Run(context.Background(), args, "test", &out); err != nil {
			t.Fatalf("%v: %v", args, err)
		}
		if out.Len() == 0 {
			t.Fatalf("no result for %v", args)
		}
	}
	for _, args := range [][]string{{"setup", "auto", "--workspace", "/not-used"}, {"setup", "status", "--global", "--agent", "unknown"}, {"setup", "doctor", "--global", "--skip-connector-check"}, {"setup", "install", "--skip-connector-check"}, {"setup", "install", "--agent", "claude"}, {"setup", "install", "--workspace", "relative"}, {"setup", "inspect", "--workspace", "/not-used"}} {
		if err := Run(context.Background(), args, "test", io.Discard); err == nil {
			t.Fatalf("conflicting setup accepted: %v", args)
		}
	}
}
