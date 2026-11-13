package control

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func writeEndpoint(t *testing.T, dir string, ep Endpoint) {
	t.Helper()
	data, err := json.Marshal(ep)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "control.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestRequestRejectsUntrustedMetadataBeforeNetwork(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer server.Close()
	for _, tc := range []struct{ name, url, engine, token string }{
		{"foreign engine", server.URL, "ts", strings.Repeat("a", 64)},
		{"short token", server.URL, "go", "short"},
		{"invalid URL", "http://%zz", "go", strings.Repeat("a", 64)},
		{"fragment", server.URL + "#fragment", "go", strings.Repeat("a", 64)},
		{"invalid port", "http://127.0.0.1:65536", "go", strings.Repeat("a", 64)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeEndpoint(t, dir, Endpoint{URL: tc.url, Engine: tc.engine, Token: tc.token})
			if _, err := Request(context.Background(), dir, "GET", "/status"); err == nil {
				t.Fatal("untrusted endpoint accepted")
			}
		})
	}
	if hits.Load() != 0 {
		t.Fatalf("rejected metadata made %d requests", hits.Load())
	}
	if _, err := Request(context.Background(), t.TempDir(), "GET", "/status"); !os.IsNotExist(err) {
		t.Fatalf("missing endpoint: %v", err)
	}
}

func TestRequestDoesNotFollowRedirectsOrAcceptInvalidResponses(t *testing.T) {
	var leaked atomic.Int32
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked.Add(1) }))
	defer destination.Close()
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"redirect", 302, ""}, {"rejected", 401, `{"secret":"must not be exposed"}`},
		{"malformed JSON", 200, "{"}, {"oversized JSON", 200, `{"data":"` + strings.Repeat("x", 65536) + `"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer "+strings.Repeat("a", 64) {
					t.Error("missing authentication")
				}
				w.Header().Set("Location", destination.URL)
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			dir := t.TempDir()
			writeEndpoint(t, dir, Endpoint{URL: server.URL, Engine: "go", Token: strings.Repeat("a", 64)})
			if _, err := Request(context.Background(), dir, "GET", "/status"); err == nil || strings.Contains(err.Error(), "must not be exposed") {
				t.Fatalf("unsafe response handling: %v", err)
			}
			if _, err := Request(context.Background(), dir, "POST", "/status"); err == nil {
				t.Fatal("unsupported operation accepted")
			}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			if _, err := Request(ctx, dir, "GET", "/status"); err == nil {
				t.Fatal("cancelled request succeeded")
			}
		})
	}
	if leaked.Load() != 0 {
		t.Fatal("redirect leaked local authentication")
	}
}

func TestServerClosePreservesReplacementAndRejectsUnknownRoutes(t *testing.T) {
	dir := t.TempDir()
	s, err := Start(dir, "test", func() any { return map[string]any{"ok": true} }, func() { t.Error("unexpected stop") })
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	req, err := http.NewRequest("POST", s.endpoint.URL+"/status", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+s.endpoint.Token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("unsupported route: %d", resp.StatusCode)
	}
	replacement := s.endpoint
	replacement.Token = strings.Repeat("b", 64)
	writeEndpoint(t, dir, replacement)
	s.Close()
	data, err := os.ReadFile(filepath.Join(dir, "control.json"))
	if err != nil {
		t.Fatal("removed replacement endpoint", err)
	}
	var got Endpoint
	if err = json.Unmarshal(data, &got); err != nil || got.Token != replacement.Token {
		t.Fatalf("replacement changed: %s %v", data, err)
	}
	blocked := filepath.Join(t.TempDir(), "file")
	if err = os.WriteFile(blocked, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if server, err := Start(blocked, "test", func() any { return nil }, func() {}); err == nil {
		server.Close()
		t.Fatal("started without durable control metadata")
	}
}
