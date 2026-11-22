package agent

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Agent Orchestration's Claude Code sessions follow terminal mode, as
// start_process does, and reach the session manager through dispatch.
func TestAgentSessionsFollowTerminalMode(t *testing.T) {
	a := secretAgent(t, "managed")
	hello := a.hello(context.Background())
	if !slices.Contains(hello["tools"].([]string), "agent_session_start") || !slices.Contains(hello["capabilities"].([]string), "agent_session_v1") {
		t.Fatal("a terminal-mode Agent advertises its sessions")
	}
	_, err := a.dispatch(context.Background(), protocol.Call{Tool: "agent_session_read", Arguments: map[string]any{"session": "as_missing"}}, nil)
	if err == nil || !strings.Contains(err.Error(), "AGENT_SESSION_NOT_FOUND") {
		t.Fatalf("a read reaches the session manager: %v", err)
	}

	safe := secretAgent(t, "safe")
	hello = safe.hello(context.Background())
	if slices.Contains(hello["tools"].([]string), "agent_session_start") || slices.Contains(hello["capabilities"].([]string), "agent_session_v1") {
		t.Fatal("a mode without start_process does not advertise sessions")
	}
	_, err = safe.dispatch(context.Background(), protocol.Call{Tool: "agent_session_start", Arguments: map[string]any{"agent": "claude"}}, nil)
	if err == nil || !strings.Contains(err.Error(), "terminal mode") {
		t.Fatalf("got %v", err)
	}
}
