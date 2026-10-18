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

func TestPlatformCapacityParsing(t *testing.T) {
	vm := "Mach Virtual Memory Statistics: (page size of 4096 bytes)\n" +
		"Pages free: 10.\nPages inactive: 20.\nPages speculative: 5.\nPages purgeable: 5.\nPages active: 200.\n"
	got := parseDarwinAvailableMemory(vm, 1024*1024)
	if got != 40*4096 {
		t.Fatalf("Mac available memory parsing: %d", got)
	}
	if parseDarwinAvailableMemory(vm, 8*4096) != 8*4096 {
		t.Fatal("Mac available memory must clamp to total")
	}
	if parseDarwinAvailableMemory("", 4096) != 0 {
		t.Fatal("Mac missing pages must return zero")
	}
	if got := parseDarwinCPU("CPU usage: 2.5% user, 1.0% sys, 96.5% idle"); got != 3.5 {
		t.Fatalf("Mac CPU parsing: %f", got)
	}
	for _, raw := range []string{"no CPU data", "CPU usage: 101% idle"} {
		if parseDarwinCPU(raw) != -1 {
			t.Fatalf("Invalid Mac CPU sample accepted: %s", raw)
		}
	}
	cpu, total, available, ok := parseWindowsCapacity("45|4000000|1000000")
	if !ok || cpu != 45 || total != 4000000*1024 || available != 1000000*1024 {
		t.Fatalf("Windows capacity parsing: %f %d %d %t", cpu, total, available, ok)
	}
	for _, raw := range []string{"bad", "101|100|50", "50|100|200", "abc|100|50", "20|invalid|50", "20|100|invalid"} {
		_, _, _, ok := parseWindowsCapacity(raw)
		if ok {
			t.Fatalf("Invalid Windows sample accepted: %s", raw)
		}
	}
}
