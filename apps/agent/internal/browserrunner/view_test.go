package browserrunner

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

type staticViewClient struct {
	methods     []string
	params      map[string]any
	screenshots int
}

func (c *staticViewClient) Call(ctx context.Context, method string, params any, out any) error {
	c.methods = append(c.methods, method)
	var value any
	switch method {
	case "Page.getLayoutMetrics":
		value = map[string]any{"cssLayoutViewport": map[string]any{"clientWidth": 2560, "clientHeight": 1440}}
	case "Runtime.evaluate":
		value = map[string]any{"result": map[string]any{"value": 2}}
	case "Page.captureScreenshot":
		c.params = params.(map[string]any)
		c.screenshots++
		value = map[string]any{"data": "anBlZw=="}
	default:
		return nil
	}
	raw, _ := json.Marshal(value)
	return json.Unmarshal(raw, out)
}
func (c *staticViewClient) CallIn(ctx context.Context, session, method string, params any, out any) error {
	return c.Call(ctx, method, params, out)
}
func (c *staticViewClient) Fire(method string, params any)            { c.methods = append(c.methods, method) }
func (c *staticViewClient) FireIn(session, method string, params any) { c.Fire(method, params) }
func (c *staticViewClient) Close()                                    {}
func (c *staticViewClient) Alive() bool                               { return true }

func TestStaticLiveViewBootstrapsOneCappedFrame(t *testing.T) {
	m := New()
	client := &staticViewClient{}
	s := &session{m: m, cp: &Checkpoint{SessionID: "static"}, conn: client}
	s.serviceView(context.Background())
	if len(client.methods) != 0 {
		t.Fatal("capture without a viewer", client.methods)
	}
	s.viewUntil = time.Now().Add(time.Minute)
	s.serviceView(context.Background())
	select {
	case frame := <-m.Frames():
		if frame.Data != "anBlZw==" {
			t.Fatal(frame)
		}
	default:
		t.Fatal("static page must send its first frame without a paint event")
	}
	clip := client.params["clip"].(map[string]any)
	if clip["scale"] != 0.25 || client.params["quality"] != 50 {
		t.Fatal("first frame not scaled/capped", client.params)
	}
	s.serviceView(context.Background())
	if client.screenshots != 1 {
		t.Fatal("initial screenshot repeated after first frame")
	}
	// A second frame inside 500ms is dropped, even from the bootstrap path.
	s.forwardViewFrame("anBlZw==")
	select {
	case <-m.Frames():
		t.Fatal("frame rate exceeded")
	default:
	}
	s.lastViewFrame = time.Now().Add(-3 * time.Second)
	s.serviceView(context.Background())
	if client.screenshots != 2 {
		t.Fatal("occluded view was not refreshed")
	}
	select {
	case <-m.Frames():
	default:
		t.Fatal("no refresh frame")
	}
	s.lastViewFrame = time.Now().Add(-time.Second)
	s.forwardViewFrame(strings.Repeat("A", maxFrameBytes*2))
	select {
	case <-m.Frames():
		t.Fatal("oversized frame forwarded")
	default:
	}
	s.viewUntil = time.Now().Add(-time.Second)
	s.serviceView(context.Background())
	if s.viewActive {
		t.Fatal("stale heartbeat did not stop capture")
	}
	if client.methods[len(client.methods)-1] != "Page.stopScreencast" {
		t.Fatal(client.methods)
	}
}
