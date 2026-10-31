package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestPairingRejectsIncompleteAndUnboundedStartResponses(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	for _, start := range []PairingStart{{}, {DeviceCode: "code", DeviceSecret: "secret", ExpiresIn: 86401}, {DeviceCode: "code", DeviceSecret: "secret", ExpiresIn: 10}} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/device/start" {
				t.Error("invalid start polled token")
			}
			_ = json.NewEncoder(w).Encode(start)
		}))
		opened := false
		_, err := NewClient().Pair(context.Background(), server.URL, "safe", &bytes.Buffer{}, func(string) error { opened = true; return nil })
		server.Close()
		if err == nil || opened {
			t.Fatal("invalid start opened authorization or succeeded", err)
		}
	}
	if _, err := config.Load(); !os.IsNotExist(err) {
		t.Fatal("invalid start wrote pairing", err)
	}
	for _, interval := range []int{-1, 61} {
		ctx, cancel := context.WithCancel(context.Background())
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: "code", DeviceSecret: "private", VerificationURI: "https://example.test/authorize", ExpiresIn: 10, Interval: interval})
		}))
		var output bytes.Buffer
		_, err := NewClient().Pair(ctx, server.URL, "safe", &output, func(link string) error {
			if link != "https://example.test/authorize" {
				t.Error("fallback verification URI ignored")
			}
			cancel()
			return errors.New("browser unavailable")
		})
		server.Close()
		cancel()
		if err == nil || !strings.Contains(err.Error(), "cancelled or expired") || strings.Contains(output.String(), "private") {
			t.Fatal("pairing cancellation or redaction failed", err, output.String())
		}
	}
}

func TestPairingRetriesTransientAndPendingButDoesNotRetryDenial(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/device/start" {
			_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: "code", DeviceSecret: "private-pairing", VerificationComplete: "https://example.test/authorize", ExpiresIn: 20, Interval: 2})
			return
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["device_secret"] != "private-pairing" {
			t.Error("poll omitted private pairing proof")
		}
		switch polls.Add(1) {
		case 1:
			w.WriteHeader(503)
		case 2:
			w.WriteHeader(428)
		default:
			w.WriteHeader(400)
		}
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var output bytes.Buffer
	if _, err := NewClient().Pair(ctx, server.URL, "safe", &output, nil); err == nil || !strings.Contains(err.Error(), "HTTP 400") {
		t.Fatalf("denial did not terminate polling: %v", err)
	}
	if polls.Load() != 3 {
		t.Fatalf("wrong retry semantics: %d polls", polls.Load())
	}
	if strings.Contains(output.String(), "private-pairing") {
		t.Fatal("pairing secret leaked")
	}
	if _, err := config.Load(); !os.IsNotExist(err) {
		t.Fatal("rejected pairing persisted", err)
	}
}

func TestWakeStatusAndInvalidIdentityDoNotLoadExecution(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	on := true
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "private", Origin: "https://example.test", Mode: "managed", BackgroundEnabled: &on, ExecutionPaused: true}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := NewWake(cfg, "test", nil)
	a.Background = activeBackground{}
	a.Stop = func() { t.Error("already paused wake worker should not restart") }
	if value, err := a.dispatch(context.Background(), protocol.Call{Tool: "set_device_runtime", Arguments: map[string]any{"paused": true}}, nil); err != nil || value.(map[string]any)["paused"] != true {
		t.Fatal(value, err)
	}
	var missing *capacityProbe
	if missing.sample(context.Background()) != nil {
		t.Fatal("nil capacity advertised")
	}
	a.capacity = nil
	if a.fleetCapacity(context.Background()) != nil {
		t.Fatal("missing metrics fabricated")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if cpu, total, available, ok := linuxCapacity(ctx); runtime.GOOS == "linux" && (!ok || cpu != -1 || total == 0 || available > total) {
		t.Fatalf("cancelled probe lost memory or invented CPU: %v %v %v %v", cpu, total, available, ok)
	}
	if runtime.GOOS != "darwin" {
		if _, _, _, ok := darwinCapacity(ctx); ok {
			t.Fatal("cancelled Darwin probe succeeded")
		}
	}
	if _, _, _, ok := windowsCapacity(ctx); ok {
		t.Fatal("cancelled Windows probe succeeded")
	}
}
