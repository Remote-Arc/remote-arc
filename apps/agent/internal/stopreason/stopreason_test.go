package stopreason

import (
	"context"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestDescribeNamesEachStopCause(t *testing.T) {
	running, cancelRunning := context.WithCancel(context.Background())
	defer cancelRunning()
	if got := Describe(running); got != "" {
		t.Fatalf("running context described as %q", got)
	}
	for _, c := range []struct {
		cause error
		want  string
	}{
		{Signal(syscall.SIGTERM), "SIGTERM"},
		{Signal(os.Interrupt), "Ctrl+C"},
		{Signal(syscall.SIGHUP), "received signal hangup"},
		{RemoteRequest, "Dashboard stop"},
		{LocalRequest, "remotelink --stop"},
		{LeaseLost, "lease lost"},
	} {
		parent, cancel := context.WithCancelCause(context.Background())
		// The Agent runs on a child context; the parent's cause must reach it.
		child, cancelChild := context.WithCancel(parent)
		cancel(c.cause)
		if got := Describe(child); !strings.Contains(got, c.want) {
			t.Fatalf("cause %v described as %q, want it to contain %q", c.cause, got, c.want)
		}
		cancelChild()
	}
	plain, cancelPlain := context.WithCancel(context.Background())
	cancelPlain()
	if got := Describe(plain); got != "context canceled without a recorded reason" {
		t.Fatalf("plain cancel described as %q", got)
	}
}

func TestNotifyRecordsTheSignalAndStopsListening(t *testing.T) {
	var registered chan<- os.Signal
	stopped := make(chan chan<- os.Signal, 1)
	notify := func(c chan<- os.Signal, _ ...os.Signal) { registered = c }
	stopNotify := func(c chan<- os.Signal) { stopped <- c }

	ctx, cancel := notifyWith(context.Background(), notify, stopNotify, syscall.SIGTERM)
	defer cancel()
	registered <- syscall.SIGTERM
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("signal did not end the context")
	}
	if got := Describe(ctx); !strings.Contains(got, "SIGTERM") || !strings.Contains(got, "logout") {
		t.Fatalf("signal stop described as %q", got)
	}
	select {
	case c := <-stopped:
		if c != registered {
			t.Fatal("stopped a different channel")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("signal listener not stopped after the first signal")
	}
}

func TestNotifyCancelIsNotReportedAsASignal(t *testing.T) {
	notify := func(chan<- os.Signal, ...os.Signal) {}
	stopNotify := func(chan<- os.Signal) {}
	ctx, cancel := notifyWith(context.Background(), notify, stopNotify, syscall.SIGTERM)
	cancel()
	if got := Describe(ctx); got != "context canceled without a recorded reason" {
		t.Fatalf("plain cancel described as %q", got)
	}
}
