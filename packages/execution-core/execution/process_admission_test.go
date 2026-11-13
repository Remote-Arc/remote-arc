package execution

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestFinishedHistoryDoesNotBlockNewProcess(t *testing.T) {
	t.Setenv("REMOTEARC_MAX_ACTIVE_PROCESSES", "")
	p := NewProcesses()
	for i := 0; i < 64; i++ {
		done := make(chan struct{})
		close(done)
		ended := time.Now()
		p.items[fmt.Sprint(i)] = &managed{done: done, ended: &ended}
	}
	out, e := p.Run(context.Background(), "echo capacity", "", 5000)
	if e != nil || out["exit_code"] == nil {
		t.Fatalf("finished records blocked a command: %v %v", out, e)
	}
	if p.ActiveCount() != 0 {
		t.Fatal("finished tasks counted as active")
	}
}
func TestConfiguredActiveAdmissionAndHistoryPruning(t *testing.T) {
	t.Setenv("REMOTEARC_MAX_ACTIVE_PROCESSES", "2")
	p := NewProcesses()
	p.items["active-a"] = &managed{done: make(chan struct{})}
	p.items["active-b"] = &managed{done: make(chan struct{})}
	for i := 0; i < maxFinishedProcesses+10; i++ {
		done := make(chan struct{})
		close(done)
		at := time.Now().Add(time.Duration(i) * time.Millisecond)
		p.items[fmt.Sprintf("finished-%03d", i)] = &managed{done: done, ended: &at}
	}
	_, e := p.start("echo must-not-start", "", 0, "")
	if e == nil || !strings.Contains(e.Error(), "Running: 2; limit: 2") {
		t.Fatal("active admission not enforced", e)
	}
	if p.activeCountLocked() != 2 || len(p.items) != maxFinishedProcesses+2 {
		t.Fatal("history not bounded", len(p.items))
	}
	if p.items["finished-000"] != nil || p.items["finished-137"] == nil {
		t.Fatal("did not keep newest finished records")
	}
	close(p.items["active-a"].done)
	close(p.items["active-b"].done)
}
func TestActiveProcessLimitConfiguration(t *testing.T) {
	for raw, want := range map[string]int{"": 64, "1": 1, "128": 128, "256": 256, "0": 64, "257": 64, "invalid": 64, "32.5": 64} {
		t.Setenv("REMOTEARC_MAX_ACTIVE_PROCESSES", raw)
		if got := activeProcessLimit(); got != want {
			t.Errorf("%q: got %d want %d", raw, got, want)
		}
	}
}
