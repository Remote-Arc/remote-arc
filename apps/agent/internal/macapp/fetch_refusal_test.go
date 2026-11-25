package macapp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestNewFetcherUsesThePublishedSourcesAndTheRealChecks(t *testing.T) {
	f := NewFetcher("/home/someone")
	if f.Home != "/home/someone" || f.HTTP == nil || f.HTTP.Timeout == 0 {
		t.Fatalf("fetcher %+v", f)
	}
	if f.ManifestURL != ManifestURL || !strings.HasPrefix(ManifestURL, "https://github.com/") {
		t.Fatalf("checksums must come from GitHub only: %q", f.ManifestURL)
	}
	if len(f.ArchiveURLs) != 2 || f.ArchiveURLs[0] != mirrorURL || f.ArchiveURLs[1] != githubURL {
		t.Fatalf("archive sources %v, want the release mirror then GitHub", f.ArchiveURLs)
	}
	if f.Verify == nil || f.Probe == nil {
		t.Fatal("the real signature and version checks are not configured")
	}
}

func TestFetchRefusesAnAppThatFailsTheSignatureCheck(t *testing.T) {
	f, _ := publishedApp(t, "agent 1.3.0")
	var checked string
	f.Verify = func(_ context.Context, app string) error {
		checked = app
		return errors.New("code object is not signed at all")
	}
	_, _, err := f.Fetch(context.Background(), "1.3.0")
	if err == nil || !strings.Contains(err.Error(), "not signed by Remote Arc") {
		t.Fatalf("an unsigned app was accepted: %v", err)
	}
	if want := filepath.Join(f.Home, ".remotearc", "agent", "downloads", "1.3.0", Bundle); checked != want {
		t.Fatalf("checked %q, want the unpacked app %q", checked, want)
	}
}

// manifestServer serves manifest (JSON, or a raw string) as macos-agent.json, or only status.
func manifestServer(t *testing.T, f *Fetcher, manifest any, status int) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		if s, ok := manifest.(string); ok {
			_, _ = w.Write([]byte(s))
			return
		}
		_ = json.NewEncoder(w).Encode(manifest)
	}))
	t.Cleanup(server.Close)
	f.HTTP = server.Client()
	f.ManifestURL = server.URL + "/v%s/macos-agent.json"
}

func TestFetchRefusesAManifestItCannotTrust(t *testing.T) {
	for name, tc := range map[string]struct {
		manifest any
		status   int
		message  string
	}{
		"missing":         {nil, http.StatusNotFound, "no Agent app checksum is published"},
		"not JSON":        {"<html>", http.StatusOK, "are not for v1.3.0"},
		"another version": {map[string]any{"version": "1.2.9", "checksums": map[string]string{Asset("1.3.0"): strings.Repeat("a", 64)}}, http.StatusOK, "are not for v1.3.0"},
		"no checksum":     {map[string]any{"version": "1.3.0", "checksums": map[string]string{}}, http.StatusOK, "no checksum is published"},
		"a bad checksum":  {map[string]any{"version": "1.3.0", "checksums": map[string]string{Asset("1.3.0"): "ABC"}}, http.StatusOK, "no checksum is published"},
	} {
		t.Run(name, func(t *testing.T) {
			f, _ := publishedApp(t, "agent 1.3.0")
			manifestServer(t, f, tc.manifest, tc.status)
			_, _, err := f.Fetch(context.Background(), "1.3.0")
			if err == nil || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("got %v, want %q", err, tc.message)
			}
			if _, statErr := os.Stat(filepath.Join(f.Home, ".remotearc", "agent", "downloads", "1.3.0")); !os.IsNotExist(statErr) {
				t.Fatal("something was downloaded without a trusted checksum")
			}
		})
	}
}

func TestFetchFallsBackToTheNextSourceAndKeepsOnlyMatchingBytes(t *testing.T) {
	f, _ := publishedApp(t, "agent 1.3.0")
	good := f.ArchiveURLs[0]
	tampered := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("not the published archive"))
	}))
	t.Cleanup(tampered.Close)
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(down.Close)

	f.ArchiveURLs = []string{down.URL + "/v%s/%s", tampered.URL + "/v%s/%s", good}
	if _, _, err := f.Fetch(context.Background(), "1.3.0"); err != nil {
		t.Fatalf("the matching source was not used: %v", err)
	}

	f2, _ := publishedApp(t, "agent 1.3.0")
	f2.ArchiveURLs = []string{tampered.URL + "/v%s/%s"}
	_, _, err := f2.Fetch(context.Background(), "1.3.0")
	if err == nil || !strings.Contains(err.Error(), "checksum does not match the published release") {
		t.Fatalf("a tampered archive was accepted: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(f2.Home, ".remotearc", "agent", "downloads", "1.3.0", Asset("1.3.0"))); !os.IsNotExist(statErr) {
		t.Fatal("tampered bytes were kept")
	}

	f3, _ := publishedApp(t, "agent 1.3.0")
	f3.ArchiveURLs = nil
	if _, _, err := f3.Fetch(context.Background(), "1.3.0"); err == nil || !strings.Contains(err.Error(), "no download source") {
		t.Fatalf("got %v with no download source", err)
	}
}

func TestProbeVersionReadsTheProgramsVersion(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the Agent app's program is a macOS executable; probing a shell script needs a Unix shell")
	}
	program := filepath.Join(t.TempDir(), "remotelink")
	if err := os.WriteFile(program, []byte("#!/bin/sh\necho '  1.3.0  '\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got, err := probeVersion(context.Background(), program); err != nil || got != "1.3.0" {
		t.Fatalf("probe = %q, %v", got, err)
	}
	if _, err := probeVersion(context.Background(), filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("a missing program reported a version")
	}
}

func TestVerifySignatureRefusesOffMacOSAndUnsignedApps(t *testing.T) {
	app := filepath.Join(t.TempDir(), Bundle)
	if err := os.MkdirAll(filepath.Join(app, "Contents", "MacOS"), 0o755); err != nil {
		t.Fatal(err)
	}
	err := VerifySignature(context.Background(), app)
	if err == nil {
		t.Fatal("an unsigned app passed the signature check")
	}
	if runtime.GOOS != "darwin" && !strings.Contains(err.Error(), "only be checked on macOS") {
		t.Fatalf("off macOS: %v", err)
	}
}
