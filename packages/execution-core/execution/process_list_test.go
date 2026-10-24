package execution

import (
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
