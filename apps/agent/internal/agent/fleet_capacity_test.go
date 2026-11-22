package agent

import (
	"context"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
)

func TestFleetCapacityIsRedactedAndReportsActiveProcessCount(t *testing.T) {
	probe := &capacityProbe{last: time.Now(), value: map[string]any{
		"observedAt":        time.Now().UTC().Format(time.RFC3339),
		"memoryTotalMB":     uint64(4096),
		"memoryAvailableMB": uint64(2048),
		"cpuPercent":        12.5,
	}}
	a := &Agent{Core: execution.New("managed"), capacity: probe}
	defer a.Core.Close()
	sample := a.fleetCapacity(context.Background())
	if got, ok := sample["managedProcesses"].(int); !ok || got != 0 {
		t.Fatalf("expected zero RA managed processes, got %v", sample["managedProcesses"])
	}
	for _, sensitive := range []string{"command", "cwd", "pid", "stdout", "stderr", "token"} {
		if _, found := sample[sensitive]; found {
			t.Fatalf("fleet telemetry must not include %s", sensitive)
		}
	}
	sample["cpuPercent"] = 98.0
	if probe.value["cpuPercent"] != 12.5 {
		t.Fatal("fleet enrichment mutated cached resource observation")
	}
}
