package macapp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func publishedApp(t *testing.T, program string) (*Fetcher, *atomic.Int32) {
	t.Helper()
	archive := appZip(t,
		zipEntry{"Remote Arc.app/", "", fs.ModeDir | 0o755},
		zipEntry{"Remote Arc.app/Contents/Info.plist", "<plist/>", 0o644},
		zipEntry{"Remote Arc.app/Contents/MacOS/remotelink", program, 0o755},
	)
	sum := sha256.Sum256(archive)
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if strings.HasSuffix(r.URL.Path, "/macos-agent.json") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"version":   "1.3.0",
				"checksums": map[string]string{Asset("1.3.0"): hex.EncodeToString(sum[:])},
			})
			return
		}
		_, _ = w.Write(archive)
	}))
	t.Cleanup(server.Close)
	return &Fetcher{
		HTTP:        server.Client(),
		Home:        t.TempDir(),
		ManifestURL: server.URL + "/v%s/macos-agent.json",
		ArchiveURLs: []string{server.URL + "/v%s/%s"},
		Verify:      func(context.Context, string) error { return nil },
		Probe: func(_ context.Context, program string) (string, error) {
			b, err := os.ReadFile(program)
			return strings.TrimPrefix(string(b), "agent "), err
		},
	}, &hits
}

func TestFetchReturnsTheCheckedAppAndReusesTheDownload(t *testing.T) {
	f, hits := publishedApp(t, "agent 1.3.0")
	program, checksum, err := f.Fetch(context.Background(), "1.3.0")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(f.Home, ".remotearc", "agent", "downloads", "1.3.0", Bundle, "Contents", "MacOS", "remotelink")
	if program != want || len(checksum) != 64 {
		t.Fatalf("program %q checksum %q", program, checksum)
	}
	before := hits.Load()
	if _, _, err := f.Fetch(context.Background(), "1.3.0"); err != nil {
		t.Fatal(err)
	}
	if hits.Load()-before != 1 {
		t.Fatal("a verified archive was downloaded again (only the manifest is re-read)")
	}
}

func TestFetchRefuses(t *testing.T) {
	for name, change := range map[string]func(f *Fetcher){
		"an app for another version": func(f *Fetcher) {
			f.Probe = func(context.Context, string) (string, error) { return "1.2.9", nil }
		},
		"without a signature check": func(f *Fetcher) { f.Verify = nil },
	} {
		t.Run(name, func(t *testing.T) {
			f, _ := publishedApp(t, "agent 1.3.0")
			change(f)
			if _, _, err := f.Fetch(context.Background(), "1.3.0"); err == nil {
				t.Fatal("the app was accepted")
			}
		})
	}
	t.Run("a version that is not a release", func(t *testing.T) {
		f, hits := publishedApp(t, "agent dev")
		if _, _, err := f.Fetch(context.Background(), "dev"); err == nil || hits.Load() != 0 {
			t.Fatalf("asked the network for a development build: %v", err)
		}
	})
}

func TestVerifySignatureNeedsAnApp(t *testing.T) {
	if err := VerifySignature(context.Background(), ""); err == nil {
		t.Fatal("an empty path passed the signature check")
	}
}
