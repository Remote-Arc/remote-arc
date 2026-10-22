package browserrunner

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"sort"
	"strings"
)

// originRule is one delegated site. Rules come only from an explicit
// browser_start call; page content, redirects and popups never widen them.
type originRule struct {
	Scheme   string // https, or http for loopback test servers only
	Host     string // lower-case host without port
	Wildcard bool   // *.example.com matches subdomains, not example.com itself
	Port     string // empty means the scheme default
}

func (r originRule) String() string {
	h := r.Host
	if r.Wildcard {
		h = "*." + h
	}
	if r.Port != "" {
		h += ":" + r.Port
	}
	return r.Scheme + "://" + h
}

func isLoopback(host string) bool {
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func parseRule(raw string) (originRule, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" || len(s) > 260 {
		return originRule{}, errors.New("empty or oversized origin")
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	scheme, rest, _ := strings.Cut(s, "://")
	if scheme != "https" && scheme != "http" {
		return originRule{}, fmt.Errorf("origin %q must use https", raw)
	}
	if i := strings.IndexAny(rest, "/?#"); i >= 0 {
		if strings.Trim(rest[i:], "/") != "" {
			return originRule{}, fmt.Errorf("origin %q must not include a path", raw)
		}
		rest = rest[:i]
	}
	if strings.Contains(rest, "@") {
		return originRule{}, fmt.Errorf("origin %q must not include credentials", raw)
	}
	r := originRule{Scheme: scheme}
	host, port := rest, ""
	if h, p, e := net.SplitHostPort(rest); e == nil {
		host, port = h, p
	}
	if strings.HasPrefix(host, "*.") {
		r.Wildcard = true
		host = host[2:]
	}
	if host == "" || strings.ContainsAny(host, "*[] ") {
		return originRule{}, fmt.Errorf("origin %q has an invalid host", raw)
	}
	if r.Wildcard && !strings.Contains(host, ".") {
		return originRule{}, fmt.Errorf("origin %q is too broad", raw)
	}
	if scheme == "http" && !isLoopback(host) {
		return originRule{}, fmt.Errorf("origin %q must use https (plain http is only allowed for this computer)", raw)
	}
	r.Host, r.Port = host, port
	return r, nil
}

type scope struct{ rules []originRule }

func newScope(raw []string) (scope, error) {
	if len(raw) == 0 {
		return scope{}, errors.New("allowed_origins must list at least one site, for example https://jobs.example.com")
	}
	if len(raw) > 20 {
		return scope{}, errors.New("allowed_origins accepts at most 20 sites")
	}
	seen := map[string]bool{}
	s := scope{}
	for _, item := range raw {
		r, e := parseRule(item)
		if e != nil {
			return scope{}, e
		}
		if !seen[r.String()] {
			seen[r.String()] = true
			s.rules = append(s.rules, r)
		}
	}
	sort.Slice(s.rules, func(i, j int) bool { return s.rules[i].String() < s.rules[j].String() })
	return s, nil
}

func (s scope) Strings() []string {
	out := make([]string, len(s.rules))
	for i, r := range s.rules {
		out[i] = r.String()
	}
	return out
}

// covers reports whether every rule of other is already granted by s.
func (s scope) covers(other scope) bool {
	have := map[string]bool{}
	for _, r := range s.rules {
		have[r.String()] = true
	}
	for _, r := range other.rules {
		if !have[r.String()] {
			return false
		}
	}
	return true
}

func defaultPort(scheme string) string {
	if scheme == "http" {
		return "80"
	}
	return "443"
}

// Allows checks a navigation target. Only http(s) documents can be delegated.
func (s scope) Allows(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.User != nil {
		return false
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "https" && scheme != "http" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if port == "" {
		port = defaultPort(scheme)
	}
	for _, r := range s.rules {
		if r.Scheme != scheme {
			continue
		}
		want := r.Port
		if want == "" {
			want = defaultPort(r.Scheme)
		}
		if want != port {
			continue
		}
		if r.Wildcard {
			if strings.HasSuffix(host, "."+r.Host) {
				return true
			}
		} else if host == r.Host {
			return true
		}
	}
	return false
}

// originOf trims a URL to scheme://host[:port] for reports, without paths or
// query strings that can carry tokens.
func originOf(raw string) string {
	u, e := url.Parse(raw)
	if e != nil || u.Host == "" {
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

// safeURL drops query strings and fragments, which commonly hold session or
// magic-link tokens, before a URL is written to a checkpoint or report.
func safeURL(raw string) string {
	u, e := url.Parse(raw)
	if e != nil {
		return ""
	}
	u.User = nil
	u.RawQuery = ""
	u.Fragment = ""
	s := u.String()
	if len(s) > 400 {
		s = s[:400]
	}
	return s
}
