// Package release compares Remote Arc Agent versions. The CLI uses it to decide
// whether a launch replaces a running Agent, and remote updates use it to refuse
// downgrades, so both follow one rule.
package release

import (
	"strconv"
	"strings"
)

// Older reports whether running is a strictly older release than
// current, using semantic-version precedence including pre-releases
// (0.6.1 < 0.6.2-rc.3 < 0.6.2-rc.4 < 0.6.2). Anything it cannot parse is
// never treated as older, so an unknown owner is never replaced.
func Older(running, current string) bool {
	a, okA := parse(running)
	b, okB := parse(current)
	if !okA || !okB {
		return false
	}
	return compare(a, b) < 0
}

type version struct {
	core [3]int
	pre  []string
}

func parse(v string) (version, bool) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexByte(v, '+'); i >= 0 {
		v = v[:i]
	}
	var r version
	core, pre, hasPre := strings.Cut(v, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return r, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || (len(p) > 1 && p[0] == '0') {
			return r, false
		}
		r.core[i] = n
	}
	if hasPre {
		if pre == "" {
			return r, false
		}
		r.pre = strings.Split(pre, ".")
		for _, id := range r.pre {
			if id == "" {
				return r, false
			}
		}
	}
	return r, true
}

func compare(a, b version) int {
	for i := range a.core {
		if a.core[i] != b.core[i] {
			if a.core[i] < b.core[i] {
				return -1
			}
			return 1
		}
	}
	switch {
	case len(a.pre) == 0 && len(b.pre) == 0:
		return 0
	case len(a.pre) == 0:
		return 1 // a release ranks above its pre-releases
	case len(b.pre) == 0:
		return -1
	}
	for i := 0; i < len(a.pre) && i < len(b.pre); i++ {
		x, y := a.pre[i], b.pre[i]
		nx, ex := strconv.Atoi(x)
		ny, ey := strconv.Atoi(y)
		switch {
		case ex == nil && ey == nil:
			if nx != ny {
				if nx < ny {
					return -1
				}
				return 1
			}
		case ex == nil:
			return -1 // numeric identifiers rank below alphanumeric ones
		case ey == nil:
			return 1
		default:
			if c := strings.Compare(x, y); c != 0 {
				return c
			}
		}
	}
	switch {
	case len(a.pre) < len(b.pre):
		return -1
	case len(a.pre) > len(b.pre):
		return 1
	}
	return 0
}
