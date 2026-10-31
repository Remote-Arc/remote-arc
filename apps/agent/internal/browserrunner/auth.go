package browserrunner

import (
	"context"
	"errors"
	"net/url"
	"strings"
)

func (s *session) authAllows(raw string, captcha bool) bool {
	if captcha && !s.auth.Captcha || !captcha && !s.auth.OTP {
		return false
	}
	sc, e := newScope(s.auth.Origins)
	return e == nil && sc.Allows(raw) && s.scope.Allows(raw)
}
func (s *session) codesAllowed(raw string) bool {
	return oneTimeCodesAllowed() && s.authAllows(raw, false)
}
func (s *session) captchaAllowed() bool { return s.authAllows(s.currentHref(), true) }
func captchaURL(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if isLoopback(host) {
		return strings.Contains(strings.ToLower(u.Path), "captcha")
	}
	for _, domain := range []string{"hcaptcha.com", "recaptcha.net", "google.com", "challenges.cloudflare.com", "arkoselabs.com", "funcaptcha.com", "geetest.com"} {
		if (host == domain || strings.HasSuffix(host, "."+domain)) && (domain != "google.com" || strings.HasPrefix(u.Path, "/recaptcha/")) {
			return u.Scheme == "https"
		}
	}
	return false
}
func (s *session) captchaFrame(f frameInfo) bool {
	if !captchaURL(f.url) {
		return false
	}
	if u, e := url.Parse(f.url); e == nil && isLoopback(u.Hostname()) && !s.scope.Allows(f.url) {
		return false
	}
	return s.captchaAllowed()
}
func (s *session) readableFrame(f frameInfo) bool {
	if captchaURL(f.url) {
		return s.captchaFrame(f)
	}
	return s.scope.Allows(f.url)
}
func (s *session) checkAuthRef(ref string) error {
	id, e := s.refFrame(ref)
	if e != nil {
		return e
	}
	if id == "" {
		return nil
	}
	f, ok := s.frameByID(id)
	if !ok || !s.readableFrame(f) {
		return errors.New("BROWSER_AUTH_REQUIRED: this frame is no longer approved. Complete authentication in the task browser yourself and take a new snapshot.")
	}
	return nil
}

// Images contain only visible authorized verification frames, never a whole
// login page. The provider creates and retains its own response token.
func (s *session) captchaImages(ctx context.Context) []map[string]any {
	images := []map[string]any{}
	if !s.captchaAllowed() {
		return images
	}
	for prefix, id := range s.snapFrames {
		f, ok := s.frameByID(id)
		if !ok || !s.captchaFrame(f) || !s.frameVisible(ctx, f) {
			continue
		}
		var owner struct {
			ID int `json:"backendNodeId"`
		}
		if s.conn.Call(ctx, "DOM.getFrameOwner", map[string]any{"frameId": id}, &owner) != nil {
			continue
		}
		var box struct {
			Model struct {
				Content       []float64
				Width, Height float64
			}
		}
		if s.conn.Call(ctx, "DOM.getBoxModel", map[string]any{"backendNodeId": owner.ID}, &box) != nil || len(box.Model.Content) < 8 {
			continue
		}
		x, y := box.Model.Content[0], box.Model.Content[1]
		width, height := box.Model.Content[2]-x, box.Model.Content[7]-y
		if width <= 0 || height <= 0 || width > 1600 || height > 1600 {
			continue
		}
		var metrics struct {
			CSSVisualViewport struct{ PageX, PageY float64 }
		}
		if s.conn.Call(ctx, "Page.getLayoutMetrics", nil, &metrics) != nil {
			continue
		}
		x, y = x+metrics.CSSVisualViewport.PageX, y+metrics.CSSVisualViewport.PageY
		var shot struct{ Data string }
		if s.conn.Call(ctx, "Page.captureScreenshot", map[string]any{"format": "png", "captureBeyondViewport": true, "clip": map[string]any{"x": x, "y": y, "width": width, "height": height, "scale": 1}}, &shot) == nil && shot.Data != "" {
			images = append(images, map[string]any{"frame": prefix, "mimeType": "image/png", "data": shot.Data})
		}
		if len(images) == 2 {
			break
		}
	}
	return images
}
