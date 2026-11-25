package macapp

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

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

func TestEnclosingAppFindsOnlyAnAppProgram(t *testing.T) {
	dir := t.TempDir()
	program := fakeApp(t, dir, "agent")
	if got := EnclosingApp(program); got != filepath.Join(dir, "Remote Arc.app") {
		t.Fatalf("EnclosingApp(%q) = %q", program, got)
	}
	bare := filepath.Join(dir, "remotelink")
	os.WriteFile(bare, []byte("agent"), 0o755)
	if got := EnclosingApp(bare); got != "" {
		t.Fatalf("a bare binary is not in an app: %q", got)
	}
	// Contents/MacOS without an Info.plist is not a bundle macOS would name.
	plain := filepath.Join(dir, "Other.app", "Contents", "MacOS", "remotelink")
	os.MkdirAll(filepath.Dir(plain), 0o755)
	os.WriteFile(plain, []byte("agent"), 0o755)
	if got := EnclosingApp(plain); got != "" {
		t.Fatalf("a folder without Info.plist is not an app: %q", got)
	}
}

func TestMacAppCopyIsReplacedOnlyWhenItDiffers(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "bin")
	program := fakeApp(t, filepath.Join(dir, "a"), "agent-v1")
	binary, err := Install(target, program)
	if err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(target, Bundle, "Contents", "Resources", "icon.icns")
	old := time.Now().Add(-time.Hour).Truncate(time.Second)
	if err := os.Chtimes(marker, old, old); err != nil {
		t.Fatal(err)
	}
	if again, err := Install(target, program); err != nil || again != binary {
		t.Fatalf("second install: %q %v", again, err)
	}
	if info, _ := os.Stat(marker); !info.ModTime().Equal(old) {
		t.Fatal("an identical app was copied again")
	}
	// A rebuilt app of the same version replaces the old copy entirely.
	os.WriteFile(program, []byte("agent-v2"), 0o755)
	os.Remove(filepath.Join(filepath.Dir(filepath.Dir(program)), "Resources", "icon.icns"))
	if _, err := Install(target, program); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(binary); string(b) != "agent-v2" {
		t.Fatalf("the program was not replaced: %q", b)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("a file the new app does not have was left behind")
	}
	entries, _ := os.ReadDir(target)
	if len(entries) != 1 || entries[0].Name() != Bundle {
		t.Fatalf("staging folders were left behind: %v", entries)
	}
}

func TestMacAppWithALinkIsRefused(t *testing.T) {
	dir := t.TempDir()
	program := fakeApp(t, filepath.Join(dir, "a"), "agent")
	if err := os.Symlink("/etc/passwd", filepath.Join(filepath.Dir(filepath.Dir(program)), "Resources", "link")); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	if _, err := Install(filepath.Join(dir, "bin"), program); err == nil {
		t.Fatal("an app holding a link was installed")
	}
	if _, err := os.Lstat(filepath.Join(dir, "bin", Bundle)); !os.IsNotExist(err) {
		t.Fatal("a refused app left a copy behind")
	}
}
