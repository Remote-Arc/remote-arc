package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/onboarding"
)

func TestSetupInspectionDoesNotExecutePairOrChangePrivateFiles(t *testing.T) {
	home := t.TempDir()
	for _, name := range []string{"REMOTEARC_HOME", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "PATH"} {
		t.Setenv(name, home)
	}
	t.Setenv("PATHEXT", ".EXE;.CMD;.BAT")
	name, script := "codex", "#!/bin/sh\nprintf executed > \""+filepath.ToSlash(filepath.Join(home, "was-executed"))+"\"\n"
	if runtime.GOOS == "windows" {
		name, script = "codex.cmd", "@echo executed > \""+filepath.Join(home, "was-executed")+"\"\r\n"
	}
	if err := os.WriteFile(filepath.Join(home, name), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	private := []byte("PRIVATE_SESSION_AND_CONFIG_CANARY")
	for _, name := range []string{"config.toml", "session.jsonl"} {
		if err := os.WriteFile(filepath.Join(home, name), private, 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, args := range [][]string{{"setup", "inspect", "--agent", "codex"}, {"--go", "setup", "inspect", "--agent", "codex"}} {
		var out, diagnostics bytes.Buffer
		if err := Main(context.Background(), args, "setup-candidate", os.Stdin, &out, &diagnostics); err != nil {
			t.Fatal(err)
		}
		var report onboarding.Inspection
		if err := json.Unmarshal(out.Bytes(), &report); err != nil {
			t.Fatal(err)
		}
		if report.RuntimeVersion != "setup-candidate" || len(report.Clients) != 1 || report.Clients[0].Status != "candidate_found" || diagnostics.Len() != 0 || bytes.Contains(out.Bytes(), private) {
			t.Fatalf("unexpected inspection: %s / %s", out.String(), diagnostics.String())
		}
	}
	entries, err := os.ReadDir(home)
	if err != nil || len(entries) != 3 {
		t.Fatal("inspection executed the client or created pairing/configuration state", err)
	}
	for _, name := range []string{"config.toml", "session.jsonl"} {
		current, err := os.ReadFile(filepath.Join(home, name))
		if err != nil || !bytes.Equal(current, private) {
			t.Fatal("private input changed", err)
		}
	}
}
