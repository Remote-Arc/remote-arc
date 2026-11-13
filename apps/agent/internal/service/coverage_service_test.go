package service

import (
	"context"
	"encoding/json"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestServiceControllerConstructsWithPlatformAndSafeCommandRunner(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	c := New("coverage-test")
	if c.Home != dir || c.Platform != runtime.GOOS || c.Version != "coverage-test" || c.Executable == "" || c.Run == nil || c.Wait == nil {
		t.Fatalf("unusable controller: %+v", c)
	}
	if runtime.GOOS != "windows" {
		got, err := RunCommand(context.Background(), "sh", "-c", "printf 'working'")
		if err != nil || got != "working" {
			t.Fatalf("safe command runner failed: %q %v", got, err)
		}
		_, err = RunCommand(context.Background(), "sh", "-c", "printf error; exit 4")
		if err == nil || !strings.Contains(err.Error(), "error") {
			t.Fatalf("failed command error lost: %v", err)
		}
	}
}

func TestStopSupervisionOnlyTargetsOwnedRegistration(t *testing.T) {
	for _, platform := range []string{"linux", "darwin", "windows"} {
		t.Run(platform, func(t *testing.T) {
			dir := t.TempDir()
			c := &Controller{Home: dir, Platform: platform, Executable: "fixture", Version: "test", UID: "101", Wait: func(time.Duration) {}}
			invoked := []string{}
			c.Run = func(_ context.Context, name string, args ...string) (string, error) {
				invoked = append(invoked, name+" "+strings.Join(args, " "))
				if strings.Contains(strings.Join(args, " "), "Get-CimInstance") {
					return "123", nil
				}
				return "", nil
			}
			ctx := context.Background()
			c.StopSupervision(ctx)
			if len(invoked) != 0 {
				t.Fatal("unowned device was stopped")
			}
			marker := c.marker()
			os.MkdirAll(filepath.Dir(marker), 0700)
			data, _ := json.Marshal(Registration{Engine: "ts", Binary: "fixture", Version: "test"})
			os.WriteFile(marker, data, 0600)
			c.StopSupervision(ctx)
			if len(invoked) != 0 {
				t.Fatal("foreign TypeScript owner was stopped")
			}
			data, _ = json.Marshal(Registration{Engine: "go", Binary: "fixture", Version: "test"})
			os.WriteFile(marker, data, 0600)
			c.StopSupervision(ctx)
			expected := map[string]string{"darwin": "launchctl bootout", "linux": "systemctl --user stop", "windows": "taskkill.exe /PID"}
			found := false
			for _, call := range invoked {
				if strings.Contains(call, expected[platform]) {
					found = true
				}
			}
			if !found {
				t.Fatalf("owned %s supervisor not stopped: %v", platform, invoked)
			}
		})
	}
}

func TestExecutionActiveUsesDeviceLocalLeaseOnly(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{Home: dir, Platform: "linux"}
	if c.ExecutionActive() {
		t.Fatal("unexpected execution lease")
	}
	owner, err := lease.Acquire(c.dir(), "execution")
	if err != nil || owner == nil {
		t.Fatalf("lease create failed: %v", err)
	}
	if !c.ExecutionActive() {
		t.Fatal("live lease ignored")
	}
	owner.Release()
	if c.ExecutionActive() {
		t.Fatal("released lease still active")
	}
}
