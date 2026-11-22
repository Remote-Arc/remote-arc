package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// browser_runner is part of the Go Agent: it shares the device mode gate and
// the pause gate with every other execution tool.
func TestBrowserRunnerFollowsDeviceModeAndPause(t *testing.T) {
	for _, tc := range []struct {
		mode, want string
	}{
		{"safe", "terminal mode"},
		{"developer", "terminal mode"},
		{"managed", "No browser_runner session"},
	} {
		t.Run(tc.mode, func(t *testing.T) {
			t.Setenv("REMOTEARC_HOME", t.TempDir())
			cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", Mode: tc.mode}
			if e := config.Save(cfg); e != nil {
				t.Fatal(e)
			}
			a := New(cfg, "test", false, nil)
			defer a.Browser.Close()
			if tc.mode == "developer" {
				a.Core.Mode = "developer"
			}
			_, e := a.dispatch(context.Background(), protocol.Call{Tool: "browser_runner_snapshot", Arguments: map[string]any{"session_id": "missing"}}, nil)
			if e == nil || !strings.Contains(e.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, e)
			}
			if tc.mode != "managed" {
				for _, name := range a.hello(context.Background())["tools"].([]string) {
					if strings.HasPrefix(name, "browser_") {
						t.Fatalf("%s mode advertised %s", tc.mode, name)
					}
				}
			}
		})
	}
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", Mode: "managed", ExecutionPaused: true}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	wake := NewWake(cfg, "test", nil)
	if wake.Browser != nil {
		t.Fatal("wake-only Agent must not own a browser")
	}
	if _, e := wake.dispatch(context.Background(), protocol.Call{Tool: "browser_runner_start", Arguments: map[string]any{"task_id": "x"}}, nil); e == nil || !strings.Contains(e.Error(), "paused") {
		t.Fatalf("paused Agent ran a browser tool: %v", e)
	}
}

func TestRunnerBypassWarnsWithoutBlockingProcess(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.invalid", Mode: "managed"}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "test", false, nil)
	defer a.Browser.Close()
	defer a.Core.Close()
	for _, enabled := range []bool{true, false} {
		result, e := a.dispatch(context.Background(), protocol.Call{Tool: "start_process", Arguments: map[string]any{"command": "echo playwright", "timeout_ms": 5000}, Policy: protocol.Policy{BrowserRunnerEnabled: enabled}}, nil)
		if e != nil {
			t.Fatal(e)
		}
		b, _ := json.Marshal(result)
		var returned protocol.Result
		if e := json.Unmarshal(b, &returned); e != nil {
			t.Fatal(e)
		}
		if len(returned.Content) == 0 {
			t.Fatal("no process result")
		}
		var value map[string]any
		if e := json.Unmarshal([]byte(returned.Content[0].Text), &value); e != nil {
			t.Fatal(e)
		}
		if !strings.Contains(value["stdout"].(string), "playwright") {
			t.Fatal("command was blocked", value)
		}
		if enabled && value["warning"] != "RUNNER_BYPASS" {
			t.Fatal("warning missing", value)
		}
		if !enabled && value["warning"] != nil {
			t.Fatal("disabled Runner emitted warning", value)
		}
	}
}
