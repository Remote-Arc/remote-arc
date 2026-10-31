package browserrunner

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"
)

// Log routing metadata only, never URLs, profile paths, arguments or page
// content. Preserve timeout identity while naming the stalled phase.
func (s *session) startupStep(phase string, run func() error) error {
	started := time.Now()
	log.Printf("browser_runner_start session=%q phase=%s event=begin", s.cp.SessionID, phase)
	err := run()
	outcome := "ok"
	if err != nil {
		outcome = "error"
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			outcome = "timeout"
		}
	}
	log.Printf("browser_runner_start session=%q phase=%s elapsed_ms=%d outcome=%s", s.cp.SessionID, phase, time.Since(started).Milliseconds(), outcome)
	if outcome == "timeout" {
		return fmt.Errorf("browser_runner startup phase %s: %w", phase, err)
	}
	return err
}
