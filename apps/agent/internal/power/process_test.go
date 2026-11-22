package power

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPowerWorkerHelper(t *testing.T) {
	if os.Getenv("REMOTEARC_POWER_TEST_CHILD") != "1" {
		return
	}
	dir := os.Getenv("REMOTEARC_POWER_TEST_DIR")
	if err := os.WriteFile(filepath.Join(dir, "ready"), nil, 0600); err != nil {
		os.Exit(2)
	}
	deadline := time.After(10 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(dir, "release")); err == nil {
			os.Exit(7)
		}
		select {
		case <-deadline:
			os.Exit(3)
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestNativePowerHelperExitAndShutdownAreObserved(t *testing.T) {
	for _, crash := range []bool{false, true} {
		t.Run(map[bool]string{false: "disconnect", true: "exit"}[crash], func(t *testing.T) {
			dir := t.TempDir()
			t.Setenv("REMOTEARC_POWER_TEST_CHILD", "1")
			t.Setenv("REMOTEARC_POWER_TEST_DIR", dir)
			t.Setenv("GORACE", "atexit_sleep_ms=0")
			m := New()
			defer m.Close()
			h, err := m.Launch(os.Args[0], []string{"-test.run=^TestPowerWorkerHelper$"})
			if err != nil {
				t.Fatal(err)
			}
			m.mu.Lock()
			m.helper = h
			m.until = time.Now().Add(time.Minute)
			m.leases["task"] = time.Now().Add(time.Minute)
			m.mu.Unlock()
			deadline := time.After(5 * time.Second)
			for {
				if _, err := os.Stat(filepath.Join(dir, "ready")); err == nil {
					break
				}
				select {
				case <-deadline:
					t.Fatal("helper did not start")
				case <-time.After(10 * time.Millisecond):
				}
			}
			if crash {
				if err = os.WriteFile(filepath.Join(dir, "release"), nil, 0600); err != nil {
					t.Fatal(err)
				}
			} else {
				m.Close()
				m.Close()
			}
			deadline = time.After(5 * time.Second)
			for {
				status := m.Status()
				if status["active"] == false {
					if crash && (status["detail"] == nil || !strings.Contains(status["detail"].(string), "exit status")) {
						t.Fatalf("worker failure lost: %v", status)
					}
					break
				}
				select {
				case <-deadline:
					t.Fatal("helper termination not observed")
				case <-time.After(10 * time.Millisecond):
				}
			}
			if !crash {
				if _, err = m.Set("task", 1); err == nil {
					t.Fatal("closed manager accepted lease")
				}
			}
		})
	}
	m := New()
	defer m.Close()
	if _, err := m.Launch(filepath.Join(t.TempDir(), "missing"), nil); err == nil {
		t.Fatal("failed process launch accepted")
	}
	(&child{cmd: exec.Command("unused")}).Stop()
}
