package agent

import (
	"context"
	"runtime"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func hasTool(a *Agent, name string) bool {
	for _, tool := range a.hello(context.Background())["tools"].([]string) {
		if tool == name {
			return true
		}
	}
	return false
}

// Desktop control reaches as far as the terminal, so it follows the same
// mode and pause gates, and is advertised only where the computer can serve
// it (Windows, or Linux with an X11 display).
func TestDesktopControlFollowsModePauseAndPlatform(t *testing.T) {
	for _, mode := range []string{"safe", "developer", "managed"} {
		t.Run(mode, func(t *testing.T) {
			t.Setenv("REMOTEARC_HOME", t.TempDir())
			cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", Mode: mode}
			if e := config.Save(cfg); e != nil {
				t.Fatal(e)
			}
			a := New(cfg, "test", false, nil)
			defer a.Browser.Close()
			if mode == "developer" {
				a.Core.Mode = "developer"
			}
			advertised := hasTool(a, "desktop_snapshot")
			if mode != "managed" || !a.Desktop.Available() {
				if advertised {
					t.Fatalf("%s mode on %s advertised desktop control", mode, runtime.GOOS)
				}
				_, e := a.dispatch(context.Background(), protocol.Call{Tool: "desktop_act", Arguments: map[string]any{}, Policy: protocol.Policy{DesktopControlEnabled: true}}, nil)
				if e == nil || !strings.HasPrefix(e.Error(), "DESKTOP_UNSUPPORTED:") {
					t.Fatalf("want DESKTOP_UNSUPPORTED, got %v", e)
				}
				return
			}
			if !advertised {
				t.Fatal("an Agent in terminal mode on a computer that can serve it advertises desktop control")
			}
			// The owner's setting arrives with every call; without it nothing runs.
			_, e := a.dispatch(context.Background(), protocol.Call{Tool: "desktop_snapshot", Arguments: map[string]any{}}, nil)
			if e == nil || !strings.HasPrefix(e.Error(), "DESKTOP_CONTROL_DISABLED:") {
				t.Fatalf("want DESKTOP_CONTROL_DISABLED, got %v", e)
			}
		})
	}
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", Mode: "managed", ExecutionPaused: true}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	wake := NewWake(cfg, "test", nil)
	if wake.Desktop != nil || hasTool(wake, "desktop_snapshot") {
		t.Fatal("a wake-only Agent has no desktop control")
	}
	if _, e := wake.dispatch(context.Background(), protocol.Call{Tool: "desktop_snapshot", Arguments: map[string]any{}, Policy: protocol.Policy{DesktopControlEnabled: true}}, nil); e == nil || !strings.Contains(e.Error(), "paused") {
		t.Fatalf("a paused Agent ran a desktop tool: %v", e)
	}
}
