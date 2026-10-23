package browserrunner

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

const checkpointVersion = 1

// Effect statuses. Only "confirmed" and "not_dispatched" are known outcomes.
const (
	EffectInFlight      = "in_flight"      // durably recorded before the click is sent
	EffectNotDispatched = "not_dispatched" // failed before any input reached the page
	EffectUnverified    = "unverified"     // input reached the page; external result not yet proven
	EffectUnknown       = "unknown"        // the Agent or browser stopped mid-action
	EffectConfirmed     = "confirmed"      // evidence of the result was read from the page
)

// Session states.
const (
	StateActive    = "active"
	StatePaused    = "paused"     // browser closed (idle, disconnect, restart); resumable
	StateNeedsUser = "needs_user" // sign-in, verification code, CAPTCHA or scope consent
	StateClosed    = "closed"
)

type Effect struct {
	Key    string `json:"idempotency_key"`
	Action string `json:"action"`
	Label  string `json:"label"`
	Target string `json:"target,omitempty"` // fingerprint of the form/control the submit acted on
	// Kind is "step" for one page of a longer form (Next, Continue, Save),
	// which may be saved again; otherwise the submit is final and sent once.
	Kind   string `json:"kind,omitempty"`
	Status string `json:"status"`
	// SettledBy is "runner" when the Runner settled the effect itself: the
	// next step of the form opened.
	SettledBy string `json:"settled_by,omitempty"`
	// NothingSent: right after the click, no request had left the page and
	// it had not navigated (client-side validation, or a step such as a
	// CAPTCHA challenge that may still send it). The same key may be clicked
	// again only while that stays true.
	NothingSent bool   `json:"nothing_sent,omitempty"`
	URLBefore   string `json:"url_before"`
	URLAfter    string `json:"url_after,omitempty"`
	Evidence    string `json:"evidence,omitempty"`
	StartedAt   string `json:"started_at"`
	UpdatedAt   string `json:"updated_at"`
}

type Receipt struct {
	Seq     int    `json:"seq"`
	At      string `json:"at"`
	Tool    string `json:"tool"`
	Action  string `json:"action,omitempty"`
	Label   string `json:"label,omitempty"`
	URL     string `json:"url,omitempty"`
	Outcome string `json:"outcome"`
	Detail  string `json:"detail,omitempty"`
}

type Upload struct {
	Field  string `json:"field"`
	File   string `json:"file"` // base name only
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
	Status string `json:"status"` // attached | not_attached
	At     string `json:"at"`
}

type Blocked struct {
	At     string `json:"at"`
	Origin string `json:"origin"`
	Reason string `json:"reason"`
}

// Reentry records input that a browser restart wiped: the page was reopened,
// so values the task entered before are gone even though their receipts
// remain. Labels only; the values themselves are never stored.
type Reentry struct {
	URL    string         `json:"url"` // query/fragment removed
	At     string         `json:"at"`
	Fields []ReentryField `json:"fields"`
}

type ReentryField struct {
	Label  string `json:"label"`
	Action string `json:"action"`         // fill, select, check, uncheck or upload
	File   string `json:"file,omitempty"` // base name, for uploads
}

