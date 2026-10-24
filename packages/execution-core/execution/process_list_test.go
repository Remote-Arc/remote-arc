package execution

import (
	"encoding/json"
	"runtime"
	"strings"
	"testing"
)

func TestRedactCommandLine(t *testing.T) {
	cases := map[string]string{
		`node server.js --token abc123 --port 80`:           `node server.js --token [redacted] --port 80`,
		`app --api-key=sk-live-1 run`:                       `app --api-key=[redacted] run`,
		`curl -H "Authorization: Bearer eyJhbGciOi" x`:      `curl -H "Authorization: Bearer [redacted] x`,
		`tool PASSWORD="hunter 2" next`:                     `tool PASSWORD=[redacted] next`,
		`codex.exe /client_secret:xyz`:                      `codex.exe /client_secret:[redacted]`,
		`git auth status`:                                   `git auth status`,
		`C:\pwd\author\tokenizer.exe --tokens 4`:            `C:\pwd\author\tokenizer.exe --tokens 4`,
		`claude.exe --resume 0b1c --dangerously-skip-perms`: `claude.exe --resume 0b1c --dangerously-skip-perms`,
	}
	cases[`node --token "synthetic\"private" --port 80`] = `node --token [redacted] --port 80`
	for in, want := range cases {
		if got := redactCommandLine(in); got != want {
			t.Errorf("redact(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestListProcessesFilterAndLimit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("covered by the Windows CI matrix through tasklist")
	}
	all, err := listProcesses("", 1000, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(all, "PID") || !strings.Contains(all, "processes]") {
		t.Fatalf("missing header or summary: %q", all[:min(200, len(all))])
	}
	one, err := listProcesses("", 1, false)
	if err != nil {
		t.Fatal(err)
	}
	rows := strings.Split(strings.TrimSpace(strings.SplitN(one, "\n\n", 2)[1]), "\n")
	// header + 1 row + blank + summary
	if !strings.HasPrefix(rows[len(rows)-1], "[1 of ") || !strings.Contains(rows[len(rows)-1], "raise limit") {
		t.Fatalf("limit summary wrong: %q", one)
	}
	none, err := listProcesses("no-such-process-name-remotearc", 10, false)
	if err != nil || !strings.Contains(none, "[0 of 0 processes matching") {
		t.Fatalf("filter wrong: %q %v", none, err)
	}
}

func TestProcessCommandPerPlatform(t *testing.T) {
	name, args, header := processCommand("linux", true)
	if name != "ps" || header != "" || !strings.Contains(strings.Join(args, " "), "command") {
		t.Fatalf("unix listing wrong: %s %v %q", name, args, header)
	}
	name, args, header = processCommand("windows", false)
	if name != "tasklist.exe" || !strings.Contains(header, `"PID"`) || strings.Join(args, " ") != "/FO CSV /NH" {
		t.Fatalf("windows listing wrong: %s %v %q", name, args, header)
	}
	name, args, header = processCommand("windows", true)
	if name != "powershell.exe" || header != "" || !strings.Contains(args[len(args)-1], "CommandLine") {
		t.Fatalf("windows details wrong: %s %v %q", name, args, header)
	}
}

func TestListProcessesInvalidLimitFallsBack(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("tasklist covered by the Windows CI matrix")
	}
	for _, limit := range []int{0, -3, 5000} {
		out, err := listProcesses("", limit, false)
		if err != nil || !strings.Contains(out, " processes") {
			t.Fatalf("limit %d: %v %q", limit, err, out)
		}
	}
}

func TestWindowsProcessDetailsRedactsDecodedCommands(t *testing.T) {
	command := "node job.js --token \"SYNTHETIC PRIVATE TOKEN\" --password 'SECRET,WITH,COMMAS' --client-secret \"LINE1\nLINE2\" --port 80"
	row := map[string]any{"ProcessId": 123, "ParentProcessId": 12, "Name": "node.exe", "MemoryMB": 42, "CommandLine": command}
	for _, value := range []any{row, []any{row}, nil} {
		raw, _ := json.Marshal(value)
		out, err := windowsProcessDetails(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range []string{"SYNTHETIC PRIVATE TOKEN", "SECRET,WITH,COMMAS", "LINE1", "LINE2"} {
			if strings.Contains(out, secret) {
				t.Fatalf("quoted process credential leaked: %s", secret)
			}
		}
		if value != nil && (!strings.Contains(out, "--port 80") || strings.Count(out, "\n") != 1) {
			t.Fatal("process rows corrupted", out)
		}
	}
	if _, err := windowsProcessDetails("malformed details"); err == nil {
		t.Fatal("invalid process output accepted")
	}
}
