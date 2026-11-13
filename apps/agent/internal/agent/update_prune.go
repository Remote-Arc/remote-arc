package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/release"
)

// pruneAgentReleases removes only recognized, superseded Go Agent release
// directories. It never follows links, removes unfamiliar contents, or touches
// the active/future version. The newest older stable release is kept as the
// rollback copy, so going back one release needs no download. This is
// intentionally not a general disk cleaner.
func pruneAgentReleases(home, current string) (int, error) {
	if !filepath.IsAbs(home) || !release.Older("0.0.0", current) {
		return 0, nil
	}
	type candidate struct{ kind, dir, version string }
	var candidates []candidate
	var failures []error
	for _, kind := range []string{"bin", "downloads"} {
		root := filepath.Join(home, ".remotearc", "agent", kind)
		safe, err := safePrunePath(home, root)
		if err != nil {
			failures = append(failures, err)
			continue
		}
		if !safe {
			continue
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			failures = append(failures, err)
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
				continue
			}
			version := entry.Name()
			if kind == "bin" {
				if !strings.HasPrefix(version, "go-") {
					continue
				}
				version = strings.TrimPrefix(version, "go-")
			}
			if !safeAgentReleaseVersion.MatchString(version) || !release.Older(version, current) {
				continue
			}
			candidates = append(candidates, candidate{kind, filepath.Join(root, entry.Name()), version})
		}
	}
	rollback := ""
	for _, c := range candidates {
		stable := !strings.Contains(c.version, "-")
		if stable && (rollback == "" || release.Older(rollback, c.version)) {
			rollback = c.version
		}
	}
	removed := 0
	for _, c := range candidates {
		if c.version == rollback {
			continue
		}
		ok, err := pruneOneAgentRelease(c.dir, c.kind, c.version)
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", c.dir, err))
		}
		if ok {
			removed++
		}
	}
	return removed, errors.Join(failures...)
}

var safeAgentReleaseVersion = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`)

// safePrunePath refuses a symlinked home, configuration parent, or cache root.
// Missing roots are fine: cleanup must not create directories.
func safePrunePath(home, root string) (bool, error) {
	for _, path := range []string{
		home, filepath.Join(home, ".remotearc"),
		filepath.Join(home, ".remotearc", "agent"), root,
	} {
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return false, nil
		}
	}
	return true, nil
}

func pruneOneAgentRelease(dir, kind, version string) (bool, error) {
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return false, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}
	var downloadName = regexp.MustCompile(`^remotelink-v` + regexp.QuoteMeta(version) + `-(?:linux|darwin|windows)-(?:amd64|arm64)(?:\.exe)?$`)
	for _, entry := range entries {
		name := entry.Name()
		recognized := kind == "bin" && (name == "remotelink" || name == "remotelink.exe") ||
			kind == "downloads" && downloadName.MatchString(name)
		if !recognized || !entry.Type().IsRegular() {
			return false, nil // Preserve directories with unexpected files or links.
		}
	}
	// Remove only the recognized direct files, not a recursively traversed tree.
	// If something else appears in the directory meanwhile, rmdir fails closed.
	for _, entry := range entries {
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			return false, err
		}
	}
	if err := os.Remove(dir); err != nil {
		return false, err
	}
	return true, nil
}

// Run after the replacement service has actually connected and confirmed it
// owns the current release. A failed installation leaves old binaries intact.
func (a *Agent) scheduleReleasePrune() {
	if !a.BackgroundProcess || a.WakeOnly || a.Background == nil ||
		!safeAgentReleaseVersion.MatchString(a.Version) {
		return
	}
	a.releasePrune.Do(func() {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			status := a.Background.Status(ctx)
			if !status.Enabled || !status.Active || status.Engine != "go" || status.Version != a.Version {
				return
			}
			count, err := pruneAgentReleases(a.updater().Home, a.Version)
			if err != nil {
				a.log("warn", "Could not clean up every superseded Agent release: "+err.Error())
			}
			if count > 0 {
				a.log("info", fmt.Sprintf("Cleaned up %d superseded Agent release directories.", count))
			}
		}()
	})
}
