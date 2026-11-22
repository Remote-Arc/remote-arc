package execution

import (
	"context"
	"errors"
	"time"
)

// ErrDeviceBusy means a file change or Undo waited for an earlier one and gave
// up before it started. Nothing was changed, so the caller can retry safely.
// The Relay maps the "DEVICE_BUSY:" prefix to its own error code.
var ErrDeviceBusy = errors.New("DEVICE_BUSY: another file change on this device did not finish in time. This request was not started and nothing was changed.")

// mutationReplyMargin is the time left before a call's deadline at which a
// queued change stops waiting. The refusal then still reaches the Relay before
// it reports DEVICE_TIMEOUT, and a change that does start has time to finish.
const mutationReplyMargin = 5 * time.Second

// acquireMutation waits for the mutation slot until ctx ends or, when ctx has a
// deadline, until mutationReplyMargin before it. A call that cannot start in
// time returns ErrDeviceBusy and never runs later.
func (c *Core) acquireMutation(ctx context.Context) (func(), error) {
	wait := ctx
	if deadline, ok := ctx.Deadline(); ok {
		var cancel context.CancelFunc
		wait, cancel = context.WithDeadline(ctx, deadline.Add(-mutationReplyMargin))
		defer cancel()
	}
	if wait.Err() != nil {
		return nil, ErrDeviceBusy
	}
	select {
	case c.mutation <- struct{}{}:
	case <-wait.Done():
		return nil, ErrDeviceBusy
	}
	release := func() { <-c.mutation }
	// select picks at random when both cases are ready, so check again
	// before touching any file.
	if wait.Err() != nil {
		release()
		return nil, ErrDeviceBusy
	}
	return release, nil
}
