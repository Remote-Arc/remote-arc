package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// transferRelay serves the device transfer API the way the Relay does, for
// one staged file, and records what the Agent sends.
type transferRelay struct {
	mu      sync.Mutex
	data    []byte
	parts   map[string][]byte
	ranges  []string
	auth    []string
	results []map[string]any
	source  map[string]any
}

func (r *transferRelay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.auth = append(r.auth, req.Header.Get("Authorization"))
	path := strings.TrimPrefix(req.URL.Path, "/api/device/transfers/t-12345678")
	sum := sha256.Sum256(r.data)
	switch {
	case req.Method == "GET" && path == "":
		json.NewEncoder(w).Encode(map[string]any{"id": "t-12345678", "status": "staged", "size": len(r.data), "sha256": hex.EncodeToString(sum[:]), "expires_at": time.Now().Add(time.Hour).Format(time.RFC3339Nano)})
	case req.Method == "GET" && path == "/content":
		r.ranges = append(r.ranges, req.Header.Get("Range"))
		if req.Header.Get("Range") == "" {
			// The first response drops after 1000 bytes, like a lost connection.
			w.Header().Set("Content-Length", "2000")
			w.Write(r.data[:1000])
			w.(http.Flusher).Flush()
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, _ := hj.Hijack()
				conn.Close()
			}
			return
		}
		w.WriteHeader(http.StatusPartialContent)
		w.Write(r.data[1000:])
	case req.Method == "PUT" && strings.HasPrefix(path, "/parts/"):
		b, _ := io.ReadAll(req.Body)
		r.parts[strings.TrimPrefix(path, "/parts/")] = b
	case req.Method == "POST" && path == "/source-complete":
		json.NewDecoder(req.Body).Decode(&r.source)
	case req.Method == "POST" && path == "/result":
		var result map[string]any
		json.NewDecoder(req.Body).Decode(&result)
		r.results = append(r.results, result)
	default:
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "TRANSFER_FORBIDDEN"})
	}
}

func transferAgent(t *testing.T, origin string) *Agent {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "device-token", Origin: origin, Mode: "full"}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "test", false, nil)
	t.Cleanup(func() { a.Browser.Close(); a.Core.Close() })
	return a
}

func TestAgentAdvertisesAndRunsFileTransfers(t *testing.T) {
	data := bytes.Repeat([]byte("0123456789"), 200)
	relay := &transferRelay{data: data, parts: map[string][]byte{}}
	server := httptest.NewServer(relay)
	defer server.Close()
	a := transferAgent(t, server.URL)

	hello := a.hello(context.Background())
	tools := hello["tools"].([]string)
	if !slices.Contains(tools, "receive_file") || !slices.Contains(tools, "send_file") || !slices.Contains(hello["capabilities"].([]string), "file_transfer_v1") {
		t.Fatal("an execution Agent advertises file transfers")
	}

	dir := t.TempDir()
	target := filepath.Join(dir, "film.mp4")
	sum := sha256.Sum256(data)
	_, err := a.dispatch(context.Background(), protocol.Call{Tool: "receive_file", Arguments: map[string]any{
		"transfer_id": "t-12345678", "path": target, "size": float64(len(data)), "sha256": hex.EncodeToString(sum[:]),
	}, Policy: protocol.Policy{WorkspaceRoots: []string{dir}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	a.Core.WaitTransfers()
	got, _ := os.ReadFile(target)
	if !bytes.Equal(got, data) {
		t.Fatalf("received %d bytes: %v", len(got), relay.results)
	}
	relay.mu.Lock()
	if len(relay.results) != 1 || relay.results[0]["status"] != "delivered" {
		t.Fatalf("results %v", relay.results)
	}
	if !slices.Equal(relay.ranges, []string{"", "bytes=1000-"}) {
		t.Fatalf("ranges %v", relay.ranges)
	}
	for _, auth := range relay.auth {
		if auth != "Bearer device-token" {
			t.Fatalf("authorization %q", auth)
		}
	}
	relay.mu.Unlock()

	source := filepath.Join(dir, "render.mov")
	os.WriteFile(source, data, 0644)
	if _, err = a.dispatch(context.Background(), protocol.Call{Tool: "send_file", Arguments: map[string]any{
		"transfer_id": "t-12345678", "path": source, "size": float64(len(data)),
	}}, nil); err != nil {
		t.Fatal(err)
	}
	a.Core.WaitTransfers()
	relay.mu.Lock()
	defer relay.mu.Unlock()
	if !bytes.Equal(relay.parts["1"], data) || relay.source["sha256"] != hex.EncodeToString(sum[:]) {
		t.Fatalf("source upload %d bytes, %v", len(relay.parts["1"]), relay.source)
	}
}

// A refused transfer request is an error about that transfer, not a revoked
// device credential, and keeps the Relay's code.
func TestTransferRefusalIsNotRevocation(t *testing.T) {
	server := httptest.NewServer(&transferRelay{parts: map[string][]byte{}})
	defer server.Close()
	a := transferAgent(t, server.URL)
	_, err := newRelayTransfers(a).Info(context.Background(), "other-transfer")
	if err == nil || errors.Is(err, ErrRevoked) || !strings.Contains(err.Error(), "TRANSFER_FORBIDDEN") {
		t.Fatalf("err %v", err)
	}
}
