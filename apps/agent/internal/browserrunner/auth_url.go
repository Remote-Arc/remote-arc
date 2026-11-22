package browserrunner

import (
	"net/url"
	"regexp"
)

var authURLKey = regexp.MustCompile(`(?i)^(code|otp|passcode|verification[-_]?code|one[-_]?time[-_]?code|g-recaptcha-response|h-captcha-response|cf-turnstile-response|captcha[-_]?(response|token|solution))$`)

// Preserve resumable task context while excluding authentication codes that
// a GET form or identity provider may place in a URL.
func authResumeURL(raw string) string {
	u, e := url.Parse(raw)
	if e != nil {
		return safeURL(raw)
	}
	q := u.Query()
	changed := false
	for key := range q {
		if authURLKey.MatchString(key) {
			q.Del(key)
			changed = true
		}
	}
	if changed {
		u.RawQuery = q.Encode()
	}
	fragment, _ := url.ParseQuery(u.Fragment)
	for key := range fragment {
		if authURLKey.MatchString(key) {
			u.Fragment = ""
			u.RawFragment = ""
			break
		}
	}
	return u.String()
}
