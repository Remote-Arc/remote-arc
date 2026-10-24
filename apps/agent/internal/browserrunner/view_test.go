package browserrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"math/rand"
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
	case "Page.captureScreenshot":
		c.params = params.(map[string]any)
		c.screenshots++
		var out bytes.Buffer
		_ = jpeg.Encode(&out, image.NewRGBA(image.Rect(0, 0, 2560, 1440)), &jpeg.Options{Quality: 50})
		value = map[string]any{"data": base64.StdEncoding.EncodeToString(out.Bytes())}
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
		raw, err := base64.StdEncoding.DecodeString(frame.Data)
		if err != nil || len(raw) > maxFrameBytes {
			t.Fatal("invalid frame size")
		}
		cfg, err := jpeg.DecodeConfig(bytes.NewReader(raw))
		if err != nil || cfg.Width != 1280 || cfg.Height != 720 {
			t.Fatal("Retina frame was not scaled", cfg, err)
		}
	default:
		t.Fatal("static page must send its first frame without a paint event")
	}
	if _, exists := client.params["clip"]; exists || client.params["captureBeyondViewport"] != false {
		t.Fatal("live view must not resize or capture beyond the existing viewport", client.params)
	}
	for _, method := range client.methods {
		if method == "Browser.setWindowBounds" || method == "Page.bringToFront" || strings.HasPrefix(method, "Emulation.") {
			t.Fatal("capture changed the page or window", method)
		}
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

func TestViewJPEGRejectsInvalidAndCapsNoisyFrames(t *testing.T) {
	for _, data := range []string{"", "not base64", "anBlZw==", strings.Repeat("A", 12*1024*1024)} {
		if _, err := cappedViewJPEG(data); err == nil {
			t.Fatal("invalid capture accepted")
		}
	}
	img := image.NewRGBA(image.Rect(0, 0, 2560, 1440))
	rng := rand.New(rand.NewSource(42))
	for y := 0; y < 1440; y++ {
		for x := 0; x < 2560; x++ {
			img.SetRGBA(x, y, color.RGBA{byte(rng.Intn(256)), byte(rng.Intn(256)), byte(rng.Intn(256)), 255})
		}
	}
	var source bytes.Buffer
	if err := jpeg.Encode(&source, img, &jpeg.Options{Quality: 50}); err != nil {
		t.Fatal(err)
	}
	encoded, err := cappedViewJPEG(base64.StdEncoding.EncodeToString(source.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(raw) > maxFrameBytes {
		t.Fatal("frame size cap not enforced", len(raw), err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width != 1280 || cfg.Height != 720 {
		t.Fatal("aspect ratio or width changed", cfg, err)
	}
}
