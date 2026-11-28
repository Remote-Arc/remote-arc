package codingagent

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// TestHelperClaude stands in for Claude Code: it prints its arguments, then
// answers each stdin line as Claude Code's stream-json would, asking for
// permission before a command.
func TestHelperClaude(t *testing.T) {
	if os.Getenv("FAKE_CLAUDE") != "1" {
		return
	}
	out := json.NewEncoder(os.Stdout)
	dir, _ := os.Getwd()
	args := os.Args[len(os.Args)-14:]
	for i, arg := range os.Args {
		if arg == "--" {
			args = os.Args[i:]
			break
		}
	}
	out.Encode(map[string]any{"type": "system", "subtype": "init", "args": args, "cwd": dir})
	in := bufio.NewScanner(os.Stdin)
	for in.Scan() {
		var line map[string]any
		json.Unmarshal(in.Bytes(), &line)
		switch line["type"] {
		case "control_request":
			out.Encode(map[string]any{"type": "control_response", "response": map[string]any{"subtype": "success", "request_id": line["request_id"]}})
		case "user":
			text := line["message"].(map[string]any)["content"].(string)
			if text == "run the tests" {
				out.Encode(map[string]any{"type": "control_request", "request_id": "req-1", "request": map[string]any{"subtype": "can_use_tool", "tool_name": "Bash", "input": map[string]any{"command": "npm test"}, "tool_use_id": "tu-1"}})
				continue
			}
			if text == "exit" {
				os.Exit(3)
			}
			if text == "flood" {
				// More than the session keeps, and more error output than it keeps.
				for i := 0; i < maxLines+10; i++ {
					out.Encode(map[string]any{"type": "assistant", "n": i})
				}
				os.Stderr.WriteString(strings.Repeat("e", stderrKeep+500) + "END")
				out.Encode(map[string]any{"type": "result", "subtype": "success", "is_error": false, "result": "flooded"})
				continue
			}
			out.Encode(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "echo: " + text}}}})
			out.Encode(map[string]any{"type": "result", "subtype": "success", "is_error": false, "result": "echo: " + text})
		case "control_response":
			answer := line["response"].(map[string]any)["response"].(map[string]any)
			_, hasInput := answer["updatedInput"]
			out.Encode(map[string]any{"type": "result", "subtype": "success", "is_error": false, "result": fmt.Sprint(answer["behavior"], " ", answer["updatedInput"], answer["message"], " input:", hasInput, " updates:", answer["updatedPermissions"])})
		}
	}
	os.Exit(0)
}

func fake(t *testing.T) *Manager {
	m := New()
	m.Command = func(name string, args ...string) *exec.Cmd {
		if base := strings.TrimSuffix(filepath.Base(name), ".exe"); base != "claude" {
			t.Fatalf("started %q", name)
		}
		cmd := exec.Command(os.Args[0], append([]string{"-test.run=TestHelperClaude", "--"}, args...)...)
		cmd.Env = append(os.Environ(), "FAKE_CLAUDE=1")
		return cmd
	}
	return m
}

// events collects pushes until want returns true or two seconds pass.
func events(t *testing.T, m *Manager, want func([]string, Event) bool) []string {
	t.Helper()
	var lines []string
	timeout := time.After(5 * time.Second)
	for {
		select {
		case e := <-m.Events():
			lines = append(lines, e.Lines...)
			if want(lines, e) {
				return lines
			}
		case <-timeout:
			t.Fatalf("pushes so far: %q", lines)
		}
	}
}

func contains(lines []string, text string) bool {
	for _, line := range lines {
		if strings.Contains(line, text) {
			return true
		}
	}
	return false
}

const ref = "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5"

// The computer's protected paths reach Claude Code as deny rules beside what
// the person allows; with none, the settings carry no deny list at all.
func TestSessionPassesProtectedPathDenyRules(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	started, err := m.Call("agent_session_start", map[string]any{
		"agent": "claude", "tag": "ar_0123456789ac", "session_ref": ref, "mode": "acceptEdits",
		"cwd": root, "prompt": "hello", "allow": []any{"Bash(npm test)"},
		"deny": []any{"Read(//**/.ssh/**)", "Edit(//**/.ssh/**)", 7, ""},
	}, p)
	if err != nil {
		t.Fatal(err)
	}
	// Stop it and wait, so Windows can remove the folder it ran in.
	defer func() {
		m.Call("agent_session_stop", map[string]any{"session": started.(map[string]any)["session"]}, p)
		events(t, m, func(_ []string, e Event) bool { return e.Exited })
	}()
	lines := events(t, m, func(l []string, _ Event) bool { return contains(l, `"args"`) })
	var init map[string]any
	json.Unmarshal([]byte(lines[0]), &init)
	want := `--settings {"permissions":{"allow":["Bash(npm test)"],"deny":["Read(//**/.ssh/**)","Edit(//**/.ssh/**)"]}}`
	if args := fmt.Sprint(init["args"]); !strings.Contains(args, want) {
		t.Fatalf("arguments %s lack %q", args, want)
	}
}

