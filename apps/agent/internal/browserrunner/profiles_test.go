package browserrunner

import (
	"fmt"
	"os"
	"testing"
	"time"
)

// A new conversation finds the profile that holds a person's sign-ins from
// the checkpoints of earlier tasks.
func TestProfilesAreListedFromEarlierTasks(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	save := func(id, profile string, headless bool, origins []string, at time.Time) {
		c := &Checkpoint{Version: checkpointVersion, SessionID: id, Profile: profile, Headless: headless, AllowedOrigins: origins, State: StateClosed,
			Receipts: []Receipt{}, Uploads: []Upload{}, Effects: []Effect{}, Blocked: []Blocked{}, CreatedAt: stamp(at)}
		if e := c.save(at); e != nil {
			t.Fatal(e)
		}
		if e := os.MkdirAll(profilePath(profile), 0700); e != nil {
			t.Fatal(e)
		}
	}
	t0 := time.Date(2026, 10, 23, 1, 0, 0, 0, time.UTC)
	save("jenny-linfox-apply", "jenny", true, []string{"https://careers.pageuppeople.com"}, t0)
	save("jenny-linfox-login", "jenny", false, []string{"https://nzlinfox-identity.login.pageuppeople.com", "https://careers.pageuppeople.com"}, t0.Add(time.Hour))
	save("sam-clearpoint", "sam-clearpoint", true, []string{"https://jobs.lever.co"}, t0.Add(30*time.Minute))
	save("gone", "gone", true, []string{"https://example.com"}, t0)
	_ = os.RemoveAll(profilePath("gone")) // forgotten: its profile was deleted

	got := profileInfos()
	if len(got) != 2 || got[0].Profile != "jenny" || got[1].Profile != "sam-clearpoint" {
		t.Fatalf("profiles: %+v", got)
	}
	j := got[0]
	if fmt.Sprint(j.Tasks) != "[jenny-linfox-apply jenny-linfox-login]" || fmt.Sprint(j.Sites) != "[https://careers.pageuppeople.com https://nzlinfox-identity.login.pageuppeople.com]" {
		t.Fatalf("jenny: %+v", j)
	}
	if j.Headless || !got[1].Headless {
		t.Fatalf("profiles report how their last task ran: %+v", got)
	}
}

// Leaving headless out on resume keeps the mode the task runs in, instead of
// closing a visible window the user signed in through.
func TestE2EResumeKeepsTheBrowserMode(t *testing.T) {
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "keep", "profile": "jenny", "allowed_origins": []any{base}, "start_url": base + "/"})
	out := h.call("browser_runner_start", map[string]any{"task_id": "keep", "allowed_origins": []any{base}})
	if out["resumed"] != true || out["profile"] != "jenny" || out["headless"] != true {
		t.Fatalf("resume: %v", out)
	}
	list := h.call("browser_runner_status", map[string]any{})
	if fmt.Sprint(list["profiles"]) == "[]" || list["note"] == nil {
		t.Fatalf("status lists no profiles: %v", list)
	}
}
