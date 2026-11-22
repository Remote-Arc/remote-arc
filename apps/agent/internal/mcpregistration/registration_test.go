package mcpregistration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestRemoteArcIdentityUsesEndpointOrNativeLaunch(t *testing.T) {
	for _, value := range []string{"https://mcp.remotearc.app/mcp", "https://MCP.REMOTEARC.APP:443/sse/", "https://mcp.remotearc.app/mcp?account=x"} {
		if !Endpoint(value) {
			t.Fatal(value)
		}
	}
	for _, value := range []string{"http://mcp.remotearc.app/mcp", "https://mcp.remotearc.app.attacker/mcp", "https://user@mcp.remotearc.app/mcp", "https://mcp.remotearc.app:123/mcp", "https://mcp.remotearc.app/other"} {
		if Endpoint(value) {
			t.Fatal(value)
		}
	}
	for _, raw := range []string{
		`{"url":"https://mcp.remotearc.app/mcp","enabled":false}`,
		`{"command":"mcp-remote","args":["https://mcp.remotearc.app/sse"]}`,
		`{"command":"remotelink","args":["--mcp","--safe"]}`,
		`{"command":"npx","args":["-y","remotelink@0.6.2-rc.3","--mcp"]}`,
		`{"command":"node","args":["/opt/node_modules/remotelink/dist/index.js","--mcp"]}`,
	} {
		if !IsRemoteArc(json.RawMessage(raw)) {
			t.Fatal(raw)
		}
	}
	for _, raw := range []string{`{`, `{"command":"other","args":["--mcp"]}`, `{"command":"remotelink","args":["--version"]}`, `{"command":"npx","args":["remotelink-spoof","--mcp"]}`} {
		if IsRemoteArc(json.RawMessage(raw)) {
			t.Fatal(raw)
		}
	}
	if name, ok := Existing(map[string]json.RawMessage{"my custom connector": json.RawMessage(`{"url":"https://mcp.remotearc.app/mcp"}`)}); !ok || name != "my custom connector" {
		t.Fatal(name, ok)
	}
}

func TestBusyCacheRespectsCancellation(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	binary := filepath.Join(t.TempDir(), "download")
	contents := []byte("synthetic locked native")
	if err := os.WriteFile(binary, contents, 0700); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(contents)
	lock, err := lease.Acquire(filepath.Join(config.Dir(), "integrations", "bin", ".locks"), hex.EncodeToString(hash[:]))
	if err != nil || lock == nil {
		t.Fatal(err)
	}
	defer lock.Release()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if _, err := PinBinary(ctx, binary); err == nil || err.Error() != "native_cache_busy" {
		t.Fatal(err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("cache contention ignored cancellation")
	}
}

func TestPinnedBinarySurvivesOriginalRemovalAndConcurrentClients(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	binary := filepath.Join(t.TempDir(), "download")
	if err := os.WriteFile(binary, []byte("synthetic native contents"), 0700); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	paths := make(chan string, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			path, err := PinBinary(context.Background(), binary)
			if err != nil {
				t.Error(err)
			}
			paths <- path
		}()
	}
	wg.Wait()
	close(paths)
	var pinned string
	for p := range paths {
		if pinned != "" && p != pinned {
			t.Fatal("clients received different cache bindings")
		}
		pinned = p
	}
	if !strings.Contains(pinned, string(filepath.Separator)+"integrations"+string(filepath.Separator)+"bin") {
		t.Fatal(pinned)
	}
	if err := os.Remove(binary); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(pinned); err != nil || string(b) != "synthetic native contents" {
		t.Fatal(err)
	}
	if err := os.WriteFile(pinned, []byte("modified by another process"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("synthetic native contents"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := PinBinary(context.Background(), binary); err == nil {
		t.Fatal("cache drift silently overwritten")
	}
	if _, err := PinBinary(context.Background(), filepath.Join(t.TempDir(), "absent")); err == nil {
		t.Fatal("missing binary accepted")
	}
}