func TestSessionRunsClaudeAsTheAgentSDKDoesAndPushesWhatItPrints(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	started, err := m.Call("agent_session_start", map[string]any{
		"agent": "claude", "tag": "ar_0123456789ab", "session_ref": ref, "mode": "manual",
		"cwd": root, "prompt": "hello; $(whoami)", "allow": []any{"Bash(npm run:*)"},
	}, p)
	if err != nil {
		t.Fatal(err)
	}
	id := started.(map[string]any)["session"].(string)
	lines := events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello; $(whoami)"`) })
	var init map[string]any
	json.Unmarshal([]byte(lines[0]), &init)
	args := fmt.Sprint(init["args"])
	for _, want := range []string{"-p", "--input-format stream-json", "--output-format stream-json", "--permission-prompt-tool=stdio", "--permission-mode manual", `--settings {"permissions":{"allow":["Bash(npm run:*)"]}}`, "--session-id " + ref} {
		if !strings.Contains(args, want) {
			t.Fatalf("arguments %s lack %q", args, want)
		}
	}
	if strings.Contains(args, "whoami") {
		t.Fatal("the message reached the command line")
	}
	// The policy resolves the folder (macOS /private, Windows 8.3 short names),
	// so compare the directories, not their spelling.
	dir, _ := init["cwd"].(string)
	ran, errRan := os.Stat(dir)
	want, errWant := os.Stat(root)
	if errRan != nil || errWant != nil || !os.SameFile(ran, want) {
		t.Fatalf("ran in %q, want %q", dir, root)
	}

	// A command waits for the person; their answer reaches the same process.
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "message": "run the tests"}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(l []string, _ Event) bool { return contains(l, `"subtype":"can_use_tool"`) })
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "request_id": "req-1", "behavior": "allow", "updated_input": map[string]any{"command": "npm test"}}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(l []string, _ Event) bool { return contains(l, `allow map[command:npm test]`) })
	// Without an input Claude Code keeps its own; permission updates pass through.
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "request_id": "req-3", "behavior": "allow", "updated_permissions": []any{map[string]any{"type": "setMode", "mode": "acceptEdits", "destination": "session"}}}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(l []string, _ Event) bool {
		return contains(l, `input:false updates:[map[destination:session mode:acceptEdits type:setMode]]`)
	})
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "request_id": "req-4", "behavior": "allow", "updated_permissions": []any{"addRules"}}, p); err == nil {
		t.Fatal("a permission update that is not an object was sent")
	}
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "request_id": "req-2", "behavior": "deny", "deny_message": "use the script"}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(l []string, _ Event) bool { return contains(l, `use the script`) })

	// A Relay that missed pushes reads them back from any line on.
	read, err := m.Call("agent_session_read", map[string]any{"session": id, "from": float64(0)}, p)
	if err != nil {
		t.Fatal(err)
	}
	all := read.(map[string]any)
	if all["running"] != true || len(all["lines"].([]string)) < 5 || all["missed"] != false {
		t.Fatalf("read: %+v", all)
	}

	// The process ending is pushed with its exit code.
	m.Call("agent_session_input", map[string]any{"session": id, "message": "exit"}, p)
	events(t, m, func(_ []string, e Event) bool { return e.Exited && e.ExitCode != nil && *e.ExitCode == 3 })
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "message": "again"}, p); err == nil || !strings.Contains(err.Error(), "AGENT_SESSION_ENDED") {
		t.Fatalf("input after the end: %v", err)
	}
}

