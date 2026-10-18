package agent

import (
	"context"
	"runtime"
	"testing"
	"time"
)

func TestCapacityMetricsAreBoundedAndCached(t *testing.T) {
	p := &capacityProbe{}
	sample := p.sample(context.Background())
	if runtime.GOOS == "linux" && sample == nil {
		t.Fatal("Linux /proc system metrics should be accessible")
	}
	if sample == nil {
		t.Skip("OS metrics unavailable on this CI runner")
	}
	total, ok := sample["memoryTotalMB"].(uint64)
	if !ok || total == 0 {
		t.Fatalf("Invalid total memory: %v", sample)
	}
	available, ok := sample["memoryAvailableMB"].(uint64)
	if !ok || available > total {
		t.Fatalf("Invalid available memory: %v", sample)
	}
	if cpu, ok := sample["cpuPercent"].(float64); ok && (cpu < 0 || cpu > 100) {
		t.Fatalf("Invalid CPU utilization: %v", cpu)
	}
	same := p.sample(context.Background())
	if same["observedAt"] != sample["observedAt"] {
		t.Fatal("Capacity sample should be cached")
	}
	if time.Since(p.last) >= 10*time.Second {
		t.Fatal("Capacity collection took unexpectedly long")
	}
}
