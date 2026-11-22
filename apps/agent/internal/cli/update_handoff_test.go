package cli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestUpdateHandoffIsOnlyForBackgroundRemoteUpdates(t *testing.T) {
	o, err := Parse([]string{"--background", "--update-handoff"})
	if err != nil || !o.UpdateHandoff || !o.Background {
		t.Fatalf("a remote update's launch must parse: %+v %v", o, err)
	}
	for _, args := range [][]string{
		{"--update-handoff"},
		{"--foreground", "--update-handoff"},
		{"--background", "--update-handoff", "--force-update"},
		{"--background", "--update-handoff", "--agent"},
		{"--background", "--update-handoff", "--stop"},
	} {
		if _, err := Parse(args); err == nil {
			t.Fatalf("%v must be refused", args)
		}
	}
	if strings.Contains(Help, "--update-handoff") {
		t.Fatal("the internal remote-update option is not listed in --help")
	}
}

func TestUpdateHandoffInstallsTheServiceAndLeavesExecutionToIt(t *testing.T) {
	dir, bg, log, calls := handoffFixture(t)
	c, _ := config.Load()
	off := false
	c.BackgroundEnabled = &off
	if err := config.Save(c); err != nil {
		t.Fatal(err)
	}
	// A systemd stand-in that reports the unit enabled and running once installed.
	bg.Run = func(_ context.Context, name string, args ...string) (string, error) {
		*calls = append(*calls, name+" "+strings.Join(args, " "))
		switch strings.Join(args, " ") {
		case "--user is-enabled remotearc-agent.service":
			return "enabled\n", nil
		case "--user show remotearc-agent.service --property=MainPID --value":
			return "4242\n", nil
		}
		return "", nil
	}
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	bg.Executable = self
	if err := installUpdatedService(context.Background(), dir, bg, log, "0.6.2-rc.5"); err != nil {
		t.Fatal(err)
	}
	saved, err := config.Load()
	if err != nil || saved.BackgroundEnabled == nil || !*saved.BackgroundEnabled || saved.DeviceToken != "private" {
		t.Fatalf("the background choice must be on and pairing kept: %+v %v", saved, err)
	}
	if !strings.Contains(strings.Join(*calls, "\n"), "systemctl --user enable --now remotearc-agent.service") {
		t.Fatalf("the new release's service was not installed: %v", *calls)
	}
	if lease.Active(dir, "execution") {
		t.Fatal("the handoff process must leave execution to the service")
	}
	if _, err := os.Stat(filepath.Join(bg.Home, ".remotearc", "agent", "bin", "go-0.6.2-rc.5")); err != nil {
		t.Fatalf("the new release was not installed into the service's bin folder: %v", err)
	}
}

func TestUpdateHandoffNeverReplacesALiveOwner(t *testing.T) {
	dir, bg, log, calls := handoffFixture(t)
	startOldAgent(t, "0.6.2-rc.5", false)
	err := installUpdatedService(context.Background(), dir, bg, log, "0.6.2-rc.5")
	if err == nil || !strings.Contains(err.Error(), "Nothing was changed") {
		t.Fatalf("expected a refusal, got %v", err)
	}
	if len(*calls) != 0 {
		t.Fatalf("the service was touched while another Agent owns execution: %v", *calls)
	}
}
