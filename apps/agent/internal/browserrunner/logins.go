package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/vault"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// loginBinding is how the Runner's isolated world reports a sign-in form
// being sent (see watch_logins in page.js). Pages cannot reach it.
const loginBinding = "__remotearcLogin"

type identifier struct {
	username string
	at       time.Time
}

// saveLoginsAllowed is the computer's choice whether a sign-in the user
// completes in the Runner window is saved to the vault. On unless
// config.json sets "browserRunnerSaveLogins": false.
func saveLoginsAllowed() bool {
	c, e := config.Load()
	if e != nil {
		return true
	}
	var on bool
	if raw, ok := c.Extra["browserRunnerSaveLogins"]; ok && json.Unmarshal(raw, &on) == nil {
		return on
	}
	return true
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9_.@-]+`)

// loginName names a saved sign-in after the profile and the site, for
// example jenny-nzlinfox-identity.login.pageuppeople.com.
func loginName(profile, host string) string {
	n := strings.Trim(unsafeName.ReplaceAllString(profile+"-"+host, "-"), "-.")
	if len(n) > 100 {
		n = n[:100]
	}
	return n
}

// loginSent saves a sign-in sent from the Runner window: the password page,
// with the username from the same form or from the identifier page just
// before it. Passwords are never typed into a page by the caller, so a
// password here was entered by the user (or filled from the vault, in which
// case it is already saved).
func (s *session) loginSent(payload string) {
	var p struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if json.Unmarshal([]byte(payload), &p) != nil {
		return
	}
	u, e := url.Parse(p.URL)
	if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return
	}
	now := time.Now()
	s.ev.Lock()
	if p.Password == "" {
		if p.Username != "" {
			s.identifiers = map[string]identifier{"last": {username: p.Username, at: now}}
		}
		s.ev.Unlock()
		return
	}
	username := p.Username
	if prev, ok := s.identifiers["last"]; ok && username == "" && now.Sub(prev.at) < 10*time.Minute {
		username = prev.username
	}
	s.ev.Unlock()
	if !saveLoginsAllowed() {
		return
	}
	for _, en := range vault.Match(p.URL) {
		if _, pw, e := vault.Reveal(en.Name, p.URL); e == nil && pw == p.Password {
			return
		}
	}
	name := loginName(s.cp.Profile, u.Hostname())
	if vault.Put(name, []string{u.Scheme + "://" + u.Host}, username, p.Password, "runner", now) == nil {
		s.ev.Lock()
		s.savedLogin = name
		s.ev.Unlock()
	}
}

// applySavedLogins turns a sign-in page into something the caller can do:
// when a saved sign-in matches the site, the password field is no longer a
// stop for the user, and the snapshot says which sign-in to fill.
func (s *session) applySavedLogins(page map[string]any) {
	href := s.currentHref()
	matches := vault.Match(href)
	if len(matches) == 0 {
		return
	}
	signIn := regexp.MustCompile(`(?i)(login|signin|sign-in|identity|auth|sso|account)`).MatchString(href)
	if els, ok := page["elements"].([]any); ok {
		for _, raw := range els {
			if el, ok := raw.(map[string]any); ok && el["secret"] == "password" {
				signIn = true
			}
		}
	}
	blockers, _ := page["blockers"].([]any)
	kept := []any{}
	for _, b := range blockers {
		if m, ok := b.(map[string]any); ok && m["kind"] == "login" {
			signIn = true
			continue
		}
		kept = append(kept, b)
	}
	if !signIn {
		return
	}
	page["blockers"] = kept
	logins := []map[string]any{}
	for _, m := range matches {
		logins = append(logins, map[string]any{"secret": m.Name, "username": vault.Mask(m.Username)})
	}
	attention, _ := page["attention"].([]any)
	page["attention"] = append(attention, map[string]any{
		"kind":   "saved_login",
		"logins": logins,
		"detail": "A sign-in saved on this computer matches this site. Fill the username field with action=fill_secret, secret=<name>, part=username, and the password field (secret: password) with part=password. The Agent fills them; the password is never shown.",
	})
}

// fillSecret fills a username or password from the vault into a field of
// the latest snapshot. The vault refuses any page the sign-in is not bound
// to, a password goes only into a password field, and neither value is ever
// returned or recorded.
func (m *Manager) fillSecret(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	snap := protocol.OptionalString(args, "snapshot_id")
	if e := s.checkSnapshot(snap); e != nil {
		return nil, e
	}
	name, part, ref := protocol.OptionalString(args, "secret"), protocol.OptionalString(args, "part"), protocol.OptionalString(args, "ref")
	if !vault.ValidName(name) {
		return nil, errors.New("secret must name a saved sign-in; browser_runner_status without session_id lists them under saved_logins.")
	}
	if part != "username" && part != "password" {
		return nil, errors.New("part must be username or password.")
	}
	if !refPattern.MatchString(ref) {
		return nil, errors.New("ref must be a ref from the snapshot, such as e12.")
	}
	frameID, e := s.refFrame(ref)
	if e != nil {
		return nil, e
	}
	pageURL := s.currentHref()
	if frameID != "" {
		if f, ok := s.frameByID(frameID); ok {
			pageURL = f.url
		}
	}
	username, password, e := vault.Reveal(name, pageURL)
	if e != nil {
		return nil, e
	}
	value := password
	if part == "username" {
		if username == "" {
			return nil, errors.New("SECRET_NO_USERNAME: " + name + " has no saved username; fill the username as a normal field.")
		}
		value = username
	}
	_, domBefore, _ := s.domState(ctx, frameID)
	mark := s.mark()
	out, dispatched, err := s.act(ctx, actRequest{SnapshotID: snap, Ref: ref, Action: "fill", Value: value, HasValue: true, Effect: "none", SecretPart: part})
	value, password = "", ""
	if dispatched && s.live() {
		s.settle(ctx, mark, frameID, domBefore, settleField)
	}
	label, _ := out["label"].(string)
	rc := Receipt{Tool: "browser_runner_act", Action: "fill_secret", Label: clip(label+" ← "+name, 120), URL: safeURL(s.currentHref()), Outcome: "ok"}
	if err != nil {
		rc.Outcome, rc.Detail = "error", clip(err.Error(), 200)
	}
	s.cp.receipt(m.now(), rc)
	if err != nil {
		return nil, err
	}
	res := map[string]any{"action": "fill_secret", "secret": name, "part": part, "label": label}
	for k, v := range s.pageState(ctx) {
		res[k] = v
	}
	return res, nil
}

// savedLogins lists the vault for the caller: names, sites and masked
// usernames, never passwords.
func savedLogins() []map[string]any {
	list, _ := vault.List()
	out := []map[string]any{}
	for _, en := range list {
		out = append(out, map[string]any{"secret": en.Name, "sites": en.Sites, "username": vault.Mask(en.Username), "source": en.Source, "updated_at": en.Updated})
	}
	return out
}
