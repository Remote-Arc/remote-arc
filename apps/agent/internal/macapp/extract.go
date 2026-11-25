package macapp

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// A macOS Agent that runs from its signed app (Bundle) updates to
// the signed app of the new release, so macOS keeps naming it Remote Arc and
// keeps its permissions. publish-desktop-macos.yml publishes that app as a zip
// with its checksum in macos-agent.json, beside the release's other files.
const (
	ManifestURL = "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v%s/macos-agent.json"
	maxAppBytes = 300 << 20 // the unpacked app, both architectures
)

// Asset is the published zip of the Agent app for version.
func Asset(version string) string {
	return "remotelink-v" + version + "-darwin-universal.app.zip"
}

// Extract unpacks the Agent app from archive into dir and returns the path
// of its program. Only the app's own folders and regular files are written:
// an entry outside the app, a link or anything else refuses the whole archive.
func Extract(archive, dir string) (string, error) {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	app := filepath.Join(dir, Bundle)
	// A previous attempt may have left a partial app; it is ours to replace.
	if err := os.RemoveAll(app); err != nil {
		return "", err
	}
	var total uint64
	for _, file := range reader.File {
		name := file.Name
		clean := path.Clean(name)
		if path.IsAbs(name) || strings.Contains(name, `\`) || clean == ".." || strings.HasPrefix(clean, "../") ||
			(clean != Bundle && !strings.HasPrefix(clean, Bundle+"/")) {
			return "", fmt.Errorf("the Agent app archive holds %q, outside the app", name)
		}
		mode := file.Mode()
		target := filepath.Join(dir, filepath.FromSlash(clean))
		switch {
		case mode.IsDir():
			if err := os.MkdirAll(target, 0o755); err != nil {
				return "", err
			}
		case mode.IsRegular():
			total += file.UncompressedSize64
			if total > maxAppBytes {
				return "", errors.New("the Agent app archive is larger than the size limit")
			}
			if err := writeZipFile(file, target, mode.Perm()&0o755); err != nil {
				return "", err
			}
		default:
			return "", fmt.Errorf("the Agent app archive holds %q, which is not a file or folder", name)
		}
	}
	program := filepath.Join(app, "Contents", "MacOS", "remotelink")
	if info, err := os.Lstat(program); err != nil || !info.Mode().IsRegular() || EnclosingApp(program) != app {
		return "", errors.New("the Agent app archive does not hold Remote Arc.app/Contents/MacOS/remotelink")
	}
	return program, nil
}

func writeZipFile(file *zip.File, target string, mode os.FileMode) error {
	in, err := file.Open()
	if err != nil {
		return err
	}
	defer in.Close()
	body, err := io.ReadAll(io.LimitReader(in, int64(file.UncompressedSize64)+1))
	if err != nil {
		return err
	}
	if uint64(len(body)) != file.UncompressedSize64 {
		return fmt.Errorf("the Agent app archive entry %q is not the size it declares", file.Name)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return config.DurableWrite(target, body, mode)
}
