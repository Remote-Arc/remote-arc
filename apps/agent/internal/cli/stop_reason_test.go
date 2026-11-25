package cli

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// A stopped Agent used to log only "Go agent stopped.", so a macOS logout
// could not be told apart from a Dashboard or local stop. The log now names
// who stopped it.
func TestLocalStopIsRecordedAsTheStopReason(t *testing.T) {
	handoffFixture(t)
	previousHook := startClientIntegrations
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
	t.Cleanup(func() { startClientIntegrations = previousHook })
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer relay.Close()
	c, _ := config.Load()
	c.Origin = relay.URL
	c.BackgroundEnabled = nil // keep the host's real service manager out of this test
	if e := config.Save(c); e != nil {
		t.Fatal(e)
	}
	dir := filepath.Join(config.Dir(), "agent")
	ctx, cancel := context.WithTimeout(context.Background(), launchSettleTimeout)
	defer cancel()
	done := make(chan error, 1)
	var out syncBuffer
	go func() { done <- Main(ctx, nil, "0.6.2-rc.5", os.Stdin, &out, &out) }()
	for ctx.Err() == nil {
		if b, e := os.ReadFile(filepath.Join(dir, "control.json")); e == nil && strings.Contains(string(b), `"0.6.2-rc.5"`) && lease.Active(dir, "execution") {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if _, e := control.Request(ctx, dir, "POST", "/stop"); e != nil {
		t.Fatalf("local stop: %v\n%s", e, out.String())
	}
	select {
	case e := <-done:
		if e != nil && !errors.Is(e, context.Canceled) {
			t.Fatalf("Agent ended with %v\n%s", e, out.String())
		}
	case <-time.After(30 * time.Second):
		t.Fatalf("Agent did not stop:\n%s", out.String())
	}
	events, e := os.ReadFile(filepath.Join(config.Dir(), "logs", "events.log"))
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(string(events), "Go agent stopped: stop requested by Remote Arc on this computer") {
		t.Fatalf("stop reason missing from the log:\n%s", events)
	}
}
