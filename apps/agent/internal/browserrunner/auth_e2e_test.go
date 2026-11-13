package browserrunner

import (
	"fmt"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestE2EAuthApprovalAndImmediateRevocation(t *testing.T) {
	h, _, _, _ := newHarness(t)
	base, _ := codeSite(t)
	h.call("browser_runner_start", map[string]any{"task_id": "auth-gate", "allowed_origins": []any{base}, "start_url": base + "/login/code"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "auth-gate"})
	code := ref(t, snap, "textbox", "one-time code")
	args := map[string]any{"session_id": "auth-gate", "snapshot_id": snap["snapshot_id"], "ref": code, "action": "fill", "value": "671205"}
	h.fail("browser_runner_act", args, "BROWSER_AUTH_REQUIRED")
	h.policy.BrowserAuth = protocol.BrowserAuth{OTP: true, Origins: []string{"https://other.example"}}
	h.fail("browser_runner_act", args, "BROWSER_AUTH_REQUIRED")
	h.policy.BrowserAuth = protocol.BrowserAuth{OTP: true, Origins: []string{base}, Mailbox: "jenny@example.test"}
	h.call("browser_runner_act", args)
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "auth-gate"})
	if auth := snap["authentication"].(map[string]any); auth["otp"] != true || auth["mailbox"] != "jenny@example.test" {
		t.Fatal(auth)
	}
	h.policy.BrowserAuth = protocol.BrowserAuth{}
	args["snapshot_id"] = snap["snapshot_id"]
	h.fail("browser_runner_act", args, "BROWSER_AUTH_REQUIRED")
	b, _ := os.ReadFile(checkpointPath("auth-gate"))
	if strings.Contains(string(b), "671205") {
		t.Fatal("OTP persisted")
	}
}
func TestE2EApprovedCaptchaControlsAndImages(t *testing.T) {
	h, _, _, _ := newHarness(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/captcha/challenge" {
			fmt.Fprint(w, `<html><body><h1>Choose the matching option</h1><button id="choice" onclick="document.querySelector('h1').textContent='Verification completed'">Matching option</button><textarea name="h-captcha-response" hidden>PRIVATE-CAPTCHA-TOKEN</textarea></body></html>`)
		} else {
			fmt.Fprint(w, `<html><body><h1>Register account</h1><iframe src="/captcha/challenge" style="width:400px;height:400px"></iframe></body></html>`)
		}
	}))
	defer srv.Close()
	h.call("browser_runner_start", map[string]any{"task_id": "captcha-approval", "allowed_origins": []any{srv.URL}, "start_url": srv.URL})
	before := h.call("browser_runner_snapshot", map[string]any{"session_id": "captcha-approval", "include_captcha_images": true})
	if len(before["captcha_images"].([]any)) != 0 {
		t.Fatal("unapproved image")
	}
	if len(captchaKinds(before, "blockers")) == 0 {
		t.Fatal("unapproved CAPTCHA did not block")
	}
	h.policy.BrowserAuth = protocol.BrowserAuth{Captcha: true, Origins: []string{srv.URL}}
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "captcha-approval", "include_captcha_images": true})
	if snap["authentication"].(map[string]any)["captcha"] != true || len(captchaKinds(snap, "blockers")) != 0 {
		t.Fatalf("approved: %v", snap)
	}
	choice := ref(t, snap, "button", "matching option")
	if !strings.HasPrefix(choice, "f") {
		t.Fatal("challenge ref missing")
	}
	if len(snap["captcha_images"].([]any)) != 1 {
		t.Fatal("no cropped challenge image")
	}
	h.policy.BrowserAuth = protocol.BrowserAuth{}
	h.fail("browser_runner_act", map[string]any{"session_id": "captcha-approval", "snapshot_id": snap["snapshot_id"], "ref": choice, "action": "click"}, "not approved")
	h.policy.BrowserAuth = protocol.BrowserAuth{Captcha: true, Origins: []string{srv.URL}}
	h.call("browser_runner_act", map[string]any{"session_id": "captcha-approval", "snapshot_id": snap["snapshot_id"], "ref": choice, "action": "click"})
	after := h.call("browser_runner_snapshot", map[string]any{"session_id": "captcha-approval"})
	if !strings.Contains(fmt.Sprint(after["text"]), "Verification completed") {
		t.Fatal(after)
	}
	for _, value := range []any{snap, after, h.call("browser_runner_status", map[string]any{"session_id": "captcha-approval"})} {
		if strings.Contains(fmt.Sprint(value), "PRIVATE-CAPTCHA-TOKEN") {
			t.Fatal("response token leaked")
		}
	}
}
