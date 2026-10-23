package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"
)

// Model a window manager that acknowledges initial startup requests but drops
// them. A successful protocol response alone does not mean the window is hidden.
type windowStateCDP struct {
	state      string
	applyAfter int
	requests   int
	requestErr error
}

func (c *windowStateCDP) Call(ctx context.Context, method string, params any, out any) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	switch method {
	case "Browser.setWindowBounds":
		c.requests++
		if c.requestErr != nil {
			return c.requestErr
		}
		p := params.(map[string]any)
		if p["windowId"] != 7 {
			return errors.New("wrong task window")
		}
		if c.requests >= c.applyAfter {
			c.state = p["bounds"].(map[string]any)["windowState"].(string)
		}
		return nil
	case "Browser.getWindowForTarget":
		b, _ := json.Marshal(map[string]any{"windowId": 7, "bounds": windowBounds{WindowState: c.state}})
		return json.Unmarshal(b, out)
	default:
		return fmt.Errorf("unexpected window protocol method %s", method)
	}
}
func (c *windowStateCDP) CallIn(ctx context.Context, _ string, method string, params any, out any) error {
	return c.Call(ctx, method, params, out)
}
func (*windowStateCDP) Fire(string, any)           { panic("unexpected async call") }
func (*windowStateCDP) FireIn(string, string, any) { panic("unexpected child call") }
func (*windowStateCDP) Close()                     {}
func (*windowStateCDP) Alive() bool                { return true }

func TestWindowStateRetriesAcknowledgedButIgnoredRequest(t *testing.T) {
	for _, state := range []string{"minimized", "normal"} {
		t.Run(state, func(t *testing.T) {
			c := &windowStateCDP{state: "pending", applyAfter: 3}
			s := &session{conn: c}
			if e := s.setWindowState(context.Background(), 7, state); e != nil {
				t.Fatal(e)
			}
			if c.state != state || c.requests != 3 {
				t.Fatalf("state=%s requests=%d", c.state, c.requests)
			}
		})
	}
}

func TestWindowStateDoesNotClaimSuccessWhenTransitionIsIgnored(t *testing.T) {
	c := &windowStateCDP{state: "normal", applyAfter: 1000}
	s := &session{conn: c}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if e := s.setWindowState(ctx, 7, "minimized"); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatalf("an unchanged window must fail with its deadline: %v", e)
	}
	if c.state != "normal" {
		t.Fatal("test window changed unexpectedly")
	}
}

func TestWindowStatePropagatesProtocolFailure(t *testing.T) {
	want := errors.New("window was closed")
	c := &windowStateCDP{requestErr: want}
	s := &session{conn: c}
	if e := s.setWindowState(context.Background(), 7, "minimized"); !errors.Is(e, want) {
		t.Fatal(e)
	}
	if c.requests != 1 {
		t.Fatal("a protocol failure was retried")
	}
}
