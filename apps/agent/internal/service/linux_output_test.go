package service

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
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

// lingerFixture fakes a Linux host where the systemd user unit starts and
// reports a live MainPID. loginctl answers from linger, and enable-linger
// succeeds only when allowEnable is set, as polkit would decide.
type lingerFixture struct {
	linger      string
	allowEnable bool
	calls       []string
}

func (f *lingerFixture) controller(t *testing.T, user string) *Controller {
	dir := t.TempDir()
	source := filepath.Join(dir, "source")
	if err := os.WriteFile(source, []byte("binary-fixture"), 0700); err != nil {
		t.Fatal(err)
	}
	return &Controller{Home: dir, Platform: "linux", Executable: source, Version: "test", UID: "1000", User: user, Wait: func(time.Duration) {}, Run: f.run}
}

func (f *lingerFixture) run(_ context.Context, name string, args ...string) (string, error) {
	line := name + " " + strings.Join(args, " ")
	f.calls = append(f.calls, line)
	switch {
	case strings.Contains(line, "is-enabled"):
		return "enabled", nil
	case strings.Contains(line, "--property=MainPID"):
		return "101", nil
	case strings.HasPrefix(line, "loginctl show-user ") && strings.HasSuffix(line, " --property=Linger --value"):
		if f.linger == "" {
			return "Failed to get user: not logged in or lingering", errors.New("loginctl failed")
		}
		return f.linger, nil
	case strings.HasPrefix(line, "loginctl --no-ask-password enable-linger "):
		if !f.allowEnable {
			return "Could not enable linger: Access denied", errors.New("loginctl: Access denied")
		}
		f.linger = "yes"
	}
	return "", nil
}

func (f *lingerFixture) count(prefix string) int {
	n := 0
	for _, line := range f.calls {
		if strings.HasPrefix(line, prefix) {
			n++
		}
	}
	return n
}

func TestLinuxBackgroundLeavesLingerOnOrSaysHowToTurnItOn(t *testing.T) {
	t.Run("already on", func(t *testing.T) {
		f := &lingerFixture{linger: "yes"}
		s, err := f.controller(t, "ops").Enable(context.Background())
		if err != nil || !s.Enabled || !s.Active {
			t.Fatalf("install failed: %+v %v", s, err)
		}
		if f.count("loginctl --no-ask-password enable-linger") != 0 {
			t.Fatalf("linger was already on but enable-linger ran: %v", f.calls)
		}
		if s.Linger == nil || !*s.Linger || s.LingerCommand != "" || s.LogoutWarning() != "" || s.Detail != "" {
			t.Fatalf("status must report linger on with no warning: %+v", s)
		}
	})

	t.Run("enabled during install", func(t *testing.T) {
		f := &lingerFixture{linger: "no", allowEnable: true}
		s, err := f.controller(t, "ops").Enable(context.Background())
		if err != nil || !s.Enabled || !s.Active {
			t.Fatalf("install failed: %+v %v", s, err)
		}
		if f.count("loginctl --no-ask-password enable-linger ops") != 1 {
			t.Fatalf("enable-linger was not run once for the login user: %v", f.calls)
		}
		if f.linger != "yes" || s.Linger == nil || !*s.Linger || s.LogoutWarning() != "" {
			t.Fatalf("linger must end up on: %+v", s)
		}
	})

	t.Run("enable refused", func(t *testing.T) {
		f := &lingerFixture{linger: "no"}
		s, err := f.controller(t, "ops").Enable(context.Background())
		if err != nil {
			t.Fatalf("a refused enable-linger must not fail the install: %v", err)
		}
		if !s.Enabled || !s.Active {
			t.Fatalf("the unit must still be installed and running: %+v", s)
		}
		if f.count("loginctl --no-ask-password enable-linger ops") != 1 {
			t.Fatalf("enable-linger was not attempted: %v", f.calls)
		}
		if s.Linger == nil || *s.Linger {
			t.Fatalf("status must report linger off: %+v", s)
		}
		if s.LingerCommand != "sudo loginctl enable-linger ops" {
			t.Fatalf("wrong fix command: %q", s.LingerCommand)
		}
		warning := s.LogoutWarning()
		if !strings.Contains(warning, "stops when you log out") || !strings.HasSuffix(warning, "sudo loginctl enable-linger ops") {
			t.Fatalf("warning must say it stops at logout and give the command: %q", warning)
		}
		if s.Detail != warning {
			t.Fatalf("detail must carry the warning for the Dashboard: %q", s.Detail)
		}
		encoded, _ := json.Marshal(s)
		if !strings.Contains(string(encoded), `"linger":false`) || !strings.Contains(string(encoded), `"lingerCommand":"sudo loginctl enable-linger ops"`) {
			t.Fatalf("--status JSON is missing the linger state: %s", encoded)
		}
	})
}

func TestLinuxHealthyInstallWithoutLingerIsFixedOnNextBackground(t *testing.T) {
	f := &lingerFixture{linger: "yes"}
	c := f.controller(t, "ops")
	if _, err := c.Enable(context.Background()); err != nil {
		t.Fatal(err)
	}
	// An install from an agent that never enabled linger.
	f.linger, f.allowEnable, f.calls = "no", true, nil
	s, err := c.Enable(context.Background())
	if err != nil || !s.Enabled || !s.Active {
		t.Fatalf("healthy install broke: %+v %v", s, err)
	}
	if f.count("loginctl --no-ask-password enable-linger ops") != 1 || f.linger != "yes" || s.Linger == nil || !*s.Linger {
		t.Fatalf("linger was not turned on for the existing install: %+v %v", s, f.calls)
	}
	if f.count("systemctl --user enable --now") != 0 {
		t.Fatalf("healthy service was restarted: %v", f.calls)
	}
}

func TestLinuxLingerUnknownMakesNoClaimAndFallsBackToUID(t *testing.T) {
	f := &lingerFixture{}
	c := f.controller(t, "")
	s, err := c.Enable(context.Background())
	if err != nil || !s.Enabled || !s.Active {
		t.Fatalf("install failed: %+v %v", s, err)
	}
	if f.count("loginctl show-user 1000 ") == 0 || f.count("loginctl --no-ask-password enable-linger 1000") != 1 {
		t.Fatalf("loginctl must address the UID when the login name is unknown: %v", f.calls)
	}
	if s.Linger != nil || s.LingerCommand != "" || s.LogoutWarning() != "" {
		t.Fatalf("an unreadable linger state must not be reported as on or off: %+v", s)
	}
}

func TestLingerIsOnlyCheckedOnLinux(t *testing.T) {
	for _, platform := range []string{"darwin", "windows"} {
		f := &lingerFixture{linger: "no"}
		c := f.controller(t, "ops")
		c.Platform = platform
		s := c.Status(context.Background())
		if f.count("loginctl") != 0 || s.Linger != nil {
			t.Fatalf("%s must not query linger: %v %+v", platform, f.calls, s)
		}
	}
}