type Checkpoint struct {
	Version        int       `json:"version"`
	SessionID      string    `json:"session_id"`
	Profile        string    `json:"profile"`
	AllowedOrigins []string  `json:"allowed_origins"`
	Headless       bool      `json:"headless"`
	Browser        string    `json:"browser,omitempty"`  // "your_chrome" for the user's own Chrome; empty for a Runner window
	YourTab        string    `json:"your_tab,omitempty"` // the task's tab in the user's Chrome (device-local)
	State          string    `json:"state"`
	NeedsUser      string    `json:"needs_user,omitempty"`
	ResumeURL      string    `json:"resume_url,omitempty"` // device-local only, never returned
	LastURL        string    `json:"last_url,omitempty"`   // query/fragment removed
	Title          string    `json:"title,omitempty"`
	Navigations    int       `json:"navigations"`
	NextSeq        int       `json:"next_seq"`
	Receipts       []Receipt `json:"receipts"`
	Uploads        []Upload  `json:"uploads"`
	Effects        []Effect  `json:"effects"`
	Blocked        []Blocked `json:"blocked_navigations"`
	Reentry        *Reentry  `json:"reentry_needed,omitempty"`
	CreatedAt      string    `json:"created_at"`
	UpdatedAt      string    `json:"updated_at"`
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var keyPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,120}$`)

func runnerDir() string { return filepath.Join(config.Dir(), "browser-runner") }
func checkpointPath(id string) string {
	return filepath.Join(runnerDir(), "sessions", id+".json")
}
func profilePath(profile string) string { return filepath.Join(runnerDir(), "profiles", profile) }

// oneTimeCodesAllowed is the computer's choice whether Browser Runner may
// enter one-time codes the caller found (for example in the user's email).
// On unless config.json sets "browserRunnerOneTimeCodes": false. Passwords
// and payment details are never typed from the conversation.
func oneTimeCodesAllowed() bool {
	c, e := config.Load()
	if e != nil {
		return true
	}
	var on bool
	if raw, ok := c.Extra["browserRunnerOneTimeCodes"]; ok && json.Unmarshal(raw, &on) == nil {
		return on
	}
	return true
}

// ProfileInfo describes a browser profile from the checkpoints of the tasks
// that used it. A profile keeps its sign-ins and cookies, so a later task
// that passes the same profile starts signed in. Nothing is read from the
// profile itself.
type ProfileInfo struct {
	Profile  string   `json:"profile"`
	Tasks    []string `json:"tasks"`
	Sites    []string `json:"sites"`
	Headless bool     `json:"headless"` // how its most recent task ran
	LastUsed string   `json:"last_used"`
}

// profileInfos lists profiles that still exist on this computer, most
// recently used first.
func profileInfos() []ProfileInfo {
	entries, _ := os.ReadDir(filepath.Join(runnerDir(), "sessions"))
	byName := map[string]*ProfileInfo{}
	sites := map[string]map[string]bool{}
	for _, en := range entries {
		id, ok := strings.CutSuffix(en.Name(), ".json")
		if !ok || !idPattern.MatchString(id) {
			continue
		}
		c, e := loadCheckpoint(id)
		if e != nil || c.Profile == "" || c.Browser == browserYourChrome {
			continue
		}
		if _, e := os.Stat(profilePath(c.Profile)); e != nil {
			continue
		}
		p := byName[c.Profile]
		if p == nil {
			p = &ProfileInfo{Profile: c.Profile}
			byName[c.Profile] = p
			sites[c.Profile] = map[string]bool{}
		}
		p.Tasks = append(p.Tasks, c.SessionID)
		for _, o := range c.AllowedOrigins {
			sites[c.Profile][o] = true
		}
		if c.UpdatedAt >= p.LastUsed {
			p.LastUsed, p.Headless = c.UpdatedAt, c.Headless
		}
	}
	out := make([]ProfileInfo, 0, len(byName))
	for name, p := range byName {
		for s := range sites[name] {
			p.Sites = append(p.Sites, s)
		}
		sort.Strings(p.Sites)
		sort.Strings(p.Tasks)
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastUsed > out[j].LastUsed })
	return out
}

func loadCheckpoint(id string) (*Checkpoint, error) {
	b, e := os.ReadFile(checkpointPath(id))
	if e != nil {
		return nil, e
	}
	var c Checkpoint
	if e := json.Unmarshal(b, &c); e != nil {
		return nil, errors.New("browser_runner checkpoint is unreadable; close the session with forget=true to reset it.")
	}
	if c.Version != checkpointVersion || c.SessionID != id {
		return nil, errors.New("browser_runner checkpoint has an unsupported format.")
	}
	return &c, nil
}

// save is durable: a crash must never lose an in-flight submit marker.
func (c *Checkpoint) save(now time.Time) error {
	c.UpdatedAt = stamp(now)
	if len(c.Receipts) > 100 {
		c.Receipts = append([]Receipt(nil), c.Receipts[len(c.Receipts)-100:]...)
	}
	if len(c.Blocked) > 20 {
		c.Blocked = append([]Blocked(nil), c.Blocked[len(c.Blocked)-20:]...)
	}
	if len(c.Uploads) > 50 {
		c.Uploads = append([]Upload(nil), c.Uploads[len(c.Uploads)-50:]...)
	}
	b, e := json.MarshalIndent(c, "", "  ")
	if e != nil {
		return e
	}
	return config.DurableWrite(checkpointPath(c.SessionID), b, 0600)
}

func (c *Checkpoint) receipt(now time.Time, r Receipt) {
	c.NextSeq++
	r.Seq = c.NextSeq
	r.At = stamp(now)
	c.Receipts = append(c.Receipts, r)
}

// sentTo returns an earlier submit under another key that may have reached
// the same target. Effects recorded without a target count as a match, so
// checkpoints from older builds fail closed.
func (c *Checkpoint) sentTo(target, key string) *Effect {
	for i := range c.Effects {
		e := &c.Effects[i]
		if e.Key != key && e.Status != EffectNotDispatched && (e.Target == "" || e.Target == target) {
			return e
		}
	}
	return nil
}

func (c *Checkpoint) effect(key string) *Effect {
	for i := range c.Effects {
		if c.Effects[i].Key == key {
			return &c.Effects[i]
		}
	}
	return nil
}

// maxStepSends bounds how often one page of a form is sent in a task: enough
// to fix errors or resume a saved draft, never a loop.
const maxStepSends = 3

// stepSends counts how often a form step with this target was sent.
func (c *Checkpoint) stepSends(target string) int {
	n := 0
	for _, e := range c.Effects {
		if e.Kind == "step" && e.Target == target && e.Status != EffectNotDispatched {
			n++
		}
	}
	return n
}

// unresolved returns a final submit whose external result is not proven.
// A form step does not hold up what follows: sending it again only saves
// the same page again.
func (c *Checkpoint) unresolved() *Effect {
	for i := range c.Effects {
		if c.Effects[i].Kind == "step" {
			continue
		}
		switch c.Effects[i].Status {
		case EffectInFlight, EffectUnverified, EffectUnknown:
			return &c.Effects[i]
		}
	}
	return nil
}

// lostInput lists what the task entered on page (a safeURL) since it last
// arrived there. Called when a restarted browser reopens that page, which
// clears live form state.
func (c *Checkpoint) lostInput(page string, now time.Time) *Reentry {
	if page == "" {
		return nil
	}
	var fields []ReentryField
	seen := map[string]bool{}
	since := "" // the last receipt from an earlier page; input on this page came after it
	for i := len(c.Receipts) - 1; i >= 0; i-- {
		r := c.Receipts[i]
		if r.URL != "" && r.URL != page {
			since = r.At
			break
		}
		if r.Tool != "browser_runner_act" || r.Outcome != "ok" {
			continue
		}
		switch r.Action {
		case "fill", "select", "check", "uncheck":
			if r.Label != "" && !seen[r.Action+"\x00"+r.Label] {
				seen[r.Action+"\x00"+r.Label] = true
				fields = append(fields, ReentryField{Label: r.Label, Action: r.Action})
			}
		}
	}
	// Receipts were walked newest first; report in the order each field was
	// last entered.
	for i, j := 0, len(fields)-1; i < j; i, j = i+1, j-1 {
		fields[i], fields[j] = fields[j], fields[i]
	}
	// Upload receipts name the ref; the upload record keeps the field label.
	for _, u := range c.Uploads {
		if u.Status == "attached" && u.At > since && !seen["upload\x00"+u.Field] {
			seen["upload\x00"+u.Field] = true
			fields = append(fields, ReentryField{Label: u.Field, Action: "upload", File: u.File})
		}
	}
	if len(fields) == 0 {
		return nil
	}
	if len(fields) > 30 {
		fields = fields[:30]
	}
	return &Reentry{URL: page, At: stamp(now), Fields: fields}
}

// recover marks writes interrupted by a crash or browser loss as unknown.
func (c *Checkpoint) recover(now time.Time) bool {
	changed := false
	for i := range c.Effects {
		if c.Effects[i].Status == EffectInFlight {
			c.Effects[i].Status = EffectUnknown
			c.Effects[i].UpdatedAt = stamp(now)
			changed = true
		}
	}
	return changed
}

func stamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Summary is what browser_runner_status returns: everything a later turn (or
// another agent) needs to continue, and nothing that is device-local only.
func (c *Checkpoint) Summary(live bool) map[string]any {
	receipts := c.Receipts
	if len(receipts) > 25 {
		receipts = receipts[len(receipts)-25:]
	}
	out := map[string]any{
		"session_id":          c.SessionID,
		"profile":             c.Profile,
		"state":               c.State,
		"browser_running":     live,
		"allowed_origins":     c.AllowedOrigins,
		"headless":            c.Headless,
		"browser":             map[bool]string{true: browserYourChrome, false: browserRunner}[c.Browser == browserYourChrome],
		"last_url":            c.LastURL,
		"title":               c.Title,
		"navigations":         c.Navigations,
		"recent_receipts":     receipts,
		"uploads":             c.Uploads,
		"submit_effects":      c.Effects,
		"blocked_navigations": c.Blocked,
		"updated_at":          c.UpdatedAt,
	}
	if c.NeedsUser != "" {
		out["needs_user"] = c.NeedsUser
	}
	if c.Reentry != nil {
		out["reentry_needed"] = c.Reentry
	}
	out["next_action"] = c.nextAction()
	return out
}

func (c *Checkpoint) nextAction() string {
	if e := c.unresolved(); e != nil {
		return "Verify submit " + e.Key + " (" + e.Label + ") before any new submit: take browser_runner_snapshot, and if the page proves the result call browser_runner_confirm with confirmed and the exact evidence text. Do not submit again."
	}
	switch c.State {
	case StateNeedsUser:
		return "Wait for the user: " + c.NeedsUser + " Then take a new browser_runner_snapshot."
	case StatePaused:
		return "Call browser_runner_start with the same task_id to reopen the browser at the last page, then take a new browser_runner_snapshot."
	case StateClosed:
		return "Session is closed."
	}
	if c.Reentry != nil {
		return "The task browser was restarted and reopened " + c.Reentry.URL + ", which cleared what was entered there. Take browser_runner_snapshot; reentry_needed lists the fields to fill or upload again. Earlier receipts are history, not the current page."
	}
	return "Take browser_runner_snapshot and continue from the current page."
}
