//go:build !windows

package cli

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestAuthorizationBrowserLaunchPassesURLAsOneArgument(t *testing.T) {
	dir := t.TempDir()
	name := "xdg-open"
	if runtime.GOOS == "darwin" {
		name = "open"
	}
	file := filepath.Join(dir, "opened.txt")
	t.Setenv("REMOTEARC_TEST_OPENED_URL", file)
	t.Setenv("PATH", dir)
	if err := os.WriteFile(filepath.Join(dir, name), []byte("#!/bin/sh\nprintf '%s' \"$1\" > \"$REMOTEARC_TEST_OPENED_URL\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	url := "https://example.test/authorize?code=fixture&state=a%20b"
	if err := openBrowser(url); err != nil {
		t.Fatal(err)
	}
	deadline := time.After(3 * time.Second)
	for {
		data, err := os.ReadFile(file)
		if err == nil && string(data) == url {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("authorization URL was not preserved as one argument: %q %v", data, err)
		case <-time.After(10 * time.Millisecond):
		}
	}
	t.Setenv("PATH", t.TempDir())
	if err := openBrowser(url); err == nil {
		t.Fatal("missing browser opener reported success")
	}
}

func TestTerminalPromptReadsAnswersAndHonorsCancellation(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	defer w.Close()
	ask := terminalAsk(r, io.Discard)
	if _, err = w.WriteString("yes\n"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	answer, err := ask(ctx, "continue?")
	if err != nil || answer != "yes" {
		t.Fatal(answer, err)
	}
	cancel()
	if _, err = ask(ctx, "continue?"); err != context.Canceled {
		t.Fatal("cancelled prompt waited for input", err)
	}
}