func TestSessionStartRefusesWhatItShouldNot(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	base := map[string]any{"agent": "claude", "tag": "ar_0123456789ab", "session_ref": ref, "mode": "manual", "cwd": root, "prompt": "x"}
	for name, change := range map[string]map[string]any{
		"another agent":   {"agent": "aider"},
		"a session id":    {"session_ref": "x; rm -rf ~"},
		"an unknown mode": {"mode": "bypassPermissions"},
		"a run tag":       {"tag": "anything"},
		"an empty prompt": {"prompt": "  "},
		"a model":         {"model": "opus; rm -rf ~"},
		"an effort":       {"effort": "ultra"},
		"a folder":        {"cwd": t.TempDir()},
	} {
		args := map[string]any{}
		for k, v := range base {
			args[k] = v
		}
		for k, v := range change {
			args[k] = v
		}
		if _, err := m.Call("agent_session_start", args, p); err == nil {
			t.Fatalf("%s outside the rules started", name)
		}
	}
	// The plan's background limit counts running sessions.
	limited := protocol.Policy{WorkspaceRoots: []string{root}, BackgroundTaskLimit: 1}
	first, err := m.Call("agent_session_start", base, limited)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Call("agent_session_start", base, limited); err == nil || !strings.Contains(err.Error(), "BACKGROUND_TASK_LIMIT") {
		t.Fatalf("second session: %v", err)
	}
	// Stopping ends the process, and its end is pushed.
	if _, err := m.Call("agent_session_stop", map[string]any{"session": first.(map[string]any)["session"]}, limited); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(_ []string, e Event) bool { return e.Exited })
	if _, err := m.Call("agent_session_read", map[string]any{"session": "as_missing"}, p); err == nil || !strings.Contains(err.Error(), "AGENT_SESSION_NOT_FOUND") {
		t.Fatalf("missing session: %v", err)
	}
}

func TestSessionKeepsARecentTailAndTheJanitorCleansUp(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	now := time.Unix(1_800_000_000, 0)
	var clock sync.Mutex
	m.Now = func() time.Time { clock.Lock(); defer clock.Unlock(); return now }
	advance := func(d time.Duration) { clock.Lock(); now = now.Add(d); clock.Unlock() }
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	start := func(prompt string, resume bool) string {
		t.Helper()
		started, err := m.Call("agent_session_start", map[string]any{
			"agent": "claude", "tag": "ar_0123456789ab", "session_ref": ref, "mode": "plan",
			"cwd": root, "prompt": prompt, "resume": resume,
		}, p)
		if err != nil {
			t.Fatal(err)
		}
		return started.(map[string]any)["session"].(string)
	}
	resumed := start("hello", true)
	lines := events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello"`) })
	if !contains(lines[:1], `"--resume","`+ref+`"`) {
		t.Fatalf("a resumed session was not resumed: %s", lines[0])
	}
	m.Call("agent_session_stop", map[string]any{"session": resumed}, p)
	events(t, m, func(_ []string, e Event) bool { return e.Exited && e.Session == resumed })
	flooded := start("flood", false)
	events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"flooded"`) })
	// A Relay that missed everything gets what is still kept, and is told it missed some.
	read, err := m.Call("agent_session_read", map[string]any{"session": flooded}, p)
	if err != nil {
		t.Fatal(err)
	}
	got := read.(map[string]any)
	if got["missed"] != true || got["from"].(int) <= 0 || len(got["lines"].([]string)) != maxLines {
		t.Fatalf("read after a flood: from %v, missed %v, %d lines", got["from"], got["missed"], len(got["lines"].([]string)))
	}

	// Ending it keeps a bounded tail of its error output.
	if _, err := m.Call("agent_session_input", map[string]any{"session": flooded, "message": "exit"}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(_ []string, e Event) bool { return e.Exited })
	read, _ = m.Call("agent_session_read", map[string]any{"session": flooded}, p)
	stderr := read.(map[string]any)["stderr"].(string)
	if len(stderr) != stderrKeep || !strings.HasSuffix(stderr, "END") {
		t.Fatalf("kept %d bytes of error output ending %q", len(stderr), stderr[len(stderr)-3:])
	}

	// The janitor stops a session nobody used for hours, and later forgets ended ones.
	idle := start("hello", false)
	events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello"`) })
	advance(idleLimit + time.Minute)
	m.sweep()
	events(t, m, func(_ []string, e Event) bool { return e.Exited && e.Session == idle })
	advance(keepExited + time.Minute)
	m.sweep()
	for _, id := range []string{flooded, idle} {
		if _, err := m.Call("agent_session_read", map[string]any{"session": id}, p); err == nil {
			t.Fatalf("session %s was kept after it ended long ago", id)
		}
	}

	// Shutting the Agent down stops what still runs.
	last := start("hello", false)
	events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello"`) })
	m.StopAll()
	events(t, m, func(_ []string, e Event) bool { return e.Exited && e.Session == last })
}

