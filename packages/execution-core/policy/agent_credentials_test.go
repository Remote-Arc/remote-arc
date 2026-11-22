package policy

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// AI coding agents keep sign-in tokens in their home folders. Session logs stay
// readable for task discovery; credential files and secret stores do not.
func TestAgentCredentialsAreSensitive(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	t.Setenv("CODEX_HOME", "")
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	p := protocol.Policy{}
	blocked := []string{
		filepath.Join(home, ".codex", "auth.json"),
		filepath.Join(home, ".codex", ".credentials.json"),
		filepath.Join(home, ".codex", "secrets", "token"),
		filepath.Join(home, ".codex", ".sandbox-secrets", "x"),
		filepath.Join(home, ".claude", ".credentials.json"),
		filepath.Join(home, ".claude.json"),
		filepath.Join(home, ".config", "gh", "hosts.yml"),
		filepath.Join(home, ".remotearc", "config.json"),
		filepath.Join(home, "project", ".credentials.json"),
	}
	for _, target := range blocked {
		if _, e := Enforce(target, p, false); e == nil {
			t.Fatalf("credential path readable: %s", target)
		}
	}
	allowed := []string{
		filepath.Join(home, ".codex", "sessions", "2026", "rollout.jsonl"),
		filepath.Join(home, ".codex", "config.toml"),
		filepath.Join(home, ".claude", "projects", "p", "s.jsonl"),
		filepath.Join(home, "project", "src", "auth.json"),
	}
	for _, target := range allowed {
		if _, e := Enforce(target, p, false); e != nil {
			t.Fatalf("ordinary agent/project path blocked: %s: %v", target, e)
		}
	}
	// An explicit narrow exception still wins.
	exception := protocol.Policy{SensitiveAllowPaths: []string{filepath.Join(home, ".claude.json")}}
	if _, e := Enforce(filepath.Join(home, ".claude.json"), exception, false); e != nil {
		t.Fatal(e)
	}
	// Protection off keeps the existing opt-out semantics.
	off := false
	if _, e := Enforce(filepath.Join(home, ".codex", "auth.json"), protocol.Policy{ProtectSensitivePaths: &off}, false); e != nil {
		t.Fatal(e)
	}
}

// ~/.codex is often a junction/symlink to another drive. The real location
// must be protected, and CODEX_HOME/CLAUDE_CONFIG_DIR overrides must apply.
func TestAgentCredentialsFollowLinkedHomes(t *testing.T) {
	home, store := t.TempDir(), t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	if runtime.GOOS != "windows" {
		if e := os.Symlink(store, filepath.Join(home, ".codex")); e != nil {
			t.Skip(e)
		}
		t.Setenv("CODEX_HOME", "")
		if _, e := Enforce(filepath.Join(store, "auth.json"), protocol.Policy{}, false); e == nil {
			t.Fatal("linked Codex home credential readable at its real path")
		}
	}
	custom := t.TempDir()
	t.Setenv("CODEX_HOME", custom)
	if _, e := Enforce(filepath.Join(custom, "auth.json"), protocol.Policy{}, false); e == nil {
		t.Fatal("CODEX_HOME credential readable")
	}
	claude := t.TempDir()
	t.Setenv("CLAUDE_CONFIG_DIR", claude)
	if _, e := Enforce(filepath.Join(claude, ".credentials.json"), protocol.Policy{}, false); e == nil {
		t.Fatal("CLAUDE_CONFIG_DIR credential readable")
	}
}

func TestAgentCredentialRootsPerPlatform(t *testing.T) {
	env := map[string]string{"APPDATA": `C:\Users\u\AppData\Roaming`, "CODEX_HOME": " /codex ", "CLAUDE_CONFIG_DIR": ""}
	getenv := func(k string) string { return env[k] }
	win := agentCredentialRootsFor("/home/u", "windows", getenv)
	joined := strings.Join(win, "\n")
	if !strings.Contains(joined, filepath.Join(`C:\Users\u\AppData\Roaming`, "GitHub CLI", "hosts.yml")) || !strings.Contains(joined, filepath.Join("/codex", "auth.json")) {
		t.Fatalf("windows roots missing gh/CODEX_HOME: %v", win)
	}
	if linux := strings.Join(agentCredentialRootsFor("/home/u", "linux", getenv), "\n"); strings.Contains(linux, "GitHub CLI") {
		t.Fatalf("APPDATA root outside Windows: %v", linux)
	}
}
