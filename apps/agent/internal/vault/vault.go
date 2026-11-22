// Package vault keeps sign-ins on the user's computer so Browser Runner can
// sign in without a person and without a password ever passing through an
// AI. An entry is bound to the sites it may be filled on; callers refer to
// it by name and never see the password. Passwords are protected by the
// operating system where it offers a store for this user (DPAPI on Windows,
// the login Keychain on macOS); elsewhere they are kept in a file only the
// user can read, like the device credentials in config.json.
package vault

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// Entry is a saved sign-in. Secret holds the protected password and is
// never returned by List or Match.
type Entry struct {
	Name     string   `json:"name"`
	Sites    []string `json:"sites"`
	Username string   `json:"username,omitempty"`
	Source   string   `json:"source"` // "cli" (entered by the user) or "runner" (saved from a sign-in in the Runner window)
	Created  string   `json:"created_at"`
	Updated  string   `json:"updated_at"`
	Secret   string   `json:"secret,omitempty"`
}

var (
	mu          sync.Mutex
	namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.@-]{0,99}$`)
)

// ValidName reports whether name can name an entry.
func ValidName(name string) bool { return namePattern.MatchString(name) }

func path() string { return filepath.Join(config.Dir(), "vault.json") }

func load() (map[string]Entry, error) {
	b, e := os.ReadFile(path())
	if errors.Is(e, os.ErrNotExist) {
		return map[string]Entry{}, nil
	}
	if e != nil {
		return nil, e
	}
	var m map[string]Entry
	if e := json.Unmarshal(b, &m); e != nil {
		return nil, errors.New("the Remote Arc vault file is unreadable")
	}
	if m == nil {
		m = map[string]Entry{}
	}
	return m, nil
}

func store(m map[string]Entry) error {
	b, e := json.MarshalIndent(m, "", "  ")
	if e != nil {
		return e
	}
	return config.DurableWrite(path(), b, 0600)
}

// Site normalizes a site to an origin: scheme and host (and port), with an
// optional leading "*." on the host for all its subdomains.
func Site(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, e := url.Parse(raw)
	if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", fmt.Errorf("%q is not a site such as https://login.example.com", raw)
	}
	return strings.ToLower(u.Scheme + "://" + u.Host), nil
}

// Put saves or replaces an entry. Sites are merged with an existing entry of
// the same name, so saving a new password keeps where it may be used.
func Put(name string, sites []string, username, password, source string, now time.Time) error {
	if !ValidName(name) {
		return errors.New("a vault name is 1-100 letters, digits, '.', '_', '@' or '-'")
	}
	if password == "" {
		return errors.New("the password is empty")
	}
	norm := []string{}
	for _, s := range sites {
		o, e := Site(s)
		if e != nil {
			return e
		}
		norm = append(norm, o)
	}
	if len(norm) == 0 {
		return errors.New("an entry needs at least one site it may be filled on")
	}
	mu.Lock()
	defer mu.Unlock()
	m, e := load()
	if e != nil {
		return e
	}
	sealed := fileSeal([]byte(password))
	if !fileStore() {
		if sealed, e = seal(name, []byte(password)); e != nil {
			return fmt.Errorf("could not protect the password: %w", e)
		}
	}
	stamp := now.UTC().Format(time.RFC3339)
	en, ok := m[name]
	if !ok {
		en = Entry{Name: name, Created: stamp}
	}
	en.Sites = union(en.Sites, norm)
	if username != "" {
		en.Username = username
	}
	en.Source, en.Updated, en.Secret = source, stamp, sealed
	m[name] = en
	return store(m)
}

// Remove deletes an entry and its protected password.
func Remove(name string) (bool, error) {
	mu.Lock()
	defer mu.Unlock()
	m, e := load()
	if e != nil {
		return false, e
	}
	en, ok := m[name]
	if !ok {
		return false, nil
	}
	if !strings.HasPrefix(en.Secret, "file:") {
		forget(name, en.Secret)
	}
	delete(m, name)
	return true, store(m)
}

// List returns all entries without their passwords, by name.
func List() ([]Entry, error) {
	mu.Lock()
	m, e := load()
	mu.Unlock()
	if e != nil {
		return nil, e
	}
	out := make([]Entry, 0, len(m))
	for _, en := range m {
		en.Secret = ""
		out = append(out, en)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Match returns the entries that may be filled on pageURL, without passwords.
func Match(pageURL string) []Entry {
	list, _ := List()
	out := []Entry{}
	for _, en := range list {
		if Allows(en.Sites, pageURL) {
			out = append(out, en)
		}
	}
	return out
}

// Allows reports whether pageURL is on one of sites: the same scheme and
// host (and port), or a subdomain of a "*." site.
func Allows(sites []string, pageURL string) bool {
	u, e := url.Parse(pageURL)
	if e != nil || u.Host == "" {
		return false
	}
	scheme, host := strings.ToLower(u.Scheme), strings.ToLower(u.Host)
	for _, s := range sites {
		su, e := url.Parse(s)
		if e != nil || strings.ToLower(su.Scheme) != scheme {
			continue
		}
		h := strings.ToLower(su.Host)
		if h == host {
			return true
		}
		if rest, ok := strings.CutPrefix(h, "*."); ok && strings.HasSuffix(host, "."+rest) {
			return true
		}
	}
	return false
}

// Reveal returns an entry's username and password for filling on pageURL.
// It refuses any page the entry is not bound to.
func Reveal(name, pageURL string) (username, password string, err error) {
	mu.Lock()
	m, e := load()
	mu.Unlock()
	if e != nil {
		return "", "", e
	}
	en, ok := m[name]
	if !ok {
		return "", "", fmt.Errorf("SECRET_NOT_FOUND: no saved sign-in named %q on this computer", name)
	}
	if !Allows(en.Sites, pageURL) {
		return "", "", fmt.Errorf("SECRET_WRONG_SITE: %q is saved for %s, not for this page", name, strings.Join(en.Sites, ", "))
	}
	var b []byte
	if strings.HasPrefix(en.Secret, "file:") {
		b, e = fileOpen(en.Secret)
	} else {
		b, e = open(name, en.Secret)
	}
	if e != nil {
		return "", "", fmt.Errorf("could not read the protected password: %w", e)
	}
	return en.Username, string(b), nil
}

// Mask shows enough of a username to recognise it.
func Mask(u string) string {
	if u == "" {
		return ""
	}
	at := strings.IndexByte(u, '@')
	if at < 0 {
		at = len(u)
	}
	keep := 1
	if at > 4 {
		keep = 2
	}
	if keep > at {
		keep = at
	}
	return u[:keep] + strings.Repeat("*", max(1, at-keep)) + u[at:]
}

func union(a, b []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range append(append([]string{}, a...), b...) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}
