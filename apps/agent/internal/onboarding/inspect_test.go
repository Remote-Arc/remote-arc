package onboarding

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func fakeDetector(t *testing.T, platform string) detector {
	t.Helper()
	return detector{platform, t.TempDir(), func(string) string { return "" }, func(string) (string, error) { return "", exec.ErrNotFound }}
}

func executable(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("THIS_IS_NOT_EXECUTABLE_CODE_OR_A_VERSION"), 0700); err != nil {
		t.Fatal(err)
	}
}

func TestInspectionDoesNotExecuteOrReadClientContents(t *testing.T) {
	d := fakeDetector(t, runtime.GOOS)
	binary := "codex"
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	path := filepath.Join(d.home, ".local", "bin", binary)
	executable(t, path)
	d.lookup = func(name string) (string, error) {
		if name == "codex" {
			return path, nil
		}
		return "", exec.ErrNotFound
	}
	r, err := d.inspect(context.Background(), "all", "candidate-1")
	if err != nil {
		t.Fatal(err)
	}
	if r.Contract != Contract || r.RuntimeVersion != "candidate-1" || r.Mode != "local-only" || len(r.Clients) != 2 {
		t.Fatalf("unexpected report: %+v", r)
	}
	c := r.Clients[0]
	if c.Status != "candidate_found" || c.Version != "not_checked" || c.Compatibility != "unqualified" || c.Integration != "not_inspected" {
		t.Fatalf("candidate was executed, qualified or duplicated: %+v", c)
	}
	matched := 0
	for _, candidate := range c.Candidates {
		if candidate.Path == path && candidate.Source == "path" {
			matched++
		}
	}
	if matched != 1 {
		t.Fatal("PATH candidate missing or duplicated")
	}
	b, _ := json.Marshal(r)
	if strings.Contains(string(b), "THIS_IS_NOT") {
		t.Fatal("client contents returned")
	}
	if r.Clients[1].Status != "not_found" || r.Clients[1].Candidates == nil {
		t.Fatal("missing candidate not reported explicitly")
	}
}

