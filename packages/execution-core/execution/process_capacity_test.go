package execution

import "testing"

func TestActiveCountExcludesFinishedManagedJobs(t *testing.T) {
	p := NewProcesses()
	running := &managed{done: make(chan struct{})}
	done := &managed{done: make(chan struct{})}
	close(done.done)
	p.items["running"] = running
	p.items["finished"] = done
	if got := p.ActiveCount(); got != 1 {
		t.Fatalf("expected one active managed process, got %d", got)
	}
	close(running.done)
	if got := p.ActiveCount(); got != 0 {
		t.Fatalf("finished retained process must not count as active, got %d", got)
	}
}
