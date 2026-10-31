package browserrunner

import (
	"context"
	"errors"
	"time"
)

var errBrowserStarting = errors.New("browser is starting")

type launchTraceKey struct{}

type browserStartup struct {
	done   chan struct{}
	ctx    context.Context
	cancel context.CancelFunc
	proc   *browserProcess
	err    error
}

func (s *session) startingResult() map[string]any {
	return map[string]any{"session_id": s.cp.SessionID, "state": "starting", "browser_running": false, "retry_after_ms": 1000, "next_action": "Retry the same browser_runner_start request after one second, including task_id and any original start_url/settings. The existing launch continues; this call has not run a page action or submit."}
}

// The browser's existing 30s/60s startup allowance belongs to the session,
// not a single 40s Relay call. A response timeout must not kill and relaunch
// a cold browser. Only one launch may own this task/profile at a time.
func (s *session) awaitBrowserLaunch(ctx context.Context, exe string, hidden bool) (*browserProcess, error) {
	if s.pendingLaunch == nil {
		profile := profilePath(s.cp.Profile)
		launchCtx, cancel := context.WithTimeout(context.WithValue(context.Background(), launchTraceKey{}, s.cp.SessionID), startupWait(profile))
		pending := &browserStartup{done: make(chan struct{}), ctx: launchCtx, cancel: cancel}
		s.pendingLaunch = pending
		s.starting.Store(true)
		launch := s.m.launchBrowser
		if launch == nil {
			launch = launchBrowser
		}
		go func() {
			pending.err = s.startupStep("launch", func() error {
				var err error
				pending.proc, err = launch(launchCtx, exe, profile, hidden)
				return err
			})
			if launchCtx.Err() != nil && pending.proc != nil {
				pending.proc.stop()
				pending.proc = nil
				pending.err = launchCtx.Err()
			}
			if pending.err != nil {
				s.starting.Store(false)
			}
			close(pending.done)
		}()
	}
	pending := s.pendingLaunch
	wait := s.m.launchWait
	if wait <= 0 {
		wait = 8 * time.Second
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-pending.done:
		s.pendingLaunch = nil
		s.starting.Store(false)
		pending.cancel()
		return pending.proc, pending.err
	case <-timer.C:
		return nil, errBrowserStarting
	case <-ctx.Done():
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, errBrowserStarting
		}
		return nil, ctx.Err()
	case <-s.m.stop:
		s.cancelBrowserLaunch()
		return nil, errors.New("Browser Runner has stopped.")
	}
}

func (s *session) cancelBrowserLaunch() {
	pending := s.pendingLaunch
	if pending == nil {
		return
	}
	pending.cancel()
	select {
	case <-pending.done:
		if pending.proc != nil {
			pending.proc.stop()
		}
		s.pendingLaunch = nil
		s.starting.Store(false)
	case <-time.After(time.Second):
		// The worker checks cancellation and kills any newly created process
		// before publishing its result. Keep ownership until it acknowledges.
	}
}
