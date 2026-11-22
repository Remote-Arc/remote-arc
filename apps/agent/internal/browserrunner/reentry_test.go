package browserrunner

import (
	"fmt"
	"testing"
	"time"
)

// Lever relabels the CV field after an upload ("Resume/CV ✱ FILE.PDF
// Analyzing resume..."), so a reopened page shows a shorter label. Recorded
// on a real application in #276.
const leverCV = "Resume/CV ✱ SAM_YAO_CV_HYBRID.PDF Analyzing resume..."

func leverCheckpoint() *Checkpoint {
	page := "https://jobs.lever.co/acme/123/apply"
	return &Checkpoint{
		Receipts: []Receipt{
			{At: "2026-10-22T10:35:35.000Z", Tool: "browser_runner_start", URL: "https://jobs.lever.co/acme/123", Outcome: "started"},
			{At: "2026-10-22T10:36:08.000Z", Tool: "browser_runner_act", Action: "click", Label: "APPLY FOR THIS JOB", URL: page, Outcome: "ok"},
			{At: "2026-10-22T10:37:36.000Z", Tool: "browser_runner_act", Action: "fill", Label: "Full name ✱", URL: page, Outcome: "ok"},
			{At: "2026-10-22T10:37:38.000Z", Tool: "browser_runner_act", Action: "fill", Label: "Email ✱", URL: page, Outcome: "ok"},
			{At: "2026-10-22T10:37:40.000Z", Tool: "browser_runner_act", Action: "fill", Label: "Phone ✱", URL: page, Outcome: "error"},
			{At: "2026-10-22T10:39:44.000Z", Tool: "browser_runner_act", Action: "upload", Label: "e4", URL: page, Outcome: "ok"},
			{At: "2026-10-22T10:40:00.000Z", Tool: "browser_runner_act", Action: "fill", Label: "Full name ✱", URL: page, Outcome: "ok"},
		},
		Uploads: []Upload{
			{Field: "Resume", File: "old.pdf", Status: "attached", At: "2026-10-22T10:30:00.000Z"}, // before arriving on this page
			{Field: leverCV, File: "Sam_Yao_CV_Hybrid.pdf", Status: "attached", At: "2026-10-22T10:39:43.900Z"},
		},
	}
}

// Each field is listed once, in the order it was last entered (Full name was
// filled again after Email), and failed actions and other pages are left out.
func TestLostInputListsOnlyThisPageOnceInOrder(t *testing.T) {
	r := leverCheckpoint().lostInput("https://jobs.lever.co/acme/123/apply", time.Now())
	if r == nil {
		t.Fatal("no re-entry recorded")
	}
	got := fmt.Sprint(r.Fields)
	want := fmt.Sprint([]ReentryField{
		{Label: "Email ✱", Action: "fill"},
		{Label: "Full name ✱", Action: "fill"},
		{Label: leverCV, Action: "upload", File: "Sam_Yao_CV_Hybrid.pdf"},
	})
	if got != want {
		t.Fatalf("fields\n got %s\nwant %s", got, want)
	}
	if leverCheckpoint().lostInput("https://jobs.lever.co/acme/other", time.Now()) != nil {
		t.Fatal("input from another page reported")
	}
}

func reentrySession(href string) *session {
	cp := leverCheckpoint()
	cp.Reentry = cp.lostInput("https://jobs.lever.co/acme/123/apply", time.Now())
	return &session{cp: cp, href: href}
}

func elements(els ...map[string]any) map[string]any {
	list := make([]any, len(els))
	for i, e := range els {
		list[i] = e
	}
	return map[string]any{"elements": list}
}

func TestReentryMatchesARelabelledUploadAndNeverAssumesUnseenFields(t *testing.T) {
	s := reentrySession("https://jobs.lever.co/acme/123/apply?lever-source=x")
	// Fresh page after the restart: shorter CV label, empty fields, and the
	// email field rendered under a label the task never saw.
	page := elements(
		map[string]any{"role": "file", "name": "Resume/CV ✱", "files": float64(0)},
		map[string]any{"role": "textbox", "name": "Full name ✱", "value": "Sam Example"},
		map[string]any{"role": "textbox", "name": "Email address ✱", "value": ""},
	)
	r := s.reentryStatus(page)
	if r == nil {
		t.Fatal("re-entry cleared while the CV is missing")
	}
	if got := fmt.Sprint(r["fields"]); got != "[Resume/CV ✱ SAM_YAO_CV_HYBRID.PDF Analyzing resume... (Sam_Yao_CV_Hybrid.pdf)]" {
		t.Fatalf("fields to enter again: %s", got)
	}
	if got := fmt.Sprint(r["unverified"]); got != "[Email ✱]" {
		t.Fatalf("unverified fields: %s", got)
	}

	// The CV is attached again; the unmatched email keeps the note alive.
	page = elements(
		map[string]any{"role": "file", "name": "Resume/CV ✱", "files": float64(1)},
		map[string]any{"role": "textbox", "name": "Full name ✱", "value": "Sam Example"},
	)
	if r := s.reentryStatus(page); r == nil || r["fields"] != nil || fmt.Sprint(r["unverified"]) != "[Email ✱]" {
		t.Fatalf("after re-upload: %v", r)
	}

	// Everything found and filled: the note clears.
	page = elements(
		map[string]any{"role": "file", "name": "Resume/CV ✱", "files": float64(1)},
		map[string]any{"role": "textbox", "name": "Full name ✱", "value": "Sam Example"},
		map[string]any{"role": "textbox", "name": "Email ✱", "value": "sam@example.test"},
	)
	if r := s.reentryStatus(page); r != nil || s.cp.Reentry != nil {
		t.Fatalf("note kept after everything was entered again: %v", r)
	}
}

func TestReentryClearsWhenTheTaskLeavesThePage(t *testing.T) {
	s := reentrySession("https://jobs.lever.co/acme/123/thanks")
	if r := s.reentryStatus(elements()); r != nil || s.cp.Reentry != nil {
		t.Fatalf("note kept on another page: %v", r)
	}
}

func TestSameFieldOnlyLetsUploadsMatchByPrefix(t *testing.T) {
	file := map[string]any{"role": "file", "name": "Resume/CV ✱"}
	text := map[string]any{"role": "textbox", "name": "Resume/CV ✱"}
	if !sameField(file, ReentryField{Label: leverCV, Action: "upload"}) {
		t.Fatal("relabelled upload not matched")
	}
	if sameField(text, ReentryField{Label: leverCV, Action: "fill"}) {
		t.Fatal("a text field matched by prefix")
	}
	if sameField(map[string]any{"role": "file", "name": ""}, ReentryField{Label: leverCV, Action: "upload"}) {
		t.Fatal("an unlabelled file input matched everything")
	}
}
