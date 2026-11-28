package execution

import (
	"encoding/json"
	"os"
	"testing"
)

// The commands Relay sends to install Claude Code, Codex and Gemini CLI (with
// Node.js when a computer has none) must get past this guard, or nothing of
// them runs. Relay's agent-setup test keeps the fixture equal to what it sends.
func TestAgentInstallCommandsPassTheDeleteGuard(t *testing.T) {
	b, err := os.ReadFile("testdata/agent_install_commands.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Commands []struct {
			Platform string `json:"platform"`
			Agent    string `json:"agent"`
			Command  string `json:"command"`
		} `json:"commands"`
	}
	if err := json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	unix := func(platform, home string) DeleteGuardContext {
		return DeleteGuardContext{Platform: platform, Cwd: home + "/work", Home: home, Env: map[string]string{"HOME": home}}
	}
	contexts := map[string]DeleteGuardContext{
		"darwin": unix("darwin", "/Users/sam"),
		"linux":  unix("linux", "/home/sam"),
		"win32": {
			Platform: "win32",
			Cwd:      `E:\Coding`,
			Home:     `C:\Users\sam`,
			Env: map[string]string{
				"USERPROFILE":  `C:\Users\sam`,
				"LOCALAPPDATA": `C:\Users\sam\AppData\Local`,
				"APPDATA":      `C:\Users\sam\AppData\Roaming`,
			},
		},
	}
	if len(fixture.Commands) == 0 {
		t.Fatal("no install commands in the fixture")
	}
	for _, c := range fixture.Commands {
		ctx, ok := contexts[c.Platform]
		if !ok {
			t.Fatalf("unknown platform %q", c.Platform)
		}
		if reason := FindDangerousDelete(c.Command, ctx); reason != "" {
			t.Errorf("%s on %s is refused: %s", c.Agent, c.Platform, reason)
		}
	}
	// The form the first Node.js installer used is refused, so this test can fail.
	if FindDangerousDelete(`T="$(mktemp -d)"; rm -rf "$T"`, contexts["darwin"]) == "" {
		t.Fatal("a delete through a shell variable should be refused")
	}
}
