package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestMain lets this test binary stand in for a downloaded Agent:
//   - RA_FAKE_AGENT_VERSION with --version prints that version;
//   - RA_FAKE_AGENT_HANDOFF with --update-handoff records how it was started in
//     that file, as the new Agent's handoff would begin.
func TestMain(m *testing.M) {
	last := ""
	if len(os.Args) > 1 {
		last = os.Args[len(os.Args)-1]
	}
	if version := os.Getenv("RA_FAKE_AGENT_VERSION"); version != "" && last == "--version" {
		fmt.Println(version)
		os.Exit(0)
	}
	if marker := os.Getenv("RA_FAKE_AGENT_HANDOFF"); marker != "" && last == "--update-handoff" {
		fmt.Println("fake Agent handoff started")
		_ = os.WriteFile(marker, []byte("args="+strings.Join(os.Args[1:], " ")+" "+sessionReport()), 0o600)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type releaseServer struct {
	*httptest.Server
	manifestVersion string
	checksums       map[string]string
	mirror          []byte // nil answers 500
	github          []byte
	hits            atomic.Int32
}

func newReleaseServer(t *testing.T, version string, binary []byte) *releaseServer {
	t.Helper()
	asset := "remotelink-v" + version + "-linux-amd64"
	s := &releaseServer{manifestVersion: version, checksums: map[string]string{asset: digest(binary)}, github: binary}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.hits.Add(1)
		switch {
		case strings.HasSuffix(r.URL.Path, "/go-binaries.json"):
			_ = json.NewEncoder(w).Encode(map[string]any{"version": s.manifestVersion, "checksums": s.checksums})
		case strings.HasPrefix(r.URL.Path, "/mirror/"):
			if s.mirror == nil {
				http.Error(w, "unavailable", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write(s.mirror)
		case strings.HasPrefix(r.URL.Path, "/github/"):
			_, _ = w.Write(s.github)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(s.Close)
	return s
}

type installCall struct{ binary, version string }

func testUpdater(t *testing.T, server *releaseServer) (*Updater, *[]installCall, chan struct{}) {
	t.Helper()
	installs := []installCall{}
	restarted := make(chan struct{}, 1)
	u := &Updater{
		Version:     "1.2.3",
		Platform:    "linux",
		Arch:        "amd64",
		Home:        t.TempDir(),
		HTTP:        server.Client(),
		ManifestURL: server.URL + "/releases/v%s/go-binaries.json",
		BinaryURLs:  []string{server.URL + "/mirror/%s/%s", server.URL + "/github/%s/%s"},
		Background:  func(context.Context) bool { return true },
		Busy:        func() string { return "" },
		Probe: func(_ context.Context, binary string) (string, error) {
			// The real probe runs the binary; here the file holds its version.
			b, err := os.ReadFile(binary)
			return strings.TrimPrefix(string(b), "agent "), err
		},
		Install: func(_ context.Context, binary, version string) error {
			installs = append(installs, installCall{binary, version})
			return nil
		},
		Restart: func(string) { restarted <- struct{}{} },
	}
	return u, &installs, restarted
}

func TestUpdateInstallsAVerifiedNewerReleaseThenRestarts(t *testing.T) {
	binary := []byte("agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", binary)
	u, installs, restarted := testUpdater(t, server)
	result, err := u.Update(context.Background(), "1.3.0")
	if err != nil {
		t.Fatal(err)
	}
	if result["accepted"] != true || result["version"] != "1.3.0" || result["from"] != "1.2.3" {
		t.Fatalf("unexpected result %v", result)
	}
	want := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0", "remotelink-v1.3.0-linux-amd64")
	if len(*installs) != 1 || (*installs)[0] != (installCall{want, "1.3.0"}) {
		t.Fatalf("install calls %v", *installs)
	}
	if b, _ := os.ReadFile(want); string(b) != string(binary) {
		t.Fatal("the verified binary is written where the launcher keeps downloads")
	}
	// Windows has no Unix permission bits (it always reports rw-rw-rw-); the
	// owner-only mode matters where remote updates run.
	if info, _ := os.Stat(want); runtime.GOOS != "windows" && info.Mode().Perm() != 0o700 {
		t.Fatalf("binary mode %v", info.Mode().Perm())
	}
	select {
	case <-restarted:
	case <-time.After(3 * time.Second):
		t.Fatal("the worker restarts after replying")
	}
}

func TestUpdateRefusesBeforeTouchingAnything(t *testing.T) {
	cases := map[string]struct {
		version string
		change  func(*Updater)
		code    string
	}{
		"same release":     {"1.2.3", nil, "AGENT_UPDATE_NOT_NEWER"},
		"downgrade":        {"1.2.2", nil, "AGENT_UPDATE_NOT_NEWER"},
		"pre-release":      {"1.3.0-rc.1", nil, "AGENT_UPDATE_INVALID_VERSION"},
		"path in version":  {"1.3.0/../x", nil, "AGENT_UPDATE_INVALID_VERSION"},
		"FreeBSD":          {"1.3.0", func(u *Updater) { u.Platform = "freebsd" }, "AGENT_UPDATE_UNSUPPORTED"},
		"no background":    {"1.3.0", func(u *Updater) { u.Background = func(context.Context) bool { return false } }, "AGENT_UPDATE_NEEDS_BACKGROUND"},
		"busy":             {"1.3.0", func(u *Updater) { u.Busy = func() string { return "1 managed process(es)" } }, "AGENT_UPDATE_BUSY"},
		"unpublished arch": {"1.3.0", func(u *Updater) { u.Arch = "386" }, "AGENT_UPDATE_UNSUPPORTED"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
			u, installs, _ := testUpdater(t, server)
			if c.change != nil {
				c.change(u)
			}
			_, err := u.Update(context.Background(), c.version)
			if err == nil || !strings.HasPrefix(err.Error(), c.code) {
				t.Fatalf("want %s, got %v", c.code, err)
			}
			if server.hits.Load() != 0 || len(*installs) != 0 {
				t.Fatal("a refused update makes no request and installs nothing")
			}
		})
	}
}

func TestUpdateTrustsOnlyThePublishedChecksum(t *testing.T) {
	t.Run("a wrong mirror falls back to GitHub", func(t *testing.T) {
		server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
		server.mirror = []byte("agent 1.3.0 tampered")
		u, installs, _ := testUpdater(t, server)
		if _, err := u.Update(context.Background(), "1.3.0"); err != nil || len(*installs) != 1 {
			t.Fatalf("err %v installs %v", err, *installs)
		}
	})
	t.Run("no source with matching bytes", func(t *testing.T) {
		server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
		server.github = []byte("agent 1.3.0 tampered")
		u, installs, _ := testUpdater(t, server)
		_, err := u.Update(context.Background(), "1.3.0")
		if err == nil || !strings.HasPrefix(err.Error(), "AGENT_UPDATE_DOWNLOAD_FAILED") || len(*installs) != 0 {
			t.Fatalf("err %v installs %v", err, *installs)
		}
		if _, statErr := os.Stat(filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0", "remotelink-v1.3.0-linux-amd64")); !os.IsNotExist(statErr) {
			t.Fatal("unverified bytes are never written")
		}
	})
	t.Run("manifest for another release", func(t *testing.T) {
		server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
		server.manifestVersion = "1.2.9"
		u, installs, _ := testUpdater(t, server)
		_, err := u.Update(context.Background(), "1.3.0")
		if err == nil || !strings.HasPrefix(err.Error(), "AGENT_UPDATE_MANIFEST_INVALID") || len(*installs) != 0 {
			t.Fatalf("err %v", err)
		}
	})
	t.Run("no checksum for this platform", func(t *testing.T) {
		server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
		server.checksums = map[string]string{"remotelink-v1.3.0-darwin-arm64": strings.Repeat("a", 64)}
		u, _, _ := testUpdater(t, server)
		if _, err := u.Update(context.Background(), "1.3.0"); err == nil || !strings.HasPrefix(err.Error(), "AGENT_UPDATE_MANIFEST_INVALID") {
			t.Fatalf("err %v", err)
		}
	})
	t.Run("a binary reporting another version", func(t *testing.T) {
		server := newReleaseServer(t, "1.3.0", []byte("agent 1.2.9"))
		u, installs, _ := testUpdater(t, server)
		_, err := u.Update(context.Background(), "1.3.0")
		if err == nil || !strings.HasPrefix(err.Error(), "AGENT_UPDATE_VERIFY_FAILED") || len(*installs) != 0 {
			t.Fatalf("err %v", err)
		}
	})
}

func TestBusySummaryCountsWorkARestartWouldStop(t *testing.T) {
	idle := map[string]any{"activeWork": map[string]any{"managedProcesses": 0, "browser_runner_sessions": 0}}
	if got := busySummary(idle); got != "" {
		t.Fatalf("idle reported %q", got)
	}
	busy := map[string]any{"activeWork": map[string]any{"managedProcesses": 2, "browser_runner_sessions": 1}}
	if got := busySummary(busy); got != "2 managed process(es), 1 browser_runner session(s)" {
		t.Fatalf("busy reported %q", got)
	}
}

func TestOnlyABackgroundWorkerOnASupportedPlatformOffersRemoteUpdates(t *testing.T) {
	for _, c := range []struct {
		platform   string
		background bool
		wake       bool
		want       bool
	}{
		{"linux", true, false, true},
		{"linux", false, false, false},
		{"linux", true, true, false},
		{"darwin", true, false, true},
		{"windows", true, false, true},
		{"darwin", false, false, false},
		{"windows", false, false, false},
		{"freebsd", true, false, false},
	} {
		a := &Agent{BackgroundProcess: c.background, WakeOnly: c.wake, Updater: &Updater{Platform: c.platform}}
		if got := a.remoteUpdateReady(); got != c.want {
			t.Fatalf("%+v: got %v", c, got)
		}
	}
}

func TestProbeVersionRunsTheDownloadedBinary(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("RA_FAKE_AGENT_VERSION", "1.3.0")
	if got, err := probeVersion(context.Background(), self); err != nil || got != "1.3.0" {
		t.Fatalf("probe got %q, %v", got, err)
	}
	if _, err := probeVersion(context.Background(), filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("a missing binary cannot pass the probe")
	}
}

func TestUpdateAgentDispatchesToTheUpdater(t *testing.T) {
	server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
	u, installs, _ := testUpdater(t, server)
	a := &Agent{BackgroundProcess: true, Updater: u}
	result, err := a.updateAgent(context.Background(), map[string]any{"version": "1.3.0"})
	if err != nil || result.(map[string]any)["accepted"] != true || len(*installs) != 1 {
		t.Fatalf("result %v err %v installs %v", result, err, *installs)
	}
	if _, err := a.updateAgent(context.Background(), map[string]any{}); err == nil ||
		!strings.HasPrefix(err.Error(), "AGENT_UPDATE_INVALID_VERSION") {
		t.Fatalf("a call without a version is refused, got %v", err)
	}
}

func TestDefaultUpdaterUsesThePublishedSourcesAndThisWorker(t *testing.T) {
	stopped := make(chan struct{}, 1)
	a := &Agent{Version: "1.2.3", Stop: func() { stopped <- struct{}{} }}
	if got := a.updater(); got.Platform != runtime.GOOS {
		t.Fatalf("the default updater serves this platform, got %s", got.Platform)
	}
	u := newUpdaterFor(a, "linux")
	if u.Version != "1.2.3" || u.Arch != runtime.GOARCH {
		t.Fatalf("updater describes another Agent: %+v", u)
	}
	if u.ManifestURL != releaseManifestURL || len(u.BinaryURLs) != 2 ||
		u.BinaryURLs[0] != releaseMirrorURL || u.BinaryURLs[1] != releaseGitHubURL {
		t.Fatal("the checksum manifest must come from GitHub Releases, binaries from the mirror then GitHub")
	}
	if u.Background(context.Background()) {
		t.Fatal("a worker the background service did not start never updates itself")
	}
	a.BackgroundProcess = true
	if u.Background(context.Background()) {
		t.Fatal("without a service controller there is no service to restart")
	}
	if busy := u.Busy(); busy != "" {
		t.Fatalf("an Agent without work reported %q", busy)
	}
	u.Restart("")
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("on Linux, Restart ends this worker so systemd starts the new unit")
	}
	newUpdaterFor(&Agent{}, "linux").Restart("") // no Stop wired: nothing to end, and no panic
}

func TestPublishedAssetNamesMatchTheLauncher(t *testing.T) {
	for _, c := range []struct{ platform, arch, want string }{
		{"linux", "amd64", "remotelink-v1.3.0-linux-amd64"},
		{"linux", "arm64", "remotelink-v1.3.0-linux-arm64"},
		{"darwin", "arm64", "remotelink-v1.3.0-darwin-arm64"},
		{"darwin", "amd64", "remotelink-v1.3.0-darwin-amd64"},
		{"windows", "amd64", "remotelink-v1.3.0-windows-amd64.exe"},
	} {
		u := &Updater{Platform: c.platform, Arch: c.arch}
		if got, err := u.asset("1.3.0"); err != nil || got != c.want {
			t.Fatalf("%s/%s: got %q, %v", c.platform, c.arch, got, err)
		}
	}
	if _, err := (&Updater{Platform: "freebsd", Arch: "amd64"}).asset("1.3.0"); err == nil {
		t.Fatal("no Agent is published for FreeBSD")
	}
}

func TestWindowsUpdateHandsTheVerifiedBinaryToTheHandoff(t *testing.T) {
	binary := []byte("agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", binary)
	server.checksums = map[string]string{"remotelink-v1.3.0-windows-amd64.exe": digest(binary)}
	u, installs, _ := testUpdater(t, server)
	u.Platform = "windows"
	handed := make(chan string, 1)
	u.Restart = func(path string) { handed <- path }
	if _, err := u.Update(context.Background(), "1.3.0"); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0", "remotelink-v1.3.0-windows-amd64.exe")
	if len(*installs) != 1 || (*installs)[0].binary != want {
		t.Fatalf("install calls %v", *installs)
	}
	select {
	case got := <-handed:
		if got != want {
			t.Fatalf("handed over %q, want %q", got, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("the verified binary is handed over after the reply")
	}
}

func TestDesktopUpdaterStartsTheNewAgentDetachedForAnUpdateHandoff(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	for _, platform := range []string{"darwin", "windows"} {
		t.Run(platform, func(t *testing.T) {
			home := t.TempDir()
			marker := filepath.Join(t.TempDir(), "handoff")
			t.Setenv("RA_FAKE_AGENT_HANDOFF", marker)
			u := newUpdaterFor(&Agent{Version: "1.2.3"}, platform)
			u.Home = home
			// The new binary's own handoff installs its service, so nothing is installed here.
			if err := u.Install(context.Background(), self, "1.3.0"); err != nil {
				t.Fatal(err)
			}
			u.Restart(self)
			deadline := time.Now().Add(10 * time.Second)
			var report []byte
			for time.Now().Before(deadline) {
				if report, err = os.ReadFile(marker); err == nil && len(report) > 0 {
					break
				}
				time.Sleep(50 * time.Millisecond)
			}
			if !strings.HasPrefix(string(report), "args=--background --update-handoff ") {
				t.Fatalf("the new Agent must start with --background --update-handoff, got %q", report)
			}
			if runtime.GOOS != "windows" && !strings.Contains(string(report), "session=leader") {
				t.Fatalf("the new Agent must lead its own session, outside this Agent's process group: %q", report)
			}
			for time.Now().Before(deadline) {
				if log, _ := os.ReadFile(filepath.Join(home, ".remotearc", "logs", "agent-update.log")); strings.Contains(string(log), "fake Agent handoff started") {
					return
				}
				time.Sleep(50 * time.Millisecond)
			}
			t.Fatal("the new Agent's output goes to logs/agent-update.log")
		})
	}
	if err := startHandoff(t.TempDir(), filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("a missing binary cannot be started")
	}
}

func TestUpdateReusesAVerifiedDownload(t *testing.T) {
	binary := []byte("agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", binary)
	u, installs, _ := testUpdater(t, server)
	dir := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "remotelink-v1.3.0-linux-amd64"), binary, 0o700); err != nil {
		t.Fatal(err)
	}
	u.BinaryURLs = []string{server.URL + "/missing/%s/%s"}
	if _, err := u.Update(context.Background(), "1.3.0"); err != nil || len(*installs) != 1 {
		t.Fatalf("a matching earlier download is reused: err %v", err)
	}
}

func TestUpdateRefusesManifestsItCannotTrust(t *testing.T) {
	serve := func(t *testing.T, body string) string {
		t.Helper()
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(body))
		}))
		t.Cleanup(s.Close)
		return s.URL + "/%s"
	}
	closed := httptest.NewServer(http.NotFoundHandler())
	unreachable := closed.URL + "/%s"
	closed.Close()
	for name, c := range map[string]struct {
		url  func(t *testing.T, server *releaseServer) string
		code string
	}{
		"not published": {func(_ *testing.T, s *releaseServer) string { return s.URL + "/nothing/%s" }, "AGENT_UPDATE_MANIFEST_UNAVAILABLE"},
		"unreachable":   {func(*testing.T, *releaseServer) string { return unreachable }, "AGENT_UPDATE_MANIFEST_UNAVAILABLE"},
		"oversized":     {func(t *testing.T, _ *releaseServer) string { return serve(t, strings.Repeat(" ", maxManifestBytes+1)) }, "AGENT_UPDATE_MANIFEST_UNAVAILABLE"},
		"not JSON":      {func(t *testing.T, _ *releaseServer) string { return serve(t, "not json") }, "AGENT_UPDATE_MANIFEST_INVALID"},
		"bad URL":       {func(*testing.T, *releaseServer) string { return "http://bad host/%s" }, "AGENT_UPDATE_MANIFEST_UNAVAILABLE"},
	} {
		t.Run(name, func(t *testing.T) {
			server := newReleaseServer(t, "1.3.0", []byte("agent 1.3.0"))
			u, installs, _ := testUpdater(t, server)
			u.ManifestURL = c.url(t, server)
			_, err := u.Update(context.Background(), "1.3.0")
			if err == nil || !strings.HasPrefix(err.Error(), c.code) || len(*installs) != 0 {
				t.Fatalf("want %s, got %v", c.code, err)
			}
		})
	}
}
