package cli

import (
	"strings"
	"testing"
)

func TestKeptAgentMessageLeadsWithLatestForOlderCommands(t *testing.T) {
	if got := keptAgentMessage("0.6.3", "0.6.3"); !strings.Contains(got, "already running") || !strings.Contains(got, "npx remotelink@0.6.3 --force-update") {
		t.Fatal(got)
	}
	got := keptAgentMessage("0.6.2-rc.7", "0.6.2-rc.6")
	latest, rollback := strings.Index(got, "npx remotelink@latest"), strings.Index(got, "--force-update")
	if latest < 0 || rollback < latest || !strings.Contains(got, "npm install -g remotelink@latest") || !strings.Contains(got, "roll back on purpose") {
		t.Fatal(got)
	}
}
