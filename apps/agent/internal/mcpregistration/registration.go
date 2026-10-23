// Package mcpregistration shares Remote Arc identity and launch bindings across clients.
package mcpregistration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

const Name = "remote_arc"

func Endpoint(value string) bool {
	u, err := url.Parse(strings.TrimSpace(value))
	return err == nil && u.Scheme == "https" && strings.EqualFold(u.Hostname(), "mcp.remotearc.app") && (u.Port() == "" || u.Port() == "443") && u.User == nil && (strings.TrimRight(u.Path, "/") == "/mcp" || strings.TrimRight(u.Path, "/") == "/sse" || strings.TrimRight(u.Path, "/") == "")
}

func IsRemoteArc(raw json.RawMessage) bool {
	var entry struct {
		URL, Command string
		Args         []string
	}
	if json.Unmarshal(raw, &entry) != nil {
		return false
	}
	if Endpoint(entry.URL) {
		return true
	}
	for _, arg := range entry.Args {
		if Endpoint(arg) {
			return true
		}
	}
	name := strings.TrimSuffix(strings.ToLower(filepath.Base(entry.Command)), ".exe")
	hasMCP := false
	for _, arg := range entry.Args {
		hasMCP = hasMCP || arg == "--mcp"
	}
	if !hasMCP {
		return false
	}
	if name == "remotelink" || name == "remotelink-go" || strings.HasPrefix(name, "remotelink-v") {
		return true
	}
	if name == "npx" || name == "npx.cmd" {
		for _, arg := range entry.Args {
			if arg == "remotelink" || strings.HasPrefix(arg, "remotelink@") {
				return true
			}
		}
	}
	if name == "node" {
		for _, arg := range entry.Args {
			p := strings.ToLower(filepath.ToSlash(arg))
			if strings.Contains(p, "/remotelink/") && strings.HasSuffix(p, "/dist/index.js") {
				return true
			}
		}
	}
	return false
}

func Existing(servers map[string]json.RawMessage) (string, bool) {
	for name, raw := range servers {
		if IsRemoteArc(raw) {
			return name, true
		}
	}
	return "", false
}

func Desired(binary string, claude bool) json.RawMessage {
	entry := map[string]any{"command": binary, "args": []string{"--mcp", "--safe"}}
	if claude {
		entry["type"] = "stdio"
		entry["env"] = map[string]string{}
	} else {
		entry["enabled"] = true
	}
	b, _ := json.Marshal(entry)
	return b
}

// Pin a copy outside temporary npx/package directories. A versioned content
// address lets both clients share it without replacing an executable in use.
func PinBinary(ctx context.Context, binary string) (string, error) {
	f, err := os.Open(binary)
	if err != nil {
		return "", errors.New("native_binary_unavailable")
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 128<<20))
	if err != nil || len(b) == 0 || len(b) >= 128<<20 {
		return "", errors.New("native_binary_unavailable")
	}
	sum := sha256.Sum256(b)
	key := hex.EncodeToString(sum[:])
	// Codex and Claude can pin the same native executable simultaneously.
	// Serialize their publication across goroutines/processes; replacing an
	// executable being read or started is unreliable on Windows.
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var acquireErr error
	for {
		lock, e := lease.Acquire(filepath.Join(config.Dir(), "integrations", "bin", ".locks"), key)
		if e != nil {
			if runtime.GOOS != "windows" {
				return "", errors.New("native_cache_unavailable")
			}
			// A lock directory can be pending deletion while another client
			// closes its Windows handle. Retry within the same bounded wait;
			// never proceed without actually acquiring the lease.
			acquireErr = e
		}
		if lock != nil {
			defer lock.Release()
			break
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			if acquireErr != nil {
				return "", errors.New("native_cache_unavailable")
			}
			return "", errors.New("native_cache_busy")
		case <-timer.C:
		}
	}
	name := "remotelink"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	path := filepath.Join(config.Dir(), "integrations", "bin", key, name)
	if info, e := os.Lstat(path); e == nil {
		if !info.Mode().IsRegular() {
			return "", errors.New("native_cache_conflict")
		}
		existing, e := os.ReadFile(path)
		if e != nil || sha256.Sum256(existing) != sum {
			return "", errors.New("native_cache_conflict")
		}
		return path, nil
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return "", errors.New("native_cache_unavailable")
	}
	if err = config.DurableWrite(path, b, 0700); err != nil {
		if existing, e := os.ReadFile(path); e != nil || sha256.Sum256(existing) != sum {
			return "", errors.New("native_cache_unavailable")
		}
	}
	return path, nil
}
