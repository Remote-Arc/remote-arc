package cli

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// supervise deliberately launches its own executable with --agent. In this test
// binary only, that invocation becomes an actual child with the same local
// status/stop contract. No system service or real paired Agent is involved.
func init() {
	if len(os.Args) != 2 || os.Args[1] != "--agent" {
		return
	}
	switch os.Getenv("REMOTEARC_TEST_SUPERVISOR_CHILD") {
	case "crash":
		os.Exit(7)
	case "control":
		stopped := make(chan struct{}, 1)
		s, err := control.Start(filepath.Join(config.Dir(), "agent"), "child", func() any { return map[string]any{"pid": os.Getpid()} }, func() { stopped <- struct{}{} })
		if err != nil {
			os.Exit(2)
		}
		select {
		case <-stopped:
			s.Close()
			os.Exit(0)
		case <-time.After(20 * time.Second):
			s.Close()
			os.Exit(3)
		}
	}
}

func supervisorFixture(t *testing.T) *journal.Journal {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	on := true
	if err := config.Save(config.Config{DeviceID: "fixture", DeviceToken: "local-test", Origin: "https://example.test", Mode: "managed", BackgroundEnabled: &on}); err != nil {
		t.Fatal(err)
	}
	return &journal.Journal{Dir: filepath.Join(config.Dir(), "logs"), Output: io.Discard}
}

func TestSupervisorGracefullyStopsItsOwnChildOnCancellation(t *testing.T) {
	log := supervisorFixture(t)
	t.Setenv("REMOTEARC_TEST_SUPERVISOR_CHILD", "control")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- supervise(ctx, "test", log) }()
	defer func() {
		cancel()
		select {
		case <-done:
		case <-time.After(15 * time.Second):
			t.Error("supervisor cleanup did not finish")
		}
	}()
	deadline := time.After(5 * time.Second)
	for {
		status, err := control.Request(context.Background(), filepath.Join(config.Dir(), "agent"), "GET", "/status")
		if err == nil {
			if status["pid"] == float64(os.Getpid()) {
				t.Fatal("supervisor confused with child")
			}
			break
		}
		select {
		case err := <-done:
			t.Fatalf("exited before child readiness: %v", err)
		case <-deadline:
			t.Fatal("child did not publish control endpoint")
		case <-time.After(10 * time.Millisecond):
		}
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation result: %v", err)
		}
		done <- err
	case <-time.After(8 * time.Second):
		t.Fatal("child ignored graceful stop")
	}
	if lease.Active(filepath.Join(config.Dir(), "agent"), "supervisor") {
		t.Fatal("supervisor lease not released")
	}
	if _, err := os.Stat(filepath.Join(config.Dir(), "agent", "control.json")); !os.IsNotExist(err) {
		t.Fatalf("child endpoint left behind: %v", err)
	}
}

func TestSupervisorRecoversCrashedWorkersAndCanCancelBackoff(t *testing.T) {
	log := supervisorFixture(t)
	t.Setenv("REMOTEARC_TEST_SUPERVISOR_CHILD", "crash")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- supervise(ctx, "test", log) }()
	deadline := time.After(6 * time.Second)
	for {
		_, text := log.Read(nil)
		if strings.Contains(text, "recovery retry in 2s") {
			break
		}
		select {
		case err := <-done:
			t.Fatalf("did not recover crashed worker: %v", err)
		case <-deadline:
			cancel()
			<-done
			t.Fatal("second recovery attempt not observed")
		case <-time.After(10 * time.Millisecond):
		}
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("backoff ignored cancellation")
	}
	if lease.Active(filepath.Join(config.Dir(), "agent"), "supervisor") {
		t.Fatal("crash recovery leaked supervisor ownership")
	}
}

func TestSupervisorDoesNotStealOwnershipOrSpawnWithoutRecovery(t *testing.T) {
	log := supervisorFixture(t)
	dir := filepath.Join(config.Dir(), "agent")
	owner, err := lease.Acquire(dir, "supervisor")
	if err != nil || owner == nil {
		t.Fatal(err)
	}
	defer owner.Release()
	if err := supervise(context.Background(), "test", log); err != nil {
		t.Fatal(err)
	}
	if !lease.Active(dir, "supervisor") {
		t.Fatal("foreign supervisor lost its lease")
	}
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	off := false
	cfg.BackgroundEnabled = &off
	if err = config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	if err = supervise(context.Background(), "test", nil); err != nil {
		t.Fatal(err)
	}
}

func TestSupervisorFailsClosedWhenLogsCannotBeCreated(t *testing.T) {
	for _, name := range []string{"directory", "agent.log", "agent-error.log"} {
		t.Run(name, func(t *testing.T) {
			log := supervisorFixture(t)
			if name == "directory" {
				if err := os.WriteFile(log.Dir, nil, 0600); err != nil {
					t.Fatal(err)
				}
			} else {
				if err := os.MkdirAll(filepath.Join(log.Dir, name), 0700); err != nil {
					t.Fatal(err)
				}
			}
			if err := supervise(context.Background(), "test", log); err == nil {
				t.Fatal("spawned with unusable logs")
			}
			if lease.Active(filepath.Join(config.Dir(), "agent"), "supervisor") {
				t.Fatal("failed startup leaked ownership")
			}
		})
	}
}
