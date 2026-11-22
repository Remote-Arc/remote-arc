package browserrunner

import (
	"strings"
	"testing"
)

func TestAuthResumeURLPreservesOrdinaryQueryEncoding(t *testing.T) {
	raw := "https://site.example/apply?z=a%20b&signature=Ab%2fCd&a=1#step-2"
	if authResumeURL(raw) != raw {
		t.Fatal("changed a non-authentication URL")
	}
}
func TestAuthResumeURLRemovesCodes(t *testing.T) {
	raw := "https://site.example/login?otp=482913&job=123&h-captcha-response=secret#code=ignored"
	clean := authResumeURL(raw)
	for _, secret := range []string{"482913", "secret", "ignored"} {
		if strings.Contains(clean, secret) {
			t.Fatal(clean)
		}
	}
	if !strings.Contains(clean, "job=123") {
		t.Fatal("lost ordinary task context", clean)
	}
}
