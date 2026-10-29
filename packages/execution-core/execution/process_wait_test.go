package execution

import (
	"context"
	"testing"
	"time"
)

func TestProcessStatusWait(t *testing.T) {
	p := NewProcesses()
	defer p.Close()
	job, e := p.Background(helper(t, "wait"), "", 0)
	if e != nil {
		t.Fatal(e)
	}
	id := job["process_id"].(string)
	s, e := p.WaitStatus(context.Background(), id, 60000, "ready")
	if e != nil || s["wait_reason"] != "text" || s["note"] == nil {
		t.Fatal(s, e)
	}
	start := time.Now()
	s, e = p.WaitStatus(context.Background(), id, 150, "not present")
	if e != nil || s["wait_reason"] != "timeout" || time.Since(start) < 140*time.Millisecond {
		t.Fatal(s, e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e = p.WaitStatus(ctx, id, 40000, ""); e != context.Canceled {
		t.Fatal(e)
	}
	p.Stop(id)
	s, e = p.WaitStatus(context.Background(), id, 40000, "")
	if e != nil || s["wait_reason"] != "exited" {
		t.Fatal(s, e)
	}
	if _, e = p.WaitStatus(context.Background(), id, -1, ""); e == nil {
		t.Fatal("negative accepted")
	}
}