func TestRejectsRelativeDirectoryAndNonExecutableCandidates(t *testing.T) {
	d := fakeDetector(t, runtime.GOOS)
	paths := []string{"./codex", d.home}
	if runtime.GOOS != "windows" {
		paths = append(paths, filepath.Join(d.home, "not-executable"))
	}
	for _, path := range paths {
		if strings.HasSuffix(path, "not-executable") {
			if err := os.WriteFile(path, []byte("private"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		d.lookup = func(string) (string, error) { return path, nil }
		r, err := d.inspect(context.Background(), "claude", "test")
		if err != nil || r.Clients[0].Status != "not_found" {
			t.Fatalf("invalid candidate accepted: %s (%v)", path, err)
		}
	}
	d.lookup = func(string) (string, error) { return "./codex", exec.ErrDot }
	r, err := d.inspect(context.Background(), "claude", "test")
	if err != nil || len(r.Clients[0].Warnings) != 1 || r.Clients[0].Warnings[0] != "path_lookup_rejected" {
		t.Fatal("relative PATH rejection lost")
	}
}

func TestWindowsNamedInstallLocationsAndBoundedDesktopScan(t *testing.T) {
	d := fakeDetector(t, "windows")
	d.env = func(name string) string {
		if name == "APPDATA" || name == "LOCALAPPDATA" {
			return d.home
		}
		return ""
	}
	executable(t, filepath.Join(d.home, "npm", "claude.cmd"))
	root := filepath.Join(d.home, "OpenAI", "Codex", "bin")
	for i := 0; i < 35; i++ {
		executable(t, filepath.Join(root, fmt.Sprintf("build-%02d", i), "codex.exe"))
	}
	r, err := d.inspect(context.Background(), "all", "test")
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Clients[0].Candidates) != 32 || len(r.Clients[0].Warnings) != 1 || r.Clients[0].Warnings[0] != "desktop_scan_limit_reached" {
		t.Fatalf("unbounded desktop enumeration: %+v", r.Clients[0])
	}
	if len(r.Clients[1].Candidates) != 1 || r.Clients[1].Candidates[0].Source != "known_location" {
		t.Fatal("npm launcher not found")
	}
}

func TestKnownLocationsDoNotEnumerateSessionDirectories(t *testing.T) {
	for _, platform := range []string{"darwin", "windows", "linux"} {
		d := fakeDetector(t, platform)
		for _, agent := range []string{"codex", "claude"} {
			for _, path := range d.knownPaths(agent) {
				if strings.Contains(path, ".codex") || strings.Contains(path, ".claude") || strings.Contains(path, "sessions") {
					t.Fatalf("private directory in install scan: %s", path)
				}
			}
		}
	}
	d := fakeDetector(t, "darwin")
	want := filepath.Join(d.home, "Applications", "Codex.app", "Contents", "Resources", "codex")
	if !strings.Contains(strings.Join(d.knownPaths("codex"), "\n"), want) {
		t.Fatal("per-user desktop bundle location missing")
	}
}

func TestWindowsNpmShimsResolveNativeClientsWithoutExecutingWrapper(t *testing.T) {
	for _, local := range []bool{false, true} {
		for _, agent := range []string{"codex", "claude"} {
			t.Run(fmt.Sprintf("local=%t/%s", local, agent), func(t *testing.T) {
				d := fakeDetector(t, "windows")
				prefix := filepath.Join(d.home, "npm prefix with spaces")
				modules := filepath.Join(prefix, "node_modules")
				shimDir := prefix
				if local {
					shimDir = filepath.Join(modules, ".bin")
				}
				shim := filepath.Join(shimDir, agent+".cmd")
				executable(t, shim)
				d.lookup = func(string) (string, error) { return shim, nil }
				// Without the optional native package, retain only the unqualified
				// shim. Inspection cannot claim it is runnable or supported.
				r, err := d.inspect(context.Background(), agent, "test")
				if err != nil || len(r.Clients[0].Candidates) != 1 {
					t.Fatal("missing native package should not be invented", r, err)
				}
				cpu, triple := "x64", "x86_64-pc-windows-msvc"
				if runtime.GOARCH == "arm64" {
					cpu, triple = "arm64", "aarch64-pc-windows-msvc"
				}
				native := filepath.Join(modules, "@openai", "codex-win32-"+cpu, "vendor", triple, "bin", "codex.exe")
				if agent == "claude" {
					native = filepath.Join(modules, "@anthropic-ai", "claude-code-win32-"+cpu, "claude.exe")
				}
				executable(t, native)
				r, err = d.inspect(context.Background(), agent, "test")
				if err != nil || len(r.Clients[0].Candidates) != 2 || r.Clients[0].Compatibility != "unqualified" || r.Clients[0].Version != "not_checked" {
					t.Fatal("native package discovery should not execute or qualify it", r, err)
				}
				if got := nativeCandidate(r.Clients[0]); runtime.GOOS == "windows" && got != native {
					t.Fatal("npm native executable was not selected", got, native)
				}
			})
		}
	}
}

func TestWindowsNpmDiscoveryRequiresNamedShimAndSupportedArchitecture(t *testing.T) {
	for _, shim := range []string{"codex.cmd", "other.cmd", "codex.exe"} {
		path := filepath.Join(t.TempDir(), shim)
		if got := npmNativeCandidates("codex", path, "386"); len(got) != 0 {
			t.Fatal("unsupported architecture was accepted", got)
		}
		if shim != "codex.cmd" && len(npmNativeCandidates("codex", path, "amd64")) != 0 {
			t.Fatal("non-client shim triggered package discovery")
		}
	}
	if len(npmNativeCandidates("codex", "codex.cmd", "amd64")) != 0 {
		t.Fatal("relative shim triggered package discovery")
	}
}

func TestWindowsNestedNpmPackagesPrecedeBundledWrapperStubs(t *testing.T) {
	for _, agent := range []string{"codex", "claude"} {
		t.Run(agent, func(t *testing.T) {
			d := fakeDetector(t, "windows")
			shim := filepath.Join(d.home, agent+".cmd")
			executable(t, shim)
			d.lookup = func(string) (string, error) { return shim, nil }
			cpu, triple := "x64", "x86_64-pc-windows-msvc"
			if runtime.GOARCH == "arm64" {
				cpu, triple = "arm64", "aarch64-pc-windows-msvc"
			}
			pkg := filepath.Join(d.home, "node_modules", "@openai", "codex")
			native := filepath.Join(pkg, "node_modules", "@openai", "codex-win32-"+cpu, "vendor", triple, "bin", "codex.exe")
			bundled := filepath.Join(pkg, "vendor", triple, "bin", "codex.exe")
			if agent == "claude" {
				pkg = filepath.Join(d.home, "node_modules", "@anthropic-ai", "claude-code")
				native = filepath.Join(pkg, "node_modules", "@anthropic-ai", "claude-code-win32-"+cpu, "claude.exe")
				bundled = filepath.Join(pkg, "bin", "claude.exe")
			}
			executable(t, native)
			executable(t, bundled) // Current Claude npm packages ship a wrapper stub here.
			r, err := d.inspect(context.Background(), agent, "test")
			if err != nil || len(r.Clients[0].Candidates) != 3 {
				t.Fatal("nested npm package not discovered", r, err)
			}
			if got := nativeCandidate(r.Clients[0]); runtime.GOOS == "windows" && got != native {
				t.Fatal("bundled wrapper stub displaced the actual native package", got, native)
			}
		})
	}
}

func TestInvalidSelectionAndCancellationDoNotInspectPaths(t *testing.T) {
	d := fakeDetector(t, "linux")
	d.lookup = func(string) (string, error) { t.Fatal("unexpected path scan"); return "", nil }
	if _, err := d.inspect(context.Background(), "unknown", "test"); err == nil {
		t.Fatal("invalid agent accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := d.inspect(ctx, "all", "test"); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled scan proceeded", err)
	}
}

func TestCLIHelpAndRejectUnsupportedActions(t *testing.T) {
	for _, args := range [][]string{{"setup"}, {"setup", "--help"}, {"setup", "inspect", "--help"}} {
		var out bytes.Buffer
		if err := Run(context.Background(), args, "test", &out); err != nil || !strings.Contains(out.String(), "No executable is run") {
			t.Fatal("inspection help", err)
		}
	}
	for _, args := range [][]string{nil, {"other"}, {"setup", "install"}, {"setup", "inspect", "--agent", "unknown"}, {"setup", "inspect", "extra"}, {"setup", "inspect", "--yes"}} {
		if err := Run(context.Background(), args, "test", &bytes.Buffer{}); err == nil {
			t.Fatalf("unexpected command accepted: %v", args)
		}
	}
}
