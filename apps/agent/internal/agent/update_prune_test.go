package agent

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
)

func testReleaseFile(t *testing.T, home, directory, version, name string) string {
	t.Helper()
	path := filepath.Join(home, ".remotearc", "agent", directory, version, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("release"), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestPruneAgentReleasesKeepsOnlyRecognizedOlderReleases(t *testing.T) {
	home := t.TempDir()
	oldBin := testReleaseFile(t, home, "bin", "go-0.6.0", "remotelink")
	oldDownload := testReleaseFile(t, home, "downloads", "0.6.0", "remotelink-v0.6.0-linux-amd64")
	// 0.6.6 is the newest older stable release: kept so a rollback needs no download.
	rollbackBin := testReleaseFile(t, home, "bin", "go-0.6.6", "remotelink")
	rollbackDownload := testReleaseFile(t, home, "downloads", "0.6.6", "remotelink-v0.6.6-linux-amd64")
	// A pre-release of the running version is never the rollback copy.
	candidate := testReleaseFile(t, home, "downloads", "0.7.0-rc.1", "remotelink-v0.7.0-rc.1-linux-amd64")
	currentBin := testReleaseFile(t, home, "bin", "go-0.7.0", "remotelink")
	currentDownload := testReleaseFile(t, home, "downloads", "0.7.0", "remotelink-v0.7.0-linux-amd64")
	newerBin := testReleaseFile(t, home, "bin", "go-0.7.9", "remotelink")
	unknown := testReleaseFile(t, home, "bin", "go-custom", "remotelink")
	unfamiliar := testReleaseFile(t, home, "bin", "go-0.6.5", "notes.txt")
	knownButMixed := testReleaseFile(t, home, "downloads", "0.6.4", "remotelink-v0.6.4-windows-amd64.exe")
	extra := testReleaseFile(t, home, "downloads", "0.6.4", "owner-note.txt")

	n, err := pruneAgentReleases(home, "0.7.0")
	if err != nil || n != 3 {
		t.Fatalf("removed %d, error %v; want three recognized old directories", n, err)
	}
	for _, path := range []string{oldBin, oldDownload, candidate} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Errorf("old binary was retained: %s (%v)", path, err)
		}
	}
	for _, path := range []string{rollbackBin, rollbackDownload, currentBin, currentDownload, newerBin, unknown, unfamiliar, knownButMixed, extra} {
		if _, err := os.Lstat(path); err != nil {
			t.Errorf("unexpected deletion of %s: %v", path, err)
		}
	}
	if n, err := pruneAgentReleases(home, "0.7.0"); n != 0 || err != nil {
		t.Fatalf("cleanup must be idempotent: %d %v", n, err)
	}
}

func TestPruneAgentReleasesRejectsUnsafeRootsAndVersions(t *testing.T) {
	home := t.TempDir()
	path := testReleaseFile(t, home, "bin", "go-0.6.6", "remotelink")
	for _, version := range []string{"", "invalid", "0.0.0", "0.6.6"} {
		if n, err := pruneAgentReleases(home, version); n != 0 || err != nil {
			t.Errorf("%q: deleted %d or failed: %v", version, n, err)
		}
	}
	if n, err := pruneAgentReleases("relative", "0.7.0"); n != 0 || err != nil {
		t.Fatalf("relative home accepted: %d %v", n, err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("an invalid version altered a release: %v", err)
	}
}

func TestPruneAgentReleasesDoesNotFollowLinks(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows requires optional symlink privileges")
	}
	t.Run("version link", func(t *testing.T) {
		home := t.TempDir()
		outside := t.TempDir()
		target := filepath.Join(outside, "important.txt")
		if err := os.WriteFile(target, []byte("private"), 0o600); err != nil {
			t.Fatal(err)
		}
		root := filepath.Join(home, ".remotearc", "agent", "downloads")
		if err := os.MkdirAll(root, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(outside, filepath.Join(root, "0.6.6")); err != nil {
			t.Fatal(err)
		}
		if n, err := pruneAgentReleases(home, "0.7.0"); n != 0 || err != nil {
			t.Fatalf("link removed %d %v", n, err)
		}
		if _, err := os.Stat(target); err != nil {
			t.Fatalf("followed a version link: %v", err)
		}
	})
	t.Run("cache parent link", func(t *testing.T) {
		home := t.TempDir()
		outside := t.TempDir()
		target := testReleaseFile(t, outside, "downloads", "0.6.6", "remotelink-v0.6.6-linux-amd64")
		agent := filepath.Join(home, ".remotearc", "agent")
		if err := os.MkdirAll(agent, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(filepath.Join(outside, ".remotearc", "agent", "downloads"), filepath.Join(agent, "downloads")); err != nil {
			t.Fatal(err)
		}
		if n, err := pruneAgentReleases(home, "0.7.0"); n != 0 || err != nil {
			t.Fatalf("linked root removed %d %v", n, err)
		}
		if _, err := os.Stat(target); err != nil {
			t.Fatalf("followed a cache link: %v", err)
		}
	})
}

type pruneTestBackground struct {
	status  service.Status
	checked chan struct{}
}

func (b *pruneTestBackground) Status(context.Context) service.Status {
	close(b.checked)
	return b.status
}
func (b *pruneTestBackground) Enable(context.Context) (service.Status, error) { return b.status, nil }
func (b *pruneTestBackground) Disable(context.Context) error                  { return nil }

func TestReleasePruneRunsAfterHealthyNewBackgroundService(t *testing.T) {
	home := t.TempDir()
	old := testReleaseFile(t, home, "bin", "go-0.6.5", "remotelink")
	rollback := testReleaseFile(t, home, "bin", "go-0.6.6", "remotelink")
	background := &pruneTestBackground{
		status:  service.Status{Enabled: true, Active: true, Engine: "go", Version: "0.7.0"},
		checked: make(chan struct{}),
	}
	a := &Agent{
		Version: "0.7.0", BackgroundProcess: true, Background: background,
		Updater: &Updater{Home: home},
	}
	a.scheduleReleasePrune()
	select {
	case <-background.checked:
	case <-time.After(3 * time.Second):
		t.Fatal("did not check the running service")
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Lstat(old); os.IsNotExist(err) {
			if _, err := os.Lstat(rollback); err != nil {
				t.Fatalf("the previous release was not kept for rollback: %v", err)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("superseded binary was not cleaned after the current service was healthy")
}

func TestReleasePruneLeavesOldVersionsWhenServiceIsNotConfirmed(t *testing.T) {
	for name, status := range map[string]service.Status{
		"offline":       {Enabled: true, Active: false, Engine: "go", Version: "0.7.0"},
		"disabled":      {Enabled: false, Active: true, Engine: "go", Version: "0.7.0"},
		"other version": {Enabled: true, Active: true, Engine: "go", Version: "0.6.6"},
		"other engine":  {Enabled: true, Active: true, Engine: "ts", Version: "0.7.0"},
	} {
		t.Run(name, func(t *testing.T) {
			home := t.TempDir()
			old := testReleaseFile(t, home, "bin", "go-0.6.6", "remotelink")
			b := &pruneTestBackground{status: status, checked: make(chan struct{})}
			a := &Agent{Version: "0.7.0", BackgroundProcess: true, Background: b, Updater: &Updater{Home: home}}
			a.scheduleReleasePrune()
			select {
			case <-b.checked:
			case <-time.After(3 * time.Second):
				t.Fatal("did not inspect service state")
			}
			// The service was not verified, so there is no allowed deletion.
			if _, err := os.Stat(old); err != nil {
				t.Fatalf("removed a version without a healthy new service: %v", err)
			}
		})
	}
}
