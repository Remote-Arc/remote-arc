package execution

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

// Scripts run directly or through a shell are read and judged like inline commands.
func TestDeleteGuardReadsScriptFiles(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("wipe.sh", "#!/bin/sh\nrm -rf /\n")
	write("wipe.ps1", "Remove-Item -Recurse -Force /\n")
	write("wipe.bat", "@echo off\r\nrd /s /q \"/\"\r\n")
	write("tidy.sh", "rm -rf build\n")
	write("big.sh", "rm -rf /\n"+strings.Repeat("#", maxScriptBytes))
	if err := os.Mkdir(filepath.Join(dir, "folder.sh"), 0o700); err != nil {
		t.Fatal(err)
	}
	ctx := LocalDeleteGuardContext(dir)
	for _, command := range []string{"bash wipe.sh", "sh -e wipe.sh", "./wipe.sh", "wipe.ps1", "pwsh -NoProfile -File wipe.ps1", "wipe.bat"} {
		if reason := FindDangerousDelete(command, ctx); !strings.Contains(reason, "root") {
			t.Errorf("%s should be blocked as a root delete, got %q", command, reason)
		}
	}
	for _, command := range []string{"bash tidy.sh", "bash missing.sh", "bash big.sh", "bash folder.sh", "pwsh -File"} {
		if reason := FindDangerousDelete(command, ctx); reason != "" {
			t.Errorf("%s should be allowed, got %q", command, reason)
		}
	}
}

func TestDeleteGuardPathHelpers(t *testing.T) {
	for in, want := range map[string]string{
		`\\server`:            `\\server`,
		`C:\a\..\..\b`:        `C:\b`,
		`C:\dir.\name. \file`: `C:\dir\name\file`,
		`C:\...\x`:            `C:\...\x`,
	} {
		if got := normWin(in); got != want {
			t.Errorf("normWin(%q) = %q, want %q", in, got, want)
		}
	}
	if got := normPosix("/a/../../b/./c"); got != "/b/c" {
		t.Errorf("normPosix = %q", got)
	}
	if parentOf(true, "C:") != "C:" || parentOf(false, "a") != "/" || parentOf(true, `C:\x`) != `C:\` {
		t.Error("parentOf mishandles a root or bare name")
	}
	if indexFrom("abc", "c", 9) != -1 || clampLen("abc", 9) != 3 || charAt("abc", -1) != 0 {
		t.Error("bounds helpers should clamp")
	}
	// Without the usual environment variables the Windows rules fall back to C:.
	bare := DeleteGuardContext{Platform: "win32", Home: `C:\Users\Ann`, Env: map[string]string{"SystemDrive": `E:\`}}
	if reason := ProtectedDeleteReason(bare, `E:\Windows\System32`); !strings.Contains(reason, `E:\Windows`) {
		t.Errorf("default system root not protected: %q", reason)
	}
	if reason := ProtectedDeleteReason(bare, `E:\Windows\Temp\x`); reason != "" {
		t.Errorf("Windows Temp carve-out lost: %q", reason)
	}
	if _, ok := expandShortNames(`Q:\NOPE~1\x`); ok {
		t.Error("an unresolvable short name must not be accepted")
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
