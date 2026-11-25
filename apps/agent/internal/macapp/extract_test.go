package macapp

import (
	"archive/zip"
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
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

func TestExtractAppRefusesAnythingButTheAppsFilesAndFolders(t *testing.T) {
	cases := map[string][]zipEntry{
		"a path out of the folder": {{"Remote Arc.app/../../evil", "x", 0o644}},
		"an absolute path":         {{"/tmp/evil", "x", 0o644}},
		"another app":              {{"Other.app/Contents/MacOS/remotelink", "x", 0o755}},
		"a link":                   {{"Remote Arc.app/Contents/MacOS/remotelink", "/bin/sh", fs.ModeSymlink | 0o777}},
		"no program":               {{"Remote Arc.app/Contents/Info.plist", "<plist/>", 0o644}},
	}
	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			dir := filepath.Join(root, "downloads")
			os.MkdirAll(dir, 0o700)
			archive := filepath.Join(dir, "app.zip")
			os.WriteFile(archive, appZip(t, entries...), 0o600)
			if _, err := Extract(archive, dir); err == nil {
				t.Fatal("the archive was accepted")
			}
			if _, err := os.Lstat(filepath.Join(root, "evil")); !os.IsNotExist(err) {
				t.Fatal("a file was written outside the download folder")
			}
		})
	}
}

func TestExtractAppReplacesAPartialEarlierApp(t *testing.T) {
	dir := t.TempDir()
	stale := filepath.Join(dir, "Remote Arc.app", "Contents", "stale")
	os.MkdirAll(filepath.Dir(stale), 0o755)
	os.WriteFile(stale, []byte("left over"), 0o644)
	archive := filepath.Join(dir, "app.zip")
	os.WriteFile(archive, agentApp(t, "agent 1.3.0"), 0o600)
	program, err := Extract(archive, dir)
	if err != nil || !strings.HasSuffix(program, filepath.Join("Remote Arc.app", "Contents", "MacOS", "remotelink")) {
		t.Fatalf("%q %v", program, err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("a file from an earlier attempt stayed in the app")
	}
}
