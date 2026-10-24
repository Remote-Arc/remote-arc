package onboarding

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func clients(context.Context, string, string) (Inspection, error) {
	return Inspection{Clients: []Client{{Agent: "codex"}, {Agent: "claude"}}}, nil
}

func TestAutomaticClientsAreIndependentAndBounded(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	claude := make(chan struct{})
	done := make(chan []AutomaticResult, 1)
	go func() {
		done <- automatic(ctx, "all", "install", "test", clients, func(ctx context.Context, c Client, _, _ string) AutomaticResult {
			if c.Agent == "codex" {
				<-ctx.Done()
				return AutomaticResult{Agent: c.Agent, Status: "setup_skipped"}
			}
			close(claude)
			return AutomaticResult{Agent: c.Agent, Status: "installed", ToolsVerified: true}
		})
	}()
	select {
	case <-claude:
	case <-time.After(time.Second):
		t.Fatal("one hung client blocked the other")
	}
	cancel()
	select {
	case results := <-done:
		if len(results) != 2 {
			t.Fatal("missing timeout receipt")
		}
	case <-time.After(time.Second):
		t.Fatal("cancellation did not bound setup")
	}
}

func TestStartupOnlyEmitsInformationalResults(t *testing.T) {
	notices := make(chan string, 6)
	stop := startAutomatic(context.Background(), "test", func(level, message string) {
		if level != "info" {
			t.Error("optional setup emitted an error", level)
		}
		notices <- message
	}, func(context.Context, string, string, string) []AutomaticResult {
		return []AutomaticResult{{Agent: "codex", Status: "installed"}, {Agent: "claude", Status: "already_registered"}, {Agent: "claude", Status: "connector_present"}, {Agent: "claude", Status: "not_found"}, {Agent: "codex", Status: "setup_skipped", Hint: "timed out"}}
	})
	defer stop()
	for _, want := range []string{"registered", "no duplicate", "no duplicate", "skipped", "continues normally"} {
		select {
		case got := <-notices:
			if !strings.Contains(got, want) {
				t.Fatal(got, want)
			}
		case <-time.After(time.Second):
			t.Fatal("missing informational result")
		}
	}
}

func TestAutomaticPanicAndMissingClientAreInformational(t *testing.T) {
	r := automatic(context.Background(), "all", "install", "test", clients, func(_ context.Context, c Client, _, _ string) AutomaticResult {
		if c.Agent == "codex" {
			panic("synthetic client failure")
		}
		return globalSetup(context.Background(), c, "install", "test")
	})
	if len(r) != 2 {
		t.Fatal(r)
	}
	for _, v := range r {
		if v.Agent == "codex" && v.Status != "setup_skipped" || v.Agent == "claude" && v.Status != "not_found" {
			t.Fatal(r)
		}
	}
	r = automatic(context.Background(), "all", "install", "test", func(context.Context, string, string) (Inspection, error) { return Inspection{}, errors.New("PRIVATE") }, nil)
	if len(r) != 1 || strings.Contains(r[0].Hint, "PRIVATE") {
		t.Fatal(r)
	}
}

func TestOptionalStartupReturnsBeforeSetupAndCancels(t *testing.T) {
	started, finished := make(chan struct{}), make(chan struct{})
	notices := make(chan string, 3)
	begin := time.Now()
	stop := startAutomatic(context.Background(), "test", func(level, message string) {
		if level != "info" {
			t.Error(level)
		}
		notices <- message
	}, func(ctx context.Context, _, _, _ string) []AutomaticResult {
		close(started)
		<-ctx.Done()
		close(finished)
		return []AutomaticResult{{Agent: "codex", Status: "setup_skipped"}}
	})
	if time.Since(begin) > time.Second {
		t.Fatal("startup waited for the optional task")
	}
	<-started
	stop()
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("shutdown waited for client setup")
	}
	select {
	case n := <-notices:
		t.Fatal("canceled hook emitted a late notice", n)
	default:
	}
	stop = startAutomatic(context.Background(), "test", func(level, message string) { notices <- message }, func(context.Context, string, string, string) []AutomaticResult { panic("PRIVATE") })
	defer stop()
	select {
	case n := <-notices:
		if strings.Contains(n, "PRIVATE") || !strings.Contains(n, "continues normally") {
			t.Fatal(n)
		}
	case <-time.After(time.Second):
		t.Fatal("panic was not handled")
	}
}

func TestWSLMissingClientPointsToWindows(t *testing.T) {
	for _, wsl := range []bool{true, false} {
		notices := make(chan string, 1)
		stop := startAutomaticOn(context.Background(), "test", func(_, message string) { notices <- message }, func(context.Context, string, string, string) []AutomaticResult {
			return []AutomaticResult{{Agent: "claude", Status: "not_found"}}
		}, wsl)
		select {
		case got := <-notices:
			if !strings.Contains(got, "skipped") || strings.Contains(got, "Windows PowerShell") != wsl {
				t.Fatal(wsl, got)
			}
		case <-time.After(time.Second):
			t.Fatal("missing notice")
		}
		stop()
	}
}
