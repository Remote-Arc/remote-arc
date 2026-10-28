package browserrunner

import (
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"testing"
)

func TestAuthOriginsAndCaptchaProviders(t *testing.T) {
	sc, _ := newScope([]string{"https://www.seek.co.nz"})
	s := &session{scope: sc, href: "https://www.seek.co.nz/login", auth: protocol.BrowserAuth{OTP: true, Captcha: true, Origins: []string{"https://www.seek.co.nz"}}}
	if !s.authAllows(s.href, false) || s.authAllows("https://evil.example", false) {
		t.Fatal("OTP origin scope")
	}
	for raw, want := range map[string]bool{"https://newassets.hcaptcha.com/captcha": true, "https://www.google.com/recaptcha/api2/bframe": true, "https://www.google.com/mail": false, "https://evil.example/captcha": false, "https://hcaptcha.com.evil.example/captcha": false, "http://hcaptcha.com/captcha": false} {
		if got := s.captchaFrame(frameInfo{url: raw}); got != want {
			t.Errorf("%s: %v", raw, got)
		}
	}
	s.href = "https://evil.example"
	if s.captchaFrame(frameInfo{url: "https://hcaptcha.com/captcha"}) {
		t.Fatal("unapproved top-level site")
	}
}
