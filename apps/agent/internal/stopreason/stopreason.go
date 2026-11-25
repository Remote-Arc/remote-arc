// Package stopreason records why the Agent stopped. A stopped Agent used to
// log only "Go agent stopped.", which could not tell a macOS logout (launchd
// sends SIGTERM to every service of the user) from a Dashboard stop or a
// local handoff. Each stop path cancels its context with one of these causes,
// and the Agent logs Describe(ctx) when it ends.
package stopreason

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"
)

// Cause is a context cancellation cause that names who stopped the Agent.
type Cause struct{ text string }

func (c *Cause) Error() string { return c.text }

var (
	// RemoteRequest is a stop, pause or update restart asked for over the
	// Relay connection.
	RemoteRequest = &Cause{"stop requested through Remote Arc (Dashboard stop, pause or update restart)"}
	// LocalRequest is a POST /stop on the local control channel.
	LocalRequest = &Cause{"stop requested by Remote Arc on this computer (remotelink --stop, an upgrade handoff or the recovery supervisor)"}
	// LeaseLost means another Remote Arc process took the execution lease.
	LeaseLost = &Cause{"execution lease lost to another Remote Arc process"}
)

// Signal returns the cause for an operating-system signal.
func Signal(s os.Signal) error {
	switch s {
	case syscall.SIGTERM:
		return &Cause{"received SIGTERM from the operating system or a service manager (for example logout, shutdown, launchctl or kill)"}
	case os.Interrupt:
		return &Cause{"received an interrupt (Ctrl+C)"}
	}
	return &Cause{"received signal " + s.String()}
}

// Describe returns why ctx ended, or "" while it is still running.
func Describe(ctx context.Context) string {
	if ctx.Err() == nil {
		return ""
	}
	var cause *Cause
	if errors.As(context.Cause(ctx), &cause) {
		return cause.text
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "deadline exceeded"
	}
	return "context canceled without a recorded reason"
}

// Notify returns a context that ends with Signal(s) as its cause when one of
// sigs arrives. Like signal.NotifyContext, it stops listening after the first
// signal, so a second one ends the process with the default behaviour.
func Notify(parent context.Context, sigs ...os.Signal) (context.Context, context.CancelFunc) {
	return notifyWith(parent, signal.Notify, signal.Stop, sigs...)
}

// notifyWith takes the signal functions as arguments so tests can deliver a
// fake signal; the goroutine uses only the values passed to this call.
func notifyWith(parent context.Context, notify func(chan<- os.Signal, ...os.Signal), stopNotify func(chan<- os.Signal), sigs ...os.Signal) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancelCause(parent)
	ch := make(chan os.Signal, 1)
	notify(ch, sigs...)
	go func() {
		select {
		case s := <-ch:
			stopNotify(ch)
			cancel(Signal(s))
		case <-ctx.Done():
			stopNotify(ch)
		}
	}()
	return ctx, func() { cancel(context.Canceled) }
}
