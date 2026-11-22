package mcpregistration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestDesiredRegistrationAndCacheFailuresPreserveExistingData(t *testing.T) {
	for _, claude := range []bool{false, true} {
		var entry map[string]any
		if err := json.Unmarshal(Desired("/native/remotelink", claude), &entry); err != nil {
			t.Fatal(err)
		}
		args := entry["args"].([]any)
		if entry["command"] != "/native/remotelink" || len(args) != 2 || args[0] != "--mcp" || args[1] != "--safe" {
			t.Fatalf("unsafe launch: %v", entry)
		}
		if claude {
			if entry["type"] != "stdio" || entry["env"] == nil {
				t.Fatal(entry)
			}
		} else if entry["enabled"] != true {
			t.Fatal(entry)
		}
	}
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	binary := filepath.Join(t.TempDir(), "binary")
	if err := os.WriteFile(binary, nil, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := PinBinary(context.Background(), binary); err == nil || err.Error() != "native_binary_unavailable" {
		t.Fatal("empty binary accepted", err)
	}
	contents := []byte("fixture binary")
	if err := os.WriteFile(binary, contents, 0700); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(contents)
	cacheDir := filepath.Join(config.Dir(), "integrations", "bin", hex.EncodeToString(sum[:]))
	if err := os.MkdirAll(filepath.Join(cacheDir, "remotelink"), 0700); err != nil {
		t.Fatal(err)
	}
	// An existing directory must never be replaced with an executable.
	if os.PathSeparator == '/' {
		if _, err := PinBinary(context.Background(), binary); err == nil || err.Error() != "native_cache_conflict" {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(cacheDir, "remotelink")); err != nil {
		t.Fatal("cache conflict destroyed", err)
	}
	if err := os.RemoveAll(filepath.Join(config.Dir(), "integrations")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(config.Dir(), "integrations"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := PinBinary(context.Background(), binary); err == nil || err.Error() != "native_cache_unavailable" {
		t.Fatal("invalid cache parent accepted", err)
	}
}
