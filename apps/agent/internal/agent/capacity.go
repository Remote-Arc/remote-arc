package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Capacity is a bounded OS-level utilization observation, not agent memory usage.
type capacityProbe struct {
	mu    sync.Mutex
	last  time.Time
	value map[string]any
}

func (p *capacityProbe) sample(ctx context.Context) map[string]any {
	if p == nil {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if time.Since(p.last) < 50*time.Second {
		return p.value
	}
	p.last = time.Now()
	probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	var cpu float64
	var total, available uint64
	var ok bool
	switch runtime.GOOS {
	case "linux":
		cpu, total, available, ok = linuxCapacity(probeCtx)
	case "darwin":
		cpu, total, available, ok = darwinCapacity(probeCtx)
	case "windows":
		cpu, total, available, ok = windowsCapacity(probeCtx)
	}
	if !ok || total == 0 || available > total {
		p.value = nil
		return nil
	}
	// These three numbers are not sensitive personal data. Unknown CPU = -1.
	p.value = map[string]any{
		"observedAt":        time.Now().UTC().Format(time.RFC3339),
		"memoryTotalMB":     total / (1024 * 1024),
		"memoryAvailableMB": available / (1024 * 1024),
	}
	if cpu >= 0 && cpu <= 100 {
		p.value["cpuPercent"] = float64(int(cpu*10+0.5)) / 10
	}
	return p.value
}

func cpuCounters() (idle, total uint64, err error) {
	raw, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	fields := strings.Fields(strings.SplitN(string(raw), "\n", 2)[0])
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, fmt.Errorf("invalid /proc/stat")
	}
	for i, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, 0, err
		}
		total += value
		if i == 3 || i == 4 {
			idle += value
		} // idle + iowait
	}
	return idle, total, nil
}

func linuxCapacity(ctx context.Context) (float64, uint64, uint64, bool) {
	raw, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return -1, 0, 0, false
	}
	values := map[string]uint64{}
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			if n, e := strconv.ParseUint(fields[1], 10, 64); e == nil {
				values[strings.TrimSuffix(fields[0], ":")] = n * 1024
			}
		}
	}
	total, available := values["MemTotal"], values["MemAvailable"]
	if total == 0 {
		return -1, 0, 0, false
	}
	firstIdle, firstTotal, e := cpuCounters()
	if e != nil {
		return -1, total, available, true
	}
	select {
	case <-ctx.Done():
		return -1, total, available, true
	case <-time.After(150 * time.Millisecond):
	}
	lastIdle, lastTotal, e := cpuCounters()
	if e != nil || lastTotal <= firstTotal {
		return -1, total, available, true
	}
	busy := 100 * (1 - float64(lastIdle-firstIdle)/float64(lastTotal-firstTotal))
	return busy, total, available, true
}

var idlePattern = regexp.MustCompile(`([0-9.]+)%[[:space:]]+idle`)

func darwinCapacity(ctx context.Context) (float64, uint64, uint64, bool) {
	totalText, err := exec.CommandContext(ctx, "/usr/sbin/sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return -1, 0, 0, false
	}
	total, err := strconv.ParseUint(strings.TrimSpace(string(totalText)), 10, 64)
	if err != nil {
		return -1, 0, 0, false
	}
	// vm_stat returns page counts; free, inactive, speculative and purgeable are reclaimable.
	vm, err := exec.CommandContext(ctx, "/usr/bin/vm_stat").Output()
	if err != nil {
		return -1, 0, 0, false
	}
	available := parseDarwinAvailableMemory(string(vm), total)
	cpu := -1.0
	top, err := exec.CommandContext(ctx, "/usr/bin/top", "-l", "1", "-n", "0").Output()
	if err == nil {
		cpu = parseDarwinCPU(string(top))
	}
	return cpu, total, available, true
}

func windowsCapacity(ctx context.Context) (float64, uint64, uint64, bool) {
	command := `$os=Get-CimInstance Win32_OperatingSystem;$cpu=(Get-CimInstance Win32_Processor|Measure-Object LoadPercentage -Average).Average;Write-Output "$cpu|$($os.TotalVisibleMemorySize)|$($os.FreePhysicalMemory)"`
	output, err := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command).Output()
	if err != nil {
		return -1, 0, 0, false
	}
	return parseWindowsCapacity(string(output))
}

func parseDarwinAvailableMemory(raw string, total uint64) uint64 {
	pageSize := uint64(4096)
	if match := regexp.MustCompile(`page size of ([0-9]+) bytes`).FindStringSubmatch(raw); len(match) == 2 {
		if parsed, e := strconv.ParseUint(match[1], 10, 64); e == nil && parsed > 0 {
			pageSize = parsed
		}
	}
	var pages uint64
	for _, line := range strings.Split(raw, "\n") {
		for _, key := range []string{"Pages free:", "Pages inactive:", "Pages speculative:", "Pages purgeable:"} {
			if strings.HasPrefix(line, key) {
				n, _ := strconv.ParseUint(strings.TrimRight(strings.TrimSpace(strings.TrimPrefix(line, key)), "."), 10, 64)
				pages += n
			}
		}
	}
	available := pages * pageSize
	if available > total {
		return total
	}
	return available
}

func parseDarwinCPU(raw string) float64 {
	matches := idlePattern.FindStringSubmatch(raw)
	if len(matches) != 2 {
		return -1
	}
	idle, err := strconv.ParseFloat(matches[1], 64)
	if err != nil || idle < 0 || idle > 100 {
		return -1
	}
	return 100 - idle
}

func parseWindowsCapacity(raw string) (float64, uint64, uint64, bool) {
	fields := strings.Split(strings.TrimSpace(raw), "|")
	if len(fields) != 3 {
		return -1, 0, 0, false
	}
	cpu, e1 := strconv.ParseFloat(strings.TrimSpace(fields[0]), 64)
	total, e2 := strconv.ParseUint(strings.TrimSpace(fields[1]), 10, 64)
	available, e3 := strconv.ParseUint(strings.TrimSpace(fields[2]), 10, 64)
	if e1 != nil || e2 != nil || e3 != nil || cpu < 0 || cpu > 100 || available > total {
		return -1, 0, 0, false
	}
	return cpu, total * 1024, available * 1024, true
}
