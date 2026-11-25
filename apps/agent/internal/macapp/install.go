package macapp

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// Bundle is the folder name of the macOS app the Agent runs from. macOS
// names and draws a process by its app bundle in System Settings (Screen
// Recording, Accessibility, Login Items), so an Agent run from this signed
// bundle shows as Remote Arc with its icon instead of a bare "remotelink".
// The bundle identifier is BundleID, which also names the launchd job.
const Bundle = "Remote Arc.app"

// BundleID identifies the Agent app; the launchd job uses the same name.
const BundleID = "app.remotearc.agent"

// EnclosingApp returns the .app bundle whose Contents/MacOS folder holds
// executable, or "" when executable is not the program of an app bundle.
func EnclosingApp(executable string) string {
	macos := filepath.Dir(executable)
	contents := filepath.Dir(macos)
	app := filepath.Dir(contents)
	if filepath.Base(macos) != "MacOS" || filepath.Base(contents) != "Contents" || !strings.HasSuffix(app, ".app") {
		return ""
	}
	if info, err := os.Lstat(filepath.Join(contents, "Info.plist")); err != nil || !info.Mode().IsRegular() {
		return ""
	}
	if info, err := os.Lstat(app); err != nil || !info.IsDir() {
		return ""
	}
	return app
}

// Install keeps a copy of the app bundle around source under dir as
// AppBundle and returns the path of source's program inside that copy. The
// copy is byte for byte, so the bundle's code signature stays valid. An
// identical copy is left alone; a different one is replaced as a whole, so a
// running worker keeps the files it started from.
func Install(dir, source string) (string, error) {
	app := EnclosingApp(source)
	if app == "" {
		return "", errors.New("The Agent is not inside an app bundle.")
	}
	target := filepath.Join(dir, Bundle)
	program, err := filepath.Rel(app, source)
	if err != nil {
		return "", err
	}
	binary := filepath.Join(target, program)
	if app == target {
		return binary, nil
	}
	if same, err := sameTree(app, target); err != nil {
		return "", err
	} else if same {
		return binary, nil
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	staging := filepath.Join(dir, "."+Bundle+".new-"+strconv.Itoa(os.Getpid()))
	if err := os.RemoveAll(staging); err != nil {
		return "", err
	}
	if err := copyTree(app, staging); err != nil {
		_ = os.RemoveAll(staging)
		return "", err
	}
	old := filepath.Join(dir, "."+Bundle+".old-"+strconv.Itoa(os.Getpid()))
	if _, err := os.Lstat(target); err == nil {
		if err := os.Rename(target, old); err != nil {
			_ = os.RemoveAll(staging)
			return "", err
		}
	}
	if err := os.Rename(staging, target); err != nil {
		_ = os.Rename(old, target)
		_ = os.RemoveAll(staging)
		return "", err
	}
	_ = os.RemoveAll(old)
	_ = config.SyncDirectoryWithDurability(dir, "durable")
	return binary, nil
}

// copyTree copies the regular files and folders under from to to, keeping
// each file's permission bits. A bundle the Agent installs never holds links,
// so a link is refused rather than copied or followed.
func copyTree(from, to string) error {
	return filepath.WalkDir(from, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(from, path)
		if err != nil {
			return err
		}
		dest := filepath.Join(to, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		switch {
		case info.IsDir():
			return os.MkdirAll(dest, 0o755)
		case info.Mode().IsRegular():
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			return config.DurableWrite(dest, b, info.Mode().Perm())
		default:
			return fmt.Errorf("The app bundle holds %s, which is not a file or folder.", rel)
		}
	})
}

// sameTree reports whether to holds exactly the files and folders of from,
// with the same contents and permission bits.
func sameTree(from, to string) (bool, error) {
	if _, err := os.Lstat(to); errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	count := func(root string) (int, error) {
		n := 0
		err := filepath.WalkDir(root, func(_ string, _ fs.DirEntry, err error) error {
			n++
			return err
		})
		return n, err
	}
	want, err := count(from)
	if err != nil {
		return false, err
	}
	if have, err := count(to); err != nil || have != want {
		return false, nil
	}
	same := true
	err = filepath.WalkDir(from, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(from, path)
		a, err := entry.Info()
		if err != nil {
			return err
		}
		b, err := os.Lstat(filepath.Join(to, rel))
		if err != nil || a.Mode() != b.Mode() {
			same = false
			return filepath.SkipAll
		}
		if a.Mode().IsRegular() {
			x, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			y, err := os.ReadFile(filepath.Join(to, rel))
			if err != nil || !bytes.Equal(x, y) {
				same = false
				return filepath.SkipAll
			}
		}
		return nil
	})
	return same && err == nil, err
}
