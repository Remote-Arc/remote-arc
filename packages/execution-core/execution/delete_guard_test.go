package execution

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// Shared with the TypeScript port: packages/execution-core-ts/scripts/delete-guard.ts.
func TestDeleteGuardSharedCases(t *testing.T) {
	b, err := os.ReadFile("testdata/delete_guard_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Contexts map[string]DeleteGuardContext `json:"contexts"`
		Cases    []struct {
			Context string `json:"context"`
			Command string `json:"command"`
			Block   bool   `json:"block"`
			Reason  string `json:"reason"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, c := range fixture.Cases {
		reason := FindDangerousDelete(c.Command, fixture.Contexts[c.Context])
		if c.Block != (reason != "") {
			t.Errorf("%s block=%v: %s\n    got: %q", c.Context, c.Block, c.Command, reason)
		} else if reason != "" && c.Reason != "" && !strings.Contains(strings.ToLower(reason), strings.ToLower(c.Reason)) {
			t.Errorf("%s reason should mention %q: %s\n    got: %s", c.Context, c.Reason, c.Command, reason)
		}
	}
}

func TestDeleteGuardMessageAndBypass(t *testing.T) {
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "")
	err := AssertCommandAllowedIn("rm -rf /", "")
	if err == nil || !strings.HasPrefix(err.Error(), "Blocked by Remote Arc Safety Guard: deleting a drive") || !strings.Contains(err.Error(), "safe-cleanup") {
		t.Fatalf("unexpected guard result: %v", err)
	}
	if err := AssertCommandAllowedIn("rm -rf node_modules", t.TempDir()); err != nil {
		t.Fatalf("narrow cleanup was blocked: %v", err)
	}
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "1")
	if err := AssertCommandAllowedIn("rm -rf /", ""); err != nil {
		t.Fatal("explicit local override was ignored")
	}
}
