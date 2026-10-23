package service

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestLinuxUnitOutputPaths(t *testing.T) {
	logs := filepath.Join(t.TempDir(), "space percent% quote\" slash\\ unicode-日志")
	unit, err := linuxUnit("/usr/bin/true", logs)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"agent.log", "agent-error.log"} {
		path := strings.ReplaceAll(filepath.Join(logs, name), "%", "%%")
		if !strings.Contains(unit, "=append:"+path+"\n") {
			t.Fatalf("literal append path missing: %q", unit)
		}
	}
	if !strings.Contains(unit, "ExecStart=\"/usr/bin/true\" --agent\n") {
		t.Fatal("ExecStart must retain command-word quoting")
	}
}

func TestLinuxUnitRejectsLogDirectiveInjection(t *testing.T) {
	for _, logs := range []string{"/tmp/logs\nExecStart=/bad", "/tmp/logs\rRestart=always", "/tmp/logs\x00tail"} {
		if _, err := linuxUnit("/usr/bin/true", logs); err == nil {
			t.Fatalf("accepted control characters in log path: %q", logs)
		}
	}
}

func TestLinuxUnitPassesSystemdVerify(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("systemd parser qualification runs on Linux")
	}
	analyze, err := exec.LookPath("systemd-analyze")
	if err != nil {
		t.Skip("systemd-analyze is unavailable")
	}
	for _, suffix := range []string{"logs", "space percent% quote\" slash\\ unicode-日志"} {
		t.Run(suffix, func(t *testing.T) {
			dir := t.TempDir()
			unit, err := linuxUnit("/usr/bin/true", filepath.Join(dir, suffix))
			if err != nil {
				t.Fatal(err)
			}
			file := filepath.Join(dir, "remotearc-output-test.service")
			if err := os.WriteFile(file, []byte(unit), 0600); err != nil {
				t.Fatal(err)
			}
			out, err := exec.Command(analyze, "--user", "--man=no", "verify", file).CombinedOutput()
			if err != nil || len(out) != 0 {
				t.Fatalf("systemd rejected generated unit: %v\n%s", err, out)
			}
		})
	}
}
