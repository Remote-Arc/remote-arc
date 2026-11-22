package execution

import (
	"context"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// The plan's allowance of background tasks is enforced on the computer, so
// two quick starts cannot both slip under it; foreground commands never count.
func TestBackgroundTaskLimitFromThePlan(t *testing.T) {
	p := NewProcesses()
	defer p.Close()
	first, e := p.BackgroundWithin(helper(t, "wait"), "", 0, "", 1)
	if e != nil {
		t.Fatal(e)
	}
	if p.BackgroundCount() != 1 || p.ActiveCount() != 1 {
		t.Fatalf("one background task: background=%d active=%d", p.BackgroundCount(), p.ActiveCount())
	}
	if _, e := p.BackgroundWithin(helper(t, "wait"), "", 0, "", 1); e == nil || !strings.HasPrefix(e.Error(), "BACKGROUND_TASK_LIMIT:") {
		t.Fatalf("a second background task beyond the allowance is refused: %v", e)
	}
	// A foreground command still runs and is not a background task.
	if out, e := p.Run(context.Background(), helper(t, "success"), "", 30000); e != nil || out["stdout"] != "hello" {
		t.Fatalf("foreground run: %v %v", out, e)
	}
	// No allowance means no plan limit; the computer's own admission limit still applies.
	second, e := p.BackgroundWithin(helper(t, "wait"), "", 0, "", 0)
	if e != nil {
		t.Fatal(e)
	}
	if p.BackgroundCount() != 2 {
		t.Fatalf("background tasks: %d", p.BackgroundCount())
	}
	for _, job := range []map[string]any{first, second} {
		p.Stop(job["process_id"].(string))
		if _, e := p.WaitStatus(context.Background(), job["process_id"].(string), 40000, ""); e != nil {
			t.Fatal(e)
		}
	}
	if p.BackgroundCount() != 0 {
		t.Fatalf("finished tasks do not count: %d", p.BackgroundCount())
	}
	if _, e := p.BackgroundWithin(helper(t, "wait"), "", 0, "", 1); e != nil {
		t.Fatalf("a slot frees once a task ends: %v", e)
	}
}

// The Relay's allowance reaches start_process through the call's policy.
func TestStartProcessUsesThePolicyAllowance(t *testing.T) {
	c := New("managed")
	defer c.Processes.Close()
	policy := protocol.Policy{BackgroundTaskLimit: 1}
	args := map[string]any{"command": helper(t, "wait"), "background": true}
	if _, e := c.Call(context.Background(), "start_process", args, policy); e != nil {
		t.Fatal(e)
	}
	if _, e := c.Call(context.Background(), "start_process", args, policy); e == nil || !strings.Contains(e.Error(), "BACKGROUND_TASK_LIMIT") {
		t.Fatalf("second background start: %v", e)
	}
}
