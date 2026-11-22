//go:build !windows

package browserrunner

import "context"

func (s *session) raiseTaskWindow(ctx context.Context) error {
	return s.conn.Call(ctx, "Page.bringToFront", nil, nil)
}

func (s *session) restoreTaskWindow(ctx context.Context, id int) error {
	return s.quickBounds(ctx, id, map[string]any{"windowState": "normal"})
}

// CDP does not expose desktop Z order. Native Windows acceptance additionally
// checks occlusion; other desktops retain the browser's bring-to-front behavior.
func (s *session) taskWindowUncovered() bool { return true }
