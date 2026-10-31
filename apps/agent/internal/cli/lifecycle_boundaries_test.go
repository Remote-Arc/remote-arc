package cli

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func withoutAutomaticSetup(t *testing.T) {
	t.Helper()
	before := startClientIntegrations
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
	t.Cleanup(func() { startClientIntegrations = before })
}

func TestStopAndResetPreservePairingUntilOwnerHasDrained(t *testing.T) {
	for _, flag := range []string{"--stop", "--reset"} {
		t.Run(flag, func(t *testing.T) {
			handoffFixture(t)
			old := startOldAgent(t, "test", true)
			if err := Main(context.Background(), []string{flag}, "test", os.Stdin, io.Discard, io.Discard); err != nil {
				t.Fatal(err)
			}
			old.mu.Lock()
			stops := old.stops
			old.mu.Unlock()
			if stops != 1 {
				t.Fatalf("expected exactly one graceful stop: %d", stops)
			}
			cfg, err := config.Load()
			if flag == "--reset" {
				if !os.IsNotExist(err) {
					t.Fatalf("reset retained pairing: %v", err)
				}
			} else if err != nil || cfg.DeviceToken != "private" || cfg.ExecutionPaused || cfg.BackgroundEnabled == nil || *cfg.BackgroundEnabled {
				t.Fatalf("stop corrupted pairing/recovery state: %+v %v", cfg, err)
			}
		})
	}
	t.Run("cancelled drain", func(t *testing.T) {
		dir, _, _, _ := handoffFixture(t)
		owned, err := lease.Acquire(dir, "execution")
		if err != nil || owned == nil {
			t.Fatal(err)
		}
		defer owned.Release()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		server, err := control.Start(dir, "test", func() any { return map[string]any{"engine": "go"} }, cancel)
		if err != nil {
			t.Fatal(err)
		}
		defer server.Close()
		err = Main(ctx, []string{"--reset"}, "test", os.Stdin, io.Discard, io.Discard)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled drain: %v", err)
		}
		if cfg, err := config.Load(); err != nil || cfg.DeviceToken != "private" {
			t.Fatal("cancelled reset lost pairing", err)
		}
		if !lease.Active(dir, "execution") {
			t.Fatal("cancelled reset stole execution")
		}
	})
}

func TestNoninteractiveStartupErrorsAndPairingOriginPrecedence(t *testing.T) {
	withoutAutomaticSetup(t)
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	if err := Main(context.Background(), []string{"--agent"}, "test", os.Stdin, io.Discard, io.Discard); err != nil {
		t.Fatal("unpaired background worker should exit", err)
	}
	if err := Main(context.Background(), []string{"--supervise"}, "test", os.Stdin, io.Discard, io.Discard); err != nil {
		t.Fatal("disabled supervisor should exit", err)
	}
	for _, args := range [][]string{{"vault", "--help"}, {"--go", "vault", "--help"}} {
		var out bytes.Buffer
		if err := Main(context.Background(), args, "test", os.Stdin, &out, &out); err != nil || !strings.Contains(out.String(), "sign-ins") {
			t.Fatalf("vault dispatch: %v %v", args, err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/device/start" {
			t.Error("invalid pairing reached token exchange")
		}
		_, _ = w.Write([]byte(`{"device_code":"","expires_in":0}`))
	}))
	defer server.Close()
	for _, source := range []string{"option", "current environment", "legacy environment"} {
		t.Run(source, func(t *testing.T) {
			t.Setenv("REMOTEARC_ORIGIN", "")
			t.Setenv("REMOTE_LINK_ORIGIN", "")
			args := []string{"--foreground", "--safe"}
			switch source {
			case "option":
				args = append(args, "--origin="+server.URL)
			case "current environment":
				t.Setenv("REMOTEARC_ORIGIN", server.URL)
			default:
				t.Setenv("REMOTE_LINK_ORIGIN", server.URL)
			}
			if err := Main(context.Background(), args, "test", os.Stdin, io.Discard, io.Discard); err == nil || !strings.Contains(err.Error(), "Invalid pairing response") {
				t.Fatalf("origin precedence did not use fixture: %v", err)
			}
			if _, err := config.Load(); !os.IsNotExist(err) {
				t.Fatal("invalid pairing persisted", err)
			}
		})
	}
	if err := os.MkdirAll(config.Dir(), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(config.Dir(), "config.json"), []byte("{broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Main(context.Background(), []string{"--agent"}, "test", os.Stdin, io.Discard, io.Discard); err == nil || !strings.Contains(err.Error(), "Cannot read saved pairing") {
		t.Fatal("corrupt pairing silently replaced", err)
	}
}

func TestOwnedRuntimeOptionsPersistAndReleaseExecution(t *testing.T) {
	for _, options := range []Options{{Developer: true, Foreground: true}, {Background: true, Foreground: true}, {NoBackground: true, Foreground: true}} {
		t.Run(map[bool]string{true: "background", false: "profile"}[options.Background], func(t *testing.T) {
			dir, bg, log, _ := handoffFixture(t)
			cfg, err := config.Load()
			if err != nil {
				t.Fatal(err)
			}
			owned, err := lease.Acquire(dir, "execution")
			if err != nil || owned == nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			_ = runOwned(ctx, options, cfg, "test", owned, bg, log, nil, io.Discard, nil, os.Stdin)
			got, err := config.Load()
			if err != nil {
				t.Fatal(err)
			}
			if options.Developer && got.Mode != "managed" || options.Background && !*got.BackgroundEnabled || options.NoBackground && *got.BackgroundEnabled {
				t.Fatalf("runtime options not durable: %+v", got)
			}
			if lease.Active(dir, "execution") {
				t.Fatal("terminated runtime leaked lease")
			}
		})
	}
}

func TestRevokedPairingIsRemovedBeforeAnyNewPairing(t *testing.T) {
	withoutAutomaticSetup(t)
	for _, background := range []bool{false, true} {
		t.Run(map[bool]string{false: "foreground", true: "worker"}[background], func(t *testing.T) {
			handoffFixture(t)
			var pairingAttempted atomic.Bool
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/device/start" {
					pairingAttempted.Store(true)
					_, _ = w.Write([]byte(`{}`))
					return
				}
				w.WriteHeader(401)
			}))
			defer server.Close()
			cfg, err := config.Load()
			if err != nil {
				t.Fatal(err)
			}
			cfg.Origin = server.URL
			if err = config.Save(cfg); err != nil {
				t.Fatal(err)
			}
			args := []string{"--foreground", "--origin=" + server.URL}
			if background {
				args = []string{"--agent"}
			}
			err = Main(context.Background(), args, "test", os.Stdin, io.Discard, io.Discard)
			if background {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "Invalid pairing response") {
				t.Fatal(err)
			}
			if _, err = config.Load(); !os.IsNotExist(err) {
				t.Fatal("revoked credential retained", err)
			}
			if pairingAttempted.Load() == background {
				t.Fatal("background worker paired interactively or foreground failed to offer fresh pairing")
			}
		})
	}
}
