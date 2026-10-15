package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestParseSupportedOptionsAndNormalizedOrigin(t *testing.T) {
	flags := []string{"--go", "--safe", "--foreground", "--status", "--stop", "--reset", "--logs", "--mcp", "--help", "--version"}
	for _, flag := range flags {
		got, err := Parse([]string{flag})
		if err != nil {
			t.Fatalf("supported flag %s rejected: %v", flag, err)
		}
		if flag == "--help" && !got.Help || flag == "--version" && !got.Version {
			t.Fatalf("flag %s ignored: %#v", flag, got)
		}
	}
	for _, flag := range []string{"--developer", "--background", "--no-background", "--agent", "--supervise", "-h", "-v"} {
		if _, err := Parse([]string{flag}); err != nil {
			t.Fatalf("supported flag %s rejected: %v", flag, err)
		}
	}
	if got, err := Parse([]string{"--origin=https://mcp.remotearc.app/"}); err != nil || got.Origin != "https://mcp.remotearc.app" {
		t.Fatalf("unexpected normalized origin: %#v %v", got, err)
	}
	for _, args := range [][]string{{"--agent", "--supervise"}, {"--safe", "--developer"}, {"--origin=javascript:alert(1)"}, {"--foreground", "--background"}} {
		if _, err := Parse(args); err == nil {
			t.Fatalf("incompatible/unsafe options accepted: %v", args)
		}
	}
}

func TestCLIReadOnlyFlagsNeedNoPairing(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	for _, tc := range []struct {
		args     []string
		contains string
	}{
		{[]string{"--help"}, "Usage: remotelink"},
		{[]string{"-h"}, "--mcp"},
		{[]string{"--version"}, "v-test"},
		{[]string{"-v"}, "v-test"},
		{[]string{"--logs"}, "[]"},
		{[]string{"--status"}, "recovery"},
	} {
		var output, errors bytes.Buffer
		if err := Main(context.Background(), tc.args, "v-test", os.Stdin, &output, &errors); err != nil {
			t.Fatalf("args %v: %v", tc.args, err)
		}
		if !strings.Contains(output.String(), tc.contains) {
			t.Fatalf("%v produced %q instead of %q", tc.args, output.String(), tc.contains)
		}
		if tc.args[0] == "--status" {
			var state map[string]any
			if err := json.Unmarshal(output.Bytes(), &state); err != nil || state["agent"] == nil {
				t.Fatalf("unpaired status should be JSON: %v %s", err, output.String())
			}
		}
	}
}

func TestInvalidLocalMCPModeFailsBeforeDeviceIO(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	t.Setenv("REMOTEARC_MODE", "unsafe-unrecognized")
	var output bytes.Buffer
	err := Main(context.Background(), []string{"--mcp"}, "test", os.Stdin, &output, &output)
	if err == nil || !strings.Contains(err.Error(), "Invalid local MCP mode") {
		t.Fatalf("unrecognized MCP mode accepted: %v", err)
	}
}

func TestBrowserAuthorizationURLValidation(t *testing.T) {
	for _, address := range []string{
		"javascript:alert(1)", "file:///etc/passwd", "https://user:secret@example.com/",
		"http://", "https://", "mailto:someone@example.com", "not a url",
	} {
		if err := openBrowser(address); err == nil {
			t.Fatalf("unsafe authorization URL %q accepted", address)
		}
	}
}

func TestWaitAndPromptCancellationAndEOF(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := wait(ctx, time.Second); !errors.Is(err, context.Canceled) {
		t.Fatalf("wait ignored cancellation: %v", err)
	}
	if err := wait(context.Background(), time.Millisecond); err != nil {
		t.Fatalf("short wait failed: %v", err)
	}
	input, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	writer.Close()
	ask := terminalAsk(input, io.Discard)
	if answer, err := ask(context.Background(), "prompt"); answer != "" || !errors.Is(err, io.EOF) {
		t.Fatalf("closed input should return EOF: %q %v", answer, err)
	}
}

func TestBackgroundConfigDefaultAndOptIn(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	if enabled() {
		t.Fatal("missing config cannot enable recovery")
	}
	on := true
	if err := config.Save(config.Config{DeviceID: "test-device", DeviceToken: "test-token", Origin: "https://mcp.remotearc.app", Mode: "managed", BackgroundEnabled: &on}); err != nil {
		t.Fatal(err)
	}
	if !enabled() {
		t.Fatal("saved recovery opt-in ignored")
	}
}
