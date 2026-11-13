package execution

import (
	"os"
	"strconv"
)

const defaultMaxActiveProcesses = 64
const maxActiveProcessesCeiling = 256
const maxFinishedProcesses = 128

// This is an admission limit, not a cap on retained completion/output records.
// Operators may tune it for the computer; malformed values keep the default.
func activeProcessLimit() int {
	n, e := strconv.Atoi(os.Getenv("REMOTEARC_MAX_ACTIVE_PROCESSES"))
	if e != nil || n < 1 || n > maxActiveProcessesCeiling {
		return defaultMaxActiveProcesses
	}
	return n
}
func (p *Processes) activeCountLocked() int {
	active := 0
	for _, m := range p.items {
		select {
		case <-m.done:
		default:
			active++
		}
	}
	return active
}