func TestSessionInputRefusesWhatItShouldNot(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	if _, err := m.Call("agent_session_launch", map[string]any{}, p); err == nil {
		t.Fatal("an unknown tool was answered")
	}
	base := map[string]any{"agent": "claude", "tag": "ar_0123456789ab", "session_ref": ref, "mode": "auto", "cwd": root}
	base["prompt"] = strings.Repeat("x", maxPrompt+1)
	if _, err := m.Call("agent_session_start", base, p); err == nil {
		t.Fatal("a message over the limit started a session")
	}
	base["prompt"] = "hello"
	started, err := m.Call("agent_session_start", base, p)
	if err != nil {
		t.Fatal(err)
	}
	id := started.(map[string]any)["session"].(string)
	events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello"`) })
	for name, args := range map[string]map[string]any{
		"nothing to send":    {"session": id},
		"an unknown answer":  {"session": id, "request_id": "r", "behavior": "maybe"},
		"a message too long": {"session": id, "message": strings.Repeat("x", maxPrompt+1)},
		"no such session":    {"session": "as_missing", "message": "hi"},
	} {
		if _, err := m.Call("agent_session_input", args, p); err == nil {
			t.Fatalf("%s was sent", name)
		}
	}
	// An interrupt reaches the process as Claude Code's own control request.
	if _, err := m.Call("agent_session_input", map[string]any{"session": id, "interrupt": true}, p); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Call("agent_session_stop", map[string]any{"session": id}, p); err != nil {
		t.Fatal(err)
	}
	events(t, m, func(_ []string, e Event) bool { return e.Exited })
	// Stopping an ended session is not an error.
	if _, err := m.Call("agent_session_stop", map[string]any{"session": id}, p); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Call("agent_session_stop", map[string]any{"session": "as_missing"}, p); err == nil {
		t.Fatal("stopped a session that does not exist")
	}

	// A computer without Claude Code says so.
	m.Command = func(string, ...string) *exec.Cmd { return exec.Command(root + "/no-such-claude") }
	if _, err := m.Call("agent_session_start", base, p); err == nil || !strings.Contains(err.Error(), "is it installed") {
		t.Fatalf("missing Claude Code: %v", err)
	}
}

func TestFindAgentLooksInTheInstallersFolders(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("PATH", t.TempDir())
	name := "ra-test-agent"
	if got := findAgent(name); got != name {
		t.Fatalf("an agent installed nowhere resolved to %q", got)
	}
	file := filepath.Join(home, ".local", "bin", name)
	if runtime.GOOS == "windows" {
		file += ".exe"
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := findAgent(name); got != file {
		t.Fatalf("found %q, want the installer's own folder %q", got, file)
	}
}

func TestSessionStartsWithTheChosenModelAndEffort(t *testing.T) {
	root := t.TempDir()
	m := fake(t)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	started, err := m.Call("agent_session_start", map[string]any{
		"agent": "claude", "tag": "ar_0123456789ab", "session_ref": ref, "mode": "acceptEdits",
		"cwd": root, "prompt": "hello", "model": "opus", "effort": "high",
	}, p)
	if err != nil {
		t.Fatal(err)
	}
	lines := events(t, m, func(l []string, _ Event) bool { return contains(l, `"result":"echo: hello"`) })
	if !contains(lines[:1], `"--model","opus","--effort","high"`) {
		t.Fatalf("model and effort missing: %s", lines[0])
	}
	m.Call("agent_session_stop", map[string]any{"session": started.(map[string]any)["session"]}, p)
	events(t, m, func(_ []string, e Event) bool { return e.Exited })
}

// The Relay accepts a session only in this form (AGENT_SESSION in
// apps/relay/src/agents/agent-live.ts). Changing one side alone made every
// Agent Orchestration turn fail with "The agent did not start." while Claude
// Code was in fact running.
func TestSessionIDMatchesTheRelay(t *testing.T) {
	relay := regexp.MustCompile(`^as_[0-9a-f]{16}$`)
	for i := 0; i < 50; i++ {
		if id := newID(); !relay.MatchString(id) {
			t.Fatalf("session id %q is not one the Relay accepts", id)
		}
	}
}
