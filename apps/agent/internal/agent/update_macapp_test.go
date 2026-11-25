package agent

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

type zipEntry struct {
	name string
	body string
	mode fs.FileMode
}

func appZip(t *testing.T, entries ...zipEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, e := range entries {
		header := &zip.FileHeader{Name: e.name, Method: zip.Deflate}
		header.SetMode(e.mode)
		f, err := w.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(e.body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// agentApp is the shape ditto gives the published Agent app.
func agentApp(t *testing.T, program string) []byte {
	return appZip(t,
		zipEntry{"Remote Arc.app/", "", fs.ModeDir | 0o755},
		zipEntry{"Remote Arc.app/Contents/", "", fs.ModeDir | 0o755},
		zipEntry{"Remote Arc.app/Contents/Info.plist", "<plist/>", 0o644},
		zipEntry{"Remote Arc.app/Contents/MacOS/remotelink", program, 0o755},
		zipEntry{"Remote Arc.app/Contents/Resources/AppIcon.icns", "icon", 0o644},
		zipEntry{"Remote Arc.app/Contents/_CodeSignature/CodeResources", "seal", 0o644},
	)
}

func TestMacAppUpdateInstallsTheNewReleasesSignedApp(t *testing.T) {
	archive := agentApp(t, "agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", archive)
	// The app's checksum is published on its own; the bare binary's is not used.
	server.checksums = map[string]string{"remotelink-v1.3.0-darwin-universal.app.zip": digest(archive)}
	u, installs, _ := testUpdater(t, server)
	u.Platform, u.Arch, u.App = "darwin", "arm64", true
	u.VerifyApp = signedByRemoteArc
	u.ManifestURL = server.URL + "/unused/v%s/go-binaries.json"
	u.AppManifestURL = server.URL + "/releases/v%s/go-binaries.json"
	handed := make(chan string, 1)
	u.Restart = func(path string) { handed <- path }
	if _, err := u.Update(context.Background(), "1.3.0"); err != nil {
		t.Fatal(err)
	}
	downloads := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0")
	want := filepath.Join(downloads, "Remote Arc.app", "Contents", "MacOS", "remotelink")
	if len(*installs) != 1 || (*installs)[0] != (installCall{want, "1.3.0"}) {
		t.Fatalf("install calls %v, want the program inside the unpacked app", *installs)
	}
	for name, body := range map[string]string{
		"Contents/MacOS/remotelink":             "agent 1.3.0",
		"Contents/Info.plist":                   "<plist/>",
		"Contents/_CodeSignature/CodeResources": "seal",
	} {
		b, err := os.ReadFile(filepath.Join(downloads, "Remote Arc.app", filepath.FromSlash(name)))
		if err != nil || string(b) != body {
			t.Fatalf("%s: %q %v", name, b, err)
		}
	}
	// Windows has no execute bits; the macOS and Linux runs check the mode.
	if info, _ := os.Stat(want); runtime.GOOS != "windows" && info.Mode().Perm() != 0o755 {
		t.Fatalf("program mode %v", info.Mode().Perm())
	}
	select {
	case got := <-handed:
		if got != want {
			t.Fatalf("handed over %q, want %q", got, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("the unpacked app is handed over after the reply")
	}
}

func TestMacAppUpdateRefusesARelease(t *testing.T) {
	archive := agentApp(t, "agent 1.3.0")
	for name, checksums := range map[string]map[string]string{
		"without a published app":    {"remotelink-v1.3.0-darwin-arm64": digest([]byte("bare"))},
		"whose app checksum differs": {"remotelink-v1.3.0-darwin-universal.app.zip": digest([]byte("other"))},
	} {
		t.Run(name, func(t *testing.T) {
			server := newReleaseServer(t, "1.3.0", archive)
			server.checksums = checksums
			u, installs, _ := testUpdater(t, server)
			u.Platform, u.Arch, u.App = "darwin", "arm64", true
			u.VerifyApp = signedByRemoteArc
			u.AppManifestURL = server.URL + "/releases/v%s/go-binaries.json"
			if _, err := u.Update(context.Background(), "1.3.0"); err == nil {
				t.Fatal("an app Agent updated without a verified app")
			}
			if len(*installs) != 0 {
				t.Fatal("a refused update installed something")
			}
		})
	}
}

// signedByRemoteArc stands in for codesign, which only macOS has.
func signedByRemoteArc(_ context.Context, app string) error {
	if filepath.Base(app) != "Remote Arc.app" {
		return errors.New("not the Agent app")
	}
	return nil
}

func TestMacAppUpdateRefusesAnAppRemoteArcDidNotSign(t *testing.T) {
	archive := agentApp(t, "agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", archive)
	server.checksums = map[string]string{"remotelink-v1.3.0-darwin-universal.app.zip": digest(archive)}
	u, installs, _ := testUpdater(t, server)
	u.Platform, u.Arch, u.App = "darwin", "arm64", true
	u.AppManifestURL = server.URL + "/releases/v%s/go-binaries.json"
	u.VerifyApp = func(context.Context, string) error { return errors.New("signed by someone else") }
	if _, err := u.Update(context.Background(), "1.3.0"); err == nil || len(*installs) != 0 {
		t.Fatalf("an app with another signature was installed: %v", err)
	}
}

// A bare macOS binary (Homebrew, npm, curl) moves to the signed app when the
// release publishes one, so macOS names it Remote Arc from then on.
func TestBareMacAgentUpdatesToTheAppWhenTheReleaseHasOne(t *testing.T) {
	archive := agentApp(t, "agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", archive)
	server.checksums = map[string]string{"remotelink-v1.3.0-darwin-universal.app.zip": digest(archive)}
	u, installs, _ := testUpdater(t, server)
	u.Platform, u.Arch, u.App = "darwin", "arm64", false
	u.AppManifestURL = server.URL + "/releases/v%s/go-binaries.json"
	u.VerifyApp = signedByRemoteArc
	if _, err := u.Update(context.Background(), "1.3.0"); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0", "Remote Arc.app", "Contents", "MacOS", "remotelink")
	if len(*installs) != 1 || (*installs)[0].binary != want {
		t.Fatalf("install calls %v, want the app's program", *installs)
	}
}

// Without a published app (or one that fails its checks) a bare binary still
// updates as before.
func TestBareMacAgentKeepsUpdatingAsABinaryWithoutAnApp(t *testing.T) {
	binary := []byte("agent 1.3.0")
	server := newReleaseServer(t, "1.3.0", binary)
	server.checksums = map[string]string{"remotelink-v1.3.0-darwin-arm64": digest(binary)}
	u, installs, _ := testUpdater(t, server)
	u.Platform, u.Arch, u.App = "darwin", "arm64", false
	u.AppManifestURL = server.URL + "/releases/v%s/go-binaries.json"
	u.VerifyApp = signedByRemoteArc
	if _, err := u.Update(context.Background(), "1.3.0"); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(u.Home, ".remotearc", "agent", "downloads", "1.3.0", "remotelink-v1.3.0-darwin-arm64")
	if len(*installs) != 1 || (*installs)[0].binary != want {
		t.Fatalf("install calls %v, want the bare binary", *installs)
	}
}
