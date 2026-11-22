package execution

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// The owner's per-computer switch lifts the shutdown and restart rule and
// nothing else. These tests never run a command: each one is refused or stops
// at a later check before a process starts.
func TestPowerCommandsAreRefusedUnlessTheOwnerAllowedThem(t *testing.T) {
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "")
	power := []string{"shutdown /s /t 0", "shutdown -h now", "sudo reboot", "poweroff", "halt", "echo bye && shutdown -r now", "powershell -Command \"shutdown /r\"",
		"systemctl poweroff", "sudo systemctl reboot", "systemctl --force --no-wall reboot", "systemctl halt", "systemctl kexec", "loginctl poweroff",
		"init 0", "sudo telinit 6", "powershell -Command \"Stop-Computer -Force\"", "Restart-Computer -Force", "cd /srv && sudo systemctl reboot"}
	allowed := protocol.Policy{AllowPowerCommands: true}
	for _, command := range power {
		err := AssertCommandAllowedFor(command, "", protocol.Policy{})
		if err == nil || !strings.Contains(err.Error(), "system shutdown or reboot") {
			t.Fatalf("%q was not refused by default: %v", command, err)
		}
		if !strings.Contains(err.Error(), "File boundaries & recovery") {
			t.Fatalf("the refusal does not say where the owner can allow it: %v", err)
		}
		if err := AssertCommandAllowedIn(command, ""); err == nil {
			t.Fatalf("%q passed the guard with every rule in force", command)
		}
		if err := AssertCommandAllowedFor(command, "", allowed); err != nil {
			t.Fatalf("%q is still refused after the owner allowed it: %v", command, err)
		}
	}
	// Ordinary service and project commands that only look similar are not power commands.
	for _, command := range []string{"systemctl restart nginx", "systemctl status sshd", "systemctl reload caddy", "git init", "npm init -y", "git init 0", "echo reboot", "Get-Help Restart-Computer", "docker restart web", "pm2 restart all", "brew services restart redis"} {
		if err := AssertCommandAllowedFor(command, "", protocol.Policy{}); err != nil {
			t.Fatalf("%q is not a power command but was refused: %v", command, err)
		}
	}
	// Disk erasure, raw disk writes, fork bombs and root deletes never lift.
	for _, command := range []string{"rm -rf /", "dd if=data of=/dev/sda", "mkfs.ext4 /dev/sda", "diskutil eraseDisk x y z", "format c:", ":(){ :|:& };:", "shutdown -h now && mkfs.ext4 /dev/sda"} {
		err := AssertCommandAllowedFor(command, "", allowed)
		if err == nil || !strings.Contains(err.Error(), "Safety Guard") {
			t.Fatalf("%q passed the guard with power commands allowed: %v", command, err)
		}
		if strings.Contains(err.Error(), "File boundaries & recovery") {
			t.Fatalf("%q points the owner at a switch that cannot allow it: %v", command, err)
		}
	}
}

func TestStartProcessUsesTheCallsPowerSetting(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "")
	c := New("managed")
	defer c.Close()
	root := filepath.Join(dir, "trusted")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	// No cwd with Trusted Write Locations set stops start_process after the
	// guard and before anything runs, so the error shows which check stopped it.
	args := map[string]any{"command": "shutdown -h now"}
	_, err := c.Call(context.Background(), "start_process", args, protocol.Policy{WorkspaceRoots: []string{root}})
	if err == nil || !strings.Contains(err.Error(), "system shutdown or reboot") {
		t.Fatalf("start_process did not refuse a shutdown by default: %v", err)
	}
	_, err = c.Call(context.Background(), "start_process", args, protocol.Policy{WorkspaceRoots: []string{root}, AllowPowerCommands: true})
	if err == nil || !strings.Contains(err.Error(), "Trusted Write Locations") {
		t.Fatalf("start_process did not pass the guard with power commands allowed: %v", err)
	}
}

func TestThePowerSettingTravelsInTheCallPolicy(t *testing.T) {
	var call protocol.Call
	if err := json.Unmarshal([]byte(`{"type":"call","id":"1","tool":"start_process","arguments":{},"policy":{"allowPowerCommands":true}}`), &call); err != nil {
		t.Fatal(err)
	}
	if !protocol.Normalize(call.Policy).AllowPowerCommands {
		t.Fatal("allowPowerCommands was lost reading the call")
	}
	var without protocol.Call
	if err := json.Unmarshal([]byte(`{"type":"call","id":"2","tool":"start_process","arguments":{},"policy":{}}`), &without); err != nil {
		t.Fatal(err)
	}
	if without.Policy.AllowPowerCommands {
		t.Fatal("a policy without the setting allowed power commands")
	}
}

func TestOnlyThePowerRuleCanBeLifted(t *testing.T) {
	lifted := 0
	for _, g := range guards {
		if g.LiftedBy != "" {
			lifted++
			if g.Reason != "system shutdown or reboot" {
				t.Fatalf("rule %q can be lifted", g.Reason)
			}
		}
	}
	if lifted != 1 {
		t.Fatalf("%d rules can be lifted, want exactly the shutdown rule", lifted)
	}
}
