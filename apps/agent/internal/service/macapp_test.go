package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// fakeApp writes a minimal Agent app bundle under dir and returns its program.
func fakeApp(t *testing.T, dir, program string) string {
	t.Helper()
	app := filepath.Join(dir, "Remote Arc.app")
	files := map[string]string{
		"Contents/Info.plist":                   "<plist>app.remotearc.agent</plist>",
		"Contents/MacOS/remotelink":             program,
		"Contents/Resources/icon.icns":          "icon",
		"Contents/_CodeSignature/CodeResources": "seal",
	}
	for name, body := range files {
		path := filepath.Join(app, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		mode := os.FileMode(0o644)
		if strings.HasPrefix(name, "Contents/MacOS/") {
			mode = 0o755
		}
		if err := os.WriteFile(path, []byte(body), mode); err != nil {
			t.Fatal(err)
		}
	}
	return filepath.Join(app, "Contents", "MacOS", "remotelink")
}

func macController(t *testing.T, home, executable string) (*Controller, *[]string) {
	t.Helper()
	var calls []string
	c := &Controller{Home: home, Platform: "darwin", Executable: executable, Version: "1.2.3", UID: "501", Wait: func(time.Duration) {}}
	c.Run = func(ctx context.Context, name string, args ...string) (string, error) {
		line := name + " " + strings.Join(args, " ")
		calls = append(calls, line)
		if strings.Contains(line, "launchctl print ") {
			r, err := c.read()
			if err != nil {
				return "", errors.New("not loaded")
			}
			return "program = " + r.Binary + "\npid = 101", nil
		}
		return "", nil
	}
	return c, &calls
}

func TestMacServiceRunsTheAgentAppAsAWhole(t *testing.T) {
	home := t.TempDir()
	program := fakeApp(t, filepath.Join(home, "Applications", "Remote Arc.app", "Contents", "Library", "Helpers"), "agent-v1")
	c, _ := macController(t, home, program)
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
	reg, err := c.read()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "Remote Arc.app", "Contents", "MacOS", "remotelink")
	if reg.Binary != want {
		t.Fatalf("registered %q, want the program inside the copied app %q", reg.Binary, want)
	}
	for name, body := range map[string]string{
		"Contents/MacOS/remotelink":             "agent-v1",
		"Contents/Info.plist":                   "<plist>app.remotearc.agent</plist>",
		"Contents/Resources/icon.icns":          "icon",
		"Contents/_CodeSignature/CodeResources": "seal",
	} {
		b, err := os.ReadFile(filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "Remote Arc.app", filepath.FromSlash(name)))
		if err != nil || string(b) != body {
			t.Fatalf("%s was not copied byte for byte: %q %v", name, b, err)
		}
	}
	// Windows has no execute bits; the macOS and Linux runs check the mode.
	if info, _ := os.Stat(want); runtime.GOOS != "windows" && info.Mode().Perm() != 0o755 {
		t.Fatalf("the program lost its permissions: %v", info.Mode())
	}
	if _, err := os.Stat(filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "remotelink")); !os.IsNotExist(err) {
		t.Fatal("a bare remotelink was installed beside the app")
	}
	plist, err := os.ReadFile(c.serviceFile())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(plist), "<string>"+want+"</string><string>--agent</string>") {
		t.Fatalf("launchd does not run the app's program: %s", plist)
	}
	if !strings.Contains(string(plist), "<key>AssociatedBundleIdentifiers</key><array><string>app.remotearc.agent</string></array>") {
		t.Fatalf("the job is not associated with the Agent app: %s", plist)
	}
}

func TestBareMacBinaryIsStillInstalledAsBefore(t *testing.T) {
	home := t.TempDir()
	source := filepath.Join(home, "remotelink")
	os.WriteFile(source, []byte("bare"), 0o755)
	c, _ := macController(t, home, source)
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
	reg, _ := c.read()
	if reg.Binary != filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "remotelink") {
		t.Fatalf("bare binary registered at %q", reg.Binary)
	}
	plist, _ := os.ReadFile(c.serviceFile())
	if strings.Contains(string(plist), "AssociatedBundleIdentifiers") {
		t.Fatal("a bare binary claimed the Agent app's identity")
	}
}

// A bare binary (Homebrew, npm, curl) runs its service from the signed Agent
// app of its version when that is published, and as itself when it is not.
func TestBareMacBinaryRunsItsServiceFromTheFetchedApp(t *testing.T) {
	home := t.TempDir()
	source := filepath.Join(home, "remotelink")
	os.WriteFile(source, []byte("bare"), 0o755)
	app := fakeApp(t, filepath.Join(home, ".remotearc", "agent", "downloads", "1.2.3"), "agent-v1")
	c, _ := macController(t, home, source)
	var asked string
	c.FetchApp = func(_ context.Context, version string) (string, error) {
		asked = version
		return app, nil
	}
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
	reg, _ := c.read()
	want := filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "Remote Arc.app", "Contents", "MacOS", "remotelink")
	if asked != "1.2.3" || reg.Binary != want {
		t.Fatalf("asked for %q, registered %q; want the app of this version at %q", asked, reg.Binary, want)
	}
	if b, _ := os.ReadFile(want); string(b) != "agent-v1" {
		t.Fatal("the fetched app was not installed")
	}
}

func TestBareMacBinaryFallsBackWhenNoAppIsPublished(t *testing.T) {
	home := t.TempDir()
	source := filepath.Join(home, "remotelink")
	os.WriteFile(source, []byte("bare"), 0o755)
	c, _ := macController(t, home, source)
	c.FetchApp = func(context.Context, string) (string, error) { return "", errors.New("not published") }
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
	reg, _ := c.read()
	if reg.Binary != filepath.Join(home, ".remotearc", "agent", "bin", "go-1.2.3", "remotelink") {
		t.Fatalf("registered %q, want the bare binary", reg.Binary)
	}
}

func TestAppAgentDoesNotFetchAnotherApp(t *testing.T) {
	home := t.TempDir()
	program := fakeApp(t, filepath.Join(home, "Applications"), "agent-v1")
	c, _ := macController(t, home, program)
	c.FetchApp = func(context.Context, string) (string, error) {
		t.Fatal("an Agent already running from the app fetched it again")
		return "", nil
	}
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
}
