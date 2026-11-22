package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
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

// shortPairingClock makes relay seconds 10ms and unattended retries 20ms-40ms.
func shortPairingClock(t *testing.T) {
	t.Helper()
	second, first, max := pairingSecond, unattendedRetryFirst, unattendedRetryMax
	pairingSecond, unattendedRetryFirst, unattendedRetryMax = 10*time.Millisecond, 20*time.Millisecond, 40*time.Millisecond
	t.Cleanup(func() { pairingSecond, unattendedRetryFirst, unattendedRetryMax = second, first, max })
}

func TestUnattendedPairingShowsANewCodeAfterAGrowingDelay(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	shortPairingClock(t)
	var starts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/device/start" {
			n := starts.Add(1)
			switch n {
			case 1: // relay unavailable
				w.WriteHeader(503)
			case 2: // code expires before anyone approves it
				_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: "expires", DeviceSecret: "private-pairing", VerificationComplete: "https://example.test/authorize", ExpiresIn: 1, Interval: 2})
			default:
				_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: fmt.Sprint("code-", n), DeviceSecret: "private-pairing", VerificationComplete: "https://example.test/authorize", ExpiresIn: 30, Interval: 2})
			}
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["device_code"] == "code-3" { // relay already expired this code
			w.WriteHeader(400)
			return
		}
		_ = json.NewEncoder(w).Encode(PairingToken{DeviceID: "paired-device", DeviceToken: "private-pairing"})
	}))
	defer server.Close()
	var output bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cfg, err := NewClient().PairUnattended(ctx, server.URL, "managed", &output, nil)
	if err != nil || cfg.DeviceID != "paired-device" || starts.Load() != 4 {
		t.Fatalf("unattended pairing did not recover: %v %v starts=%d", err, cfg.DeviceID, starts.Load())
	}
	retries := regexp.MustCompile(`A new pairing code will be shown in (\S+)\.`).FindAllStringSubmatch(output.String(), -1)
	var waits []string
	for _, m := range retries {
		waits = append(waits, m[1])
	}
	if strings.Join(waits, ",") != "20ms,40ms,40ms" {
		t.Fatalf("retry delay did not double up to its cap: %v\n%s", waits, output.String())
	}
	for _, reason := range []string{"HTTP 503", "cancelled or expired", "HTTP 400"} {
		if !strings.Contains(output.String(), reason) {
			t.Fatalf("retry reason %q not shown:\n%s", reason, output.String())
		}
	}
	if strings.Contains(output.String(), "private-pairing") {
		t.Fatal("pairing secret printed")
	}
	if saved, err := config.Load(); err != nil || saved.DeviceID != "paired-device" {
		t.Fatal("unattended pairing not saved", err)
	}
}

func TestUnattendedPairingStopsOnDenialInvalidStartAndCancellation(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	shortPairingClock(t)
	for name, handler := range map[string]http.HandlerFunc{
		"denied": func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/device/start" {
				_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: "code", DeviceSecret: "secret", VerificationURI: "https://example.test/authorize", ExpiresIn: 30, Interval: 2})
				return
			}
			w.WriteHeader(403)
		},
		"invalid start": func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(400) },
		"incomplete start": func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(PairingStart{})
		},
	} {
		var starts atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/device/start" {
				starts.Add(1)
			}
			handler(w, r)
		}))
		_, err := NewClient().PairUnattended(context.Background(), server.URL, "managed", &bytes.Buffer{}, nil)
		server.Close()
		if err == nil || starts.Load() != 1 {
			t.Fatalf("%s: retried a failure a new code cannot fix: %v starts=%d", name, err, starts.Load())
		}
	}
	unattendedRetryFirst = time.Hour
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(50*time.Millisecond, cancel)
	began := time.Now()
	if _, err := NewClient().PairUnattended(ctx, server.URL, "managed", &bytes.Buffer{}, nil); !errors.Is(err, context.Canceled) || time.Since(began) > 5*time.Second {
		t.Fatalf("cancellation did not end the retry wait: %v after %s", err, time.Since(began))
	}
}

func TestPairingSlowsPollingWhenTheRelayRateLimits(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	shortPairingClock(t)
	var polls []time.Time
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/device/start" {
			_ = json.NewEncoder(w).Encode(PairingStart{DeviceCode: "code", DeviceSecret: "secret", VerificationURI: "https://example.test/authorize", ExpiresIn: 30, Interval: 2})
			return
		}
		polls = append(polls, time.Now())
		if len(polls) == 1 {
			w.WriteHeader(429)
			return
		}
		_ = json.NewEncoder(w).Encode(PairingToken{DeviceID: "device", DeviceToken: "secret"})
	}))
	defer server.Close()
	if _, err := NewClient().Pair(context.Background(), server.URL, "managed", &bytes.Buffer{}, nil); err != nil || len(polls) != 2 {
		t.Fatalf("rate-limited poll ended pairing: %v polls=%d", err, len(polls))
	}
	// interval 2 + 5 relay seconds after a 429, at 10ms per relay second.
	if gap := polls[1].Sub(polls[0]); gap < 70*time.Millisecond {
		t.Fatalf("polling did not slow down after 429: %s", gap)
	}
}
