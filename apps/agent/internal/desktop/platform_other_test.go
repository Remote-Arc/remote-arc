//go:build !(windows && (amd64 || arm64)) && !linux

package desktop

import (
	"context"
	"testing"
	"time"
)

func TestUnsupportedPlatformRefusesEverything(t *testing.T) {
	p := unsupported{}
	if p.Ready() == nil || p.Start() == nil || p.Focus(Window{}) == nil || p.Locked() || !p.LastUserInput().IsZero() {
		t.Fatal("an unsupported platform refuses")
	}
	if _, err := p.Displays(); err == nil {
		t.Fatal("displays")
	}
	if _, err := p.Capture(Rect{}); err == nil {
		t.Fatal("capture")
	}
	if _, err := p.Windows(); err == nil {
		t.Fatal("windows")
	}
	if _, _, err := p.Elements(Window{}, 1); err == nil {
		t.Fatal("elements")
	}
	if _, err := p.WindowAt(0, 0); err == nil {
		t.Fatal("window at")
	}
	if _, _, err := p.Cursor(); err == nil {
		t.Fatal("cursor")
	}
	if _, err := p.Send(nil, nil); err == nil {
		t.Fatal("send")
	}
	p.Indicate(true)
	m := newManager(p, time.Now)
	if m.Available() {
		t.Fatal("not available")
	}
	_, err := m.Call(context.Background(), "desktop_snapshot", map[string]any{}, enabled)
	wantCode(t, err, ErrUnsupported)
}
