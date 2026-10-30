package execution

// Safety Guard for deletion commands, ported from
// packages/execution-core-ts/src/delete-guard.ts. Instead of pattern-matching
// command text, it finds the delete commands a shell line would run (including
// nested cmd, PowerShell and sh layers), resolves each target to an absolute
// path and refuses only roots, homes, protected folders and targets it cannot
// resolve unambiguously. Both ports run testdata/delete_guard_cases.json.

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"unicode/utf16"
)

// DeleteGuardContext uses Node platform names (win32, darwin, linux) so the
// shared fixtures are identical for both ports.
type DeleteGuardContext struct {
	Platform string            `json:"platform"`
	Cwd      string            `json:"cwd"`
	Home     string            `json:"home"`
	Env      map[string]string `json:"env"`
}

type shellKind int

const (
	shellCmd shellKind = iota
	shellPS
	shellSh
)

type guardSegment struct{ raw, sep string }
type guardWord struct {
	text, raw                    string
	start, end                   int
	quoted, unresolved, pipeItem bool
}
type guardState struct {
	ctx      DeleteGuardContext
	cwd      string
	cwdKnown bool
	vars     map[string]*string
	depth    int
}
type segInfo struct {
	words    []guardWord
	k        int
	shell    shellKind
	upstream *segInfo
}
type guardRefusal struct{ msg string }

const maxGuardDepth = 4
const maxScriptBytes = 256 * 1024

var (
	deleteMention  = regexp.MustCompile(`(?i)(?:^|[^a-z0-9_-])(?:rd|rmdir|del|erase|rm|ri|remove-item|unlink|shred|srm|rimraf|rmtree|rmsync|rmdirsync|robocopy|rsync)(?:[^a-z0-9_-]|$)|::delete`)
	inlineDelete   = regexp.MustCompile(`(?:shutil\.rmtree|os\.removedirs|os\.rmdir|os\.remove|os\.unlink|rmtree|rmSync|rmdirSync|unlinkSync|rimraf\.sync|rimraf|fsp\.rm|promises\.rm|fs\.rm|FileUtils\.rm_rf|FileUtils\.rm_r|FileUtils\.remove_dir|remove_tree)\s*\(\s*(?:[rRbBuUfF]{0,2}(?:'([^']*)'|"([^"]*)"|` + "`([^`]*)`" + `))?`)
	dotnetDelete   = regexp.MustCompile(`(?i)\[(?:system\.)?io\.(?:directory|file)\]::delete\s*\(\s*(?:'([^']*)'|"([^"]*)")?`)
	driveRe        = regexp.MustCompile(`^[A-Za-z]:`)
	driveRootRe    = regexp.MustCompile(`^[A-Za-z]:\\$`)
	driveAbsRe     = regexp.MustCompile(`^[A-Za-z]:\\`)
	identRe        = regexp.MustCompile(`^[A-Za-z_]\w*`)
	fullIdentRe    = regexp.MustCompile(`^[A-Za-z_]\w*$`)
	psNameRe       = regexp.MustCompile(`^[A-Za-z0-9_?:]+`)
	psPropRe       = regexp.MustCompile(`^\.[A-Za-z_]\w*`)
	assignRe       = regexp.MustCompile(`^[A-Za-z_]\w*=`)
	psAssignRe     = regexp.MustCompile(`(?s)^\s*\$([A-Za-z_]\w*)\s*=\s*(.*)$`)
	redirectOnlyRe = regexp.MustCompile(`^(?:\d|&)?(?:>>?|<)(?:&\d)?$`)
	redirectRe     = regexp.MustCompile(`^(?:\d|&)?(?:>>?|<)`)
	exeSuffixRe    = regexp.MustCompile(`\.(?:exe|com|cmd|bat)$`)
	gluedCmdRe     = regexp.MustCompile(`(?i)^(rd|rmdir|del|erase)(/.*)$`)
	xargsValueRe   = regexp.MustCompile(`^-[IinPLdEs]$`)
	shDashCRe      = regexp.MustCompile(`(?i)^-[a-z]*c[a-z]*$`)
	base64Re       = regexp.MustCompile(`^[A-Za-z0-9+/=]+$`)
	providerRe     = regexp.MustCompile(`(?i)^(?:microsoft\.powershell\.core\\)?filesystem::`)
	psDriveRe      = regexp.MustCompile(`(?i)^[a-z][a-z0-9]+:`)
	uncLongRe      = regexp.MustCompile(`(?i)^\\\\\?\\unc\\`)
	longDriveRe    = regexp.MustCompile(`(?i)^\\\\[?.]\\[a-z]:`)
	deviceRe       = regexp.MustCompile(`^\\\\[?.]\\`)
	shortNameRe    = regexp.MustCompile(`~\d`)
	mirRe          = regexp.MustCompile(`(?i)^/(?:mir|purge)$`)
	remoteRe       = regexp.MustCompile(`^[^/\\]{2,}:`)
	wordStartRe    = regexp.MustCompile(`[\s;|&(){}]`)
)

func ambiguousTarget(why string) {
	panic(guardRefusal{"the delete target could not be resolved unambiguously (" + why + ")"})
}

func charAt(s string, i int) byte {
	if i < 0 || i >= len(s) {
		return 0
	}
	return s[i]
}

func indexFrom(s, sub string, from int) int {
	if from > len(s) {
		return -1
	}
	i := strings.Index(s[from:], sub)
	if i < 0 {
		return -1
	}
	return i + from
}

func clampLen(s string, i int) int {
	if i > len(s) {
		return len(s)
	}
	return i
}

// ---------------------------------------------------------------- paths

func normWin(p string) string {
	s := strings.ReplaceAll(p, "/", `\`)
	prefix, rest := "", s
	if strings.HasPrefix(s, `\\`) {
		parts := nonEmpty(strings.Split(s[2:], `\`))
		if len(parts) < 2 {
			return `\\` + strings.Join(parts, `\`)
		}
		prefix = `\\` + strings.Join(parts[:2], `\`)
		rest = strings.Join(parts[2:], `\`)
	} else if driveRe.MatchString(s) {
		prefix = strings.ToUpper(s[:2])
		rest = s[2:]
	}
	out := []string{}
	for _, part := range strings.Split(rest, `\`) {
		if part == "" || part == "." {
			continue
		}
		if part == ".." {
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
			continue
		}
		trimmed := strings.TrimRight(part, ". ")
		if trimmed == "" {
			trimmed = part
		}
		out = append(out, trimmed)
	}
	return prefix + `\` + strings.Join(out, `\`)
}

func normPosix(p string) string {
	out := []string{}
	for _, part := range strings.Split(p, "/") {
		if part == "" || part == "." {
			continue
		}
		if part == ".." {
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
			continue
		}
		out = append(out, part)
	}
	return "/" + strings.Join(out, "/")
}

func nonEmpty(parts []string) []string {
	out := []string{}
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func joinGuardPath(win bool, base, rel string) string {
	if win {
		return normWin(base + `\` + rel)
	}
	return normPosix(base + "/" + rel)
}

func parentOf(win bool, p string) string {
	sep := "/"
	if win {
		sep = `\`
	}
	cut := strings.LastIndex(p, sep)
	if cut <= 0 {
		if win {
			return p
		}
		return "/"
	}
	parent := p[:cut]
	if win && len(parent) == 2 && driveRe.MatchString(parent) {
		return parent + `\`
	}
	return parent
}

// ------------------------------------------------------- protection rules

type guardRules struct {
	win, insensitive                                      bool
	ancestor, inside, allow, homeParents, mountParents []string
}

func lookupGuardEnv(ctx DeleteGuardContext, name string) string {
	if ctx.Platform != "win32" {
		return ctx.Env[name]
	}
	wanted := strings.ToLower(name)
	for k, v := range ctx.Env {
		if strings.ToLower(k) == wanted {
			return v
		}
	}
	return ""
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func rulesFor(ctx DeleteGuardContext) guardRules {
	win := ctx.Platform == "win32"
	norm, sep := normPosix, "/"
	if win {
		norm, sep = normWin, `\`
	}
	home := norm(ctx.Home)
	h := func(rels ...string) []string {
		out := []string{}
		for _, rel := range rels {
			out = append(out, norm(home+sep+strings.ReplaceAll(rel, "/", sep)))
		}
		return out
	}
	env := func(name string) string { return lookupGuardEnv(ctx, name) }
	mapNorm := func(list []string) []string {
		out := make([]string, len(list))
		for i, p := range list {
			out[i] = norm(p)
		}
		return out
	}
	if win {
		drive := orDefault(env("SystemDrive"), "C:")
		if len(drive) > 2 {
			drive = drive[:2]
		}
		sys := orDefault(env("SystemRoot"), drive+`\Windows`)
		programData := orDefault(env("ProgramData"), drive+`\ProgramData`)
		ancestor := append([]string{home, drive + `\Users\Public`}, h("Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", "Favorites", "Contacts", "Saved Games", "Searches", "Links", "OneDrive", "Dropbox", "Google Drive", "iCloudDrive", "AppData", "AppData/Local", "AppData/Roaming", "AppData/LocalLow", ".config", ".local", ".local/share", "source", "source/repos")...)
		for _, name := range []string{"OneDrive", "OneDriveConsumer", "OneDriveCommercial"} {
			if v := env(name); v != "" {
				ancestor = append(ancestor, v)
			}
		}
		inside := append([]string{sys, orDefault(env("ProgramFiles"), drive+`\Program Files`), orDefault(env("ProgramFiles(x86)"), drive+`\Program Files (x86)`), programData,
			drive + `\System Volume Information`, drive + `\Recovery`, drive + `\Boot`},
			h(".ssh", ".gnupg", ".aws", ".azure", ".kube", "AppData/Roaming/Microsoft/Credentials", "AppData/Roaming/Microsoft/Protect", "AppData/Local/Microsoft/Credentials", "AppData/Roaming/Microsoft/SystemCertificates")...)
		return guardRules{win: true, insensitive: true,
			ancestor:    mapNorm(ancestor),
			inside:      mapNorm(inside),
			allow:       mapNorm([]string{sys + `\Temp`, sys + `\SoftwareDistribution\Download`, programData + `\Microsoft\Windows\WER`}),
			homeParents: []string{norm(drive + `\Users`)},
		}
	}
	return guardRules{win: false, insensitive: ctx.Platform == "darwin",
		ancestor: append([]string{home, "/Users", "/home", "/Volumes", "/mnt", "/media", "/Applications", "/var", "/private", "/private/var", "/opt", "/usr/local"},
			h("Desktop", "Documents", "Downloads", "Pictures", "Music", "Movies", "Videos", "Public", "Templates", "Library", "Library/Application Support", "Library/Mobile Documents", "Library/CloudStorage", "Library/Containers", "Library/Group Containers", "Library/Mail", "Library/Messages", "Dropbox", "OneDrive", "Google Drive", ".config", ".local", ".local/share")...),
		inside: append([]string{"/bin", "/sbin", "/usr", "/etc", "/boot", "/lib", "/lib32", "/lib64", "/libx32", "/root", "/srv", "/proc", "/sys", "/dev", "/run", "/snap", "/System", "/Library", "/private/etc", "/var/lib", "/var/db", "/private/var/db", "/cores"},
			h(".ssh", ".gnupg", ".aws", ".azure", ".kube", ".password-store", "Library/Keychains", ".local/share/keyrings")...),
		allow:        []string{"/usr/local", "/Library/Caches", "/Library/Logs"},
		homeParents:  []string{"/Users", "/home"},
		mountParents: []string{"/Volumes", "/mnt", "/media"},
	}
}

func (r guardRules) within(child, parent string) bool {
	sep := "/"
	if r.win {
		sep = `\`
	}
	c, p := child, parent
	if r.insensitive {
		c, p = strings.ToLower(c), strings.ToLower(p)
	}
	if c == p {
		return true
	}
	if !strings.HasSuffix(p, sep) {
		p += sep
	}
	return strings.HasPrefix(c, p)
}

func (r guardRules) isRoot(p string) bool {
	if !r.win {
		return p == "/"
	}
	if driveRootRe.MatchString(p) {
		return true
	}
	return strings.HasPrefix(p, `\\`) && len(nonEmpty(strings.Split(p[2:], `\`))) <= 2
}

// ProtectedDeleteReason explains why deleting abs (or its contents) is refused, or "".
func ProtectedDeleteReason(ctx DeleteGuardContext, abs string) string {
	r := rulesFor(ctx)
	sep := "/"
	if r.win {
		sep = `\`
	}
	if r.isRoot(abs) {
		return "deleting a drive, share or filesystem root (" + abs + ")"
	}
	for _, part := range strings.Split(abs, sep) {
		if strings.ToLower(part) == ".remotearc" {
			return "deleting the Remote Arc Undo and configuration store"
		}
	}
	for _, d := range r.inside {
		if r.within(abs, d) {
			allowed := false
			for _, a := range r.allow {
				if r.within(abs, a) && r.within(a, d) {
					allowed = true
					break
				}
			}
			if !allowed {
				return "deleting inside protected location " + d
			}
		}
		if r.within(d, abs) {
			return "deleting " + abs + " would remove protected location " + d
		}
	}
	for _, d := range r.ancestor {
		if r.within(d, abs) {
			if r.within(abs, d) {
				return "deleting protected folder " + d
			}
			return "deleting " + abs + " would remove protected folder " + d
		}
	}
	parent := parentOf(r.win, abs)
	for _, d := range r.homeParents {
		if r.within(parent, d) && r.within(d, parent) {
			return "deleting a user's home folder (" + abs + ")"
		}
	}
	for _, d := range r.mountParents {
		if r.within(parent, d) && r.within(d, parent) {
			return "deleting a mounted volume (" + abs + ")"
		}
	}
	return ""
}

// ---------------------------------------------------------------- lexing

func matchParen(src string, open int, shell shellKind) int {
	depth := 0
	for i := open; i < len(src); i++ {
		switch c := src[i]; c {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return i
			}
		case '\'', '"':
			end := skipQuoted(src, i, shell)
			if end < 0 {
				return -1
			}
			i = end
		}
	}
	return -1
}

func skipQuoted(src string, i int, shell shellKind) int {
	q := src[i]
	for j := i + 1; j < len(src); j++ {
		c := src[j]
		if shell == shellSh && q == '"' && c == '\\' {
			j++
			continue
		}
		if shell == shellPS && q == '"' && c == '`' {
			j++
			continue
		}
		if c == q {
			if shell == shellPS && charAt(src, j+1) == q {
				j++
				continue
			}
			return j
		}
	}
	return -1
}

func splitSegments(src string, shell shellKind) ([]guardSegment, bool) {
	segments := []guardSegment{}
	start, sep, unbalanced := 0, "", false
	cut := func(end int, next string, width int) {
		segments = append(segments, guardSegment{raw: src[start:end], sep: sep})
		sep = next
		start = end + width
	}
loop:
	for i := 0; i < len(src); i++ {
		c, n := src[i], charAt(src, i+1)
		prev := charAt(src, i-1)
		wordStart := i == start || prev == 0 || wordStartRe.MatchString(string(prev))
		if shell == shellCmd {
			if c == '^' {
				i++
				continue
			}
			if c == '"' {
				end := indexFrom(src, `"`, i+1)
				if end < 0 {
					unbalanced = true
					break loop
				}
				i = end
				continue
			}
		} else {
			if c == '\'' || c == '"' {
				end := skipQuoted(src, i, shell)
				if end < 0 {
					unbalanced = true
					break loop
				}
				i = end
				continue
			}
			if shell == shellSh && c == '\\' {
				i++
				continue
			}
			if shell == shellPS && c == '`' {
				i++
				continue
			}
			if shell == shellSh && c == '`' {
				end := indexFrom(src, "`", i+1)
				if end < 0 {
					unbalanced = true
					break loop
				}
				i = end
				continue
			}
			if c == '#' && wordStart {
				if shell == shellPS && prev == '<' {
					continue
				}
				nl := indexFrom(src, "\n", i)
				if nl < 0 {
					i = len(src)
				} else {
					i = nl - 1
				}
				continue
			}
			if shell == shellPS && c == '<' && n == '#' {
				end := indexFrom(src, "#>", i+2)
				if end < 0 {
					i = len(src)
				} else {
					i = end + 1
				}
				continue
			}
			if c == '$' && n == '(' {
				end := matchParen(src, i+1, shell)
				if end < 0 {
					unbalanced = true
					break loop
				}
				i = end
				continue
			}
			if shell == shellPS && (c == '(' || (c == '@' && n == '(')) {
				open := i
				if c == '@' {
					open = i + 1
				}
				end := matchParen(src, open, shell)
				if end < 0 {
					unbalanced = true
					break loop
				}
				i = end
				continue
			}
		}
		switch {
		case c == '\n':
			cut(i, ";", 1)
		case (c == '&' && n == '&') || (c == '|' && n == '|'):
			cut(i, ";", 2)
			i++
		case c == '|':
			cut(i, "|", 1)
		case c == ';' && shell != shellCmd:
			cut(i, ";", 1)
		case c == '&' && shell != shellPS:
			cut(i, ";", 1)
		case (c == '(' || c == ')') && shell != shellPS:
			cut(i, ";", 1)
		case shell == shellPS && (c == '{' || c == '}'):
			if c == '{' {
				cut(i, "{", 1)
			} else {
				cut(i, ";", 1)
			}
		}
	}
	if start > len(src) {
		start = len(src)
	}
	segments = append(segments, guardSegment{raw: src[start:], sep: sep})
	return segments, unbalanced
}

func (st *guardState) shVar(name string) (string, bool) {
	if v, ok := st.vars[name]; ok {
		if v == nil || *v == "" {
			return "", false
		}
		return *v, true
	}
	v := lookupGuardEnv(st.ctx, name)
	if name == "HOME" && v == "" {
		v = st.ctx.Home
	}
	return v, v != ""
}

func isGuardSpace(c byte, shell shellKind) bool {
	return c == ' ' || c == '\t' || c == '\r' || (shell == shellCmd && (c == ',' || c == ';' || c == '=')) || (shell == shellPS && c == ',')
}

func guardWords(seg guardSegment, shell shellKind, st *guardState) []guardWord {
	raw := seg.raw
	out := []guardWord{}
	i := 0
	for i < len(raw) {
		for i < len(raw) && isGuardSpace(raw[i], shell) {
			i++
		}
		if i >= len(raw) {
			break
		}
		start := i
		var text strings.Builder
		quoted, unresolved, pipeItem, inQuote := false, false, false, false
		add := func(j int) {
			if j < len(raw) {
				text.WriteByte(raw[j])
			}
		}
		expandSh := func() {
			n := charAt(raw, i+1)
			if n == '(' {
				end := matchParen(raw, i+1, shell)
				unresolved = true
				if end < 0 {
					i = len(raw)
				} else {
					i = end + 1
				}
				return
			}
			if n == '{' {
				end := indexFrom(raw, "}", i+2)
				name := ""
				if end >= 0 {
					name = raw[i+2 : end]
					i = end + 1
				} else {
					i = len(raw)
				}
				if !fullIdentRe.MatchString(name) {
					unresolved = true
					return
				}
				if v, ok := st.shVar(name); ok {
					text.WriteString(v)
				} else {
					unresolved = true
				}
				return
			}
			if m := identRe.FindString(raw[clampLen(raw, i+1):]); m != "" {
				i += 1 + len(m)
				if v, ok := st.shVar(m); ok {
					text.WriteString(v)
				} else {
					unresolved = true
				}
				return
			}
			if n != 0 && strings.IndexByte("0123456789@*#?$!-", n) >= 0 {
				unresolved = true
				i += 2
				return
			}
			text.WriteByte('$')
			i++
		}
		expandPs := func() {
			n := charAt(raw, i+1)
			if n == '(' {
				end := matchParen(raw, i+1, shell)
				unresolved = true
				if end < 0 {
					i = len(raw)
				} else {
					i = end + 1
				}
				return
			}
			if n == '{' {
				end := indexFrom(raw, "}", i+2)
				unresolved = true
				if end < 0 {
					i = len(raw)
				} else {
					i = end + 1
				}
				return
			}
			name := psNameRe.FindString(raw[clampLen(raw, i+1):])
			if name == "" {
				text.WriteByte('$')
				i++
				return
			}
			name = strings.TrimSuffix(name, ":")
			i += 1 + len(name)
			lower := strings.ToLower(name)
			switch {
			case strings.HasPrefix(lower, "env:"):
				if v := lookupGuardEnv(st.ctx, name[4:]); v != "" {
					text.WriteString(v)
				} else {
					unresolved = true
				}
			case lower == "_" || lower == "psitem":
				pipeItem = true
				if prop := psPropRe.FindString(raw[clampLen(raw, i):]); prop != "" {
					i += len(prop)
				}
			case lower == "home":
				text.WriteString(st.ctx.Home)
			case lower == "pwd":
				if st.cwdKnown {
					text.WriteString(st.cwd)
				} else {
					unresolved = true
				}
			default:
				if v, ok := st.vars[lower]; ok && v != nil && *v != "" {
					text.WriteString(*v)
				} else {
					unresolved = true
				}
			}
		}
		for i < len(raw) {
			c := raw[i]
			if shell == shellCmd {
				if !inQuote && isGuardSpace(c, shell) {
					break
				}
				if c == '^' && !inQuote {
					add(i + 1)
					i += 2
					continue
				}
				if c == '"' {
					inQuote = !inQuote
					quoted = true
					i++
					continue
				}
				if c == '%' {
					if charAt(raw, i+1) == '%' {
						unresolved = true
						i += 3
						continue
					}
					end := indexFrom(raw, "%", i+1)
					name := ""
					if end >= 0 {
						name = raw[i+1 : end]
					}
					if end < 0 || name == "" || strings.ContainsAny(name, " \t\n\r\f\v:~\"") {
						next := charAt(raw, i+1)
						if next == '~' || (next >= 'A' && next <= 'Z') || (next >= 'a' && next <= 'z') {
							unresolved = true
							i += 2
							for i < len(raw) && (isAlnum(raw[i]) || raw[i] == '~' || raw[i] == '$' || raw[i] == ':') {
								i++
							}
							continue
						}
						text.WriteByte(c)
						i++
						continue
					}
					if v := lookupGuardEnv(st.ctx, name); v != "" {
						text.WriteString(v)
					} else {
						unresolved = true
					}
					i = end + 1
					continue
				}
				text.WriteByte(c)
				i++
				continue
			}
			if isGuardSpace(c, shell) {
				break
			}
			if shell == shellSh {
				switch {
				case c == '\\':
					if charAt(raw, i+1) != '\n' {
						add(i + 1)
					}
					i += 2
				case c == '\'':
					end := indexFrom(raw, "'", i+1)
					if end < 0 {
						end = len(raw)
					}
					text.WriteString(raw[i+1 : end])
					quoted = true
					i = end + 1
				case c == '"':
					quoted = true
					i++
					for i < len(raw) && raw[i] != '"' {
						if raw[i] == '\\' && charAt(raw, i+1) != 0 && strings.IndexByte("$`\"\\\n", raw[i+1]) >= 0 {
							add(i + 1)
							i += 2
							continue
						}
						if raw[i] == '$' {
							expandSh()
							continue
						}
						if raw[i] == '`' {
							end := indexFrom(raw, "`", i+1)
							unresolved = true
							if end < 0 {
								i = len(raw)
							} else {
								i = end + 1
							}
							continue
						}
						text.WriteByte(raw[i])
						i++
					}
					i++
				case c == '$':
					expandSh()
				case c == '`':
					end := indexFrom(raw, "`", i+1)
					unresolved = true
					if end < 0 {
						i = len(raw)
					} else {
						i = end + 1
					}
				case c == '~' && text.Len() == 0 && !quoted && (i+1 >= len(raw) || raw[i+1] == '/' || isGuardSpace(raw[i+1], shell)):
					text.WriteString(st.ctx.Home)
					i++
				default:
					if c == '~' && text.Len() == 0 && !quoted {
						unresolved = true
					}
					text.WriteByte(c)
					i++
				}
				continue
			}
			// PowerShell
			switch {
			case c == '`':
				add(i + 1)
				i += 2
			case c == '\'':
				quoted = true
				i++
				for i < len(raw) {
					if raw[i] == '\'' {
						if charAt(raw, i+1) == '\'' {
							text.WriteByte('\'')
							i += 2
							continue
						}
						break
					}
					text.WriteByte(raw[i])
					i++
				}
				i++
			case c == '"':
				quoted = true
				i++
				for i < len(raw) {
					d := raw[i]
					if d == '`' {
						add(i + 1)
						i += 2
						continue
					}
					if d == '"' {
						if charAt(raw, i+1) == '"' {
							text.WriteByte('"')
							i += 2
							continue
						}
						break
					}
					if d == '$' {
						expandPs()
						continue
					}
					text.WriteByte(d)
					i++
				}
				i++
			case c == '$':
				expandPs()
			case c == '(' || (c == '@' && charAt(raw, i+1) == '('):
				open := i
				if c == '@' {
					open = i + 1
				}
				end := matchParen(raw, open, shell)
				unresolved = true
				if end < 0 {
					i = len(raw)
				} else {
					i = end + 1
				}
			case c == '~' && text.Len() == 0 && !quoted && (i+1 >= len(raw) || raw[i+1] == '\\' || raw[i+1] == '/' || isGuardSpace(raw[i+1], shell)):
				text.WriteString(st.ctx.Home)
				i++
			default:
				text.WriteByte(c)
				i++
			}
		}
		i = clampLen(raw, i)
		out = append(out, guardWord{text: text.String(), raw: raw[start:i], start: start, end: i, quoted: quoted, unresolved: unresolved, pipeItem: pipeItem})
	}
	kept := []guardWord{}
	for j := 0; j < len(out); j++ {
		w := out[j]
		if !w.quoted && redirectOnlyRe.MatchString(w.raw) {
			j++
			continue
		}
		if !w.quoted && redirectRe.MatchString(w.raw) {
			continue
		}
		kept = append(kept, w)
	}
	return kept
}

func isAlnum(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// ------------------------------------------------------- command shapes

func commandName(text string) string {
	n := strings.ToLower(text)
	cut := strings.LastIndex(n, "/")
	if b := strings.LastIndex(n, `\`); b > cut {
		cut = b
	}
	if cut >= 0 {
		n = n[cut+1:]
	}
	return exeSuffixRe.ReplaceAllString(n, "")
}

func inList(s string, list ...string) bool {
	for _, x := range list {
		if s == x {
			return true
		}
	}
	return false
}

func skipPrefixes(ws []guardWord, shell shellKind) int {
	k := 0
	for k < len(ws) {
		w := ws[k]
		if w.quoted {
			return k
		}
		t := strings.ToLower(w.text)
		if shell == shellCmd {
			switch {
			case inList(t, "@", "call", "else", "do"):
				k++
			case strings.HasPrefix(t, "@"):
				ws[k].text = ws[k].text[1:]
			case t == "start":
				k++
				if k < len(ws) && ws[k].quoted {
					k++
				}
				for k < len(ws) && strings.HasPrefix(ws[k].text, "/") {
					k++
				}
			case t == "if":
				k++
				if k < len(ws) && strings.ToLower(ws[k].text) == "/i" {
					k++
				}
				if k < len(ws) && strings.ToLower(ws[k].text) == "not" {
					k++
				}
				kind := ""
				if k < len(ws) {
					kind = strings.ToLower(ws[k].text)
				}
				switch {
				case inList(kind, "exist", "defined", "errorlevel", "cmdextversion"):
					k += 2
				case k+1 < len(ws) && inList(strings.ToLower(ws[k+1].text), "==", "equ", "neq", "lss", "leq", "gtr", "geq"):
					k += 3
				case k < len(ws) && strings.Contains(ws[k].raw, "=="):
					k++
				default:
					k += 2
				}
			case t == "for":
				d := -1
				for j := k + 1; j < len(ws); j++ {
					if strings.ToLower(ws[j].text) == "do" {
						d = j
						break
					}
				}
				if d < 0 {
					return len(ws)
				}
				k = d + 1
			default:
				return k
			}
			continue
		}
		if shell == shellPS {
			if inList(t, "&", ".", "if", "elseif", "else", "foreach", "while", "do", "try", "finally", "until", "}", "{") {
				k++
				continue
			}
			return k
		}
		switch {
		case assignRe.MatchString(w.raw):
			k++
		case t == "sudo" || t == "doas":
			k++
			for k < len(ws) && strings.HasPrefix(ws[k].text, "-") {
				if inList(ws[k].text, "-u", "-g", "-h", "-p", "-c", "-r", "-t") {
					k += 2
				} else {
					k++
				}
			}
		case t == "env":
			k++
			for k < len(ws) && (strings.HasPrefix(ws[k].text, "-") || strings.Contains(ws[k].text, "=")) {
				k++
			}
		case t == "timeout":
			k += 2
		case inList(t, "command", "builtin", "exec", "nohup", "time", "nice", "ionice", "stdbuf", "caffeinate", "npx", "pnpx", "bunx", "then", "do", "else", "elif", "if", "while", "until", "!", "{", "}"):
			k++
			for k < len(ws) && !ws[k].quoted && strings.HasPrefix(ws[k].text, "-") && ws[k].text != "-" {
				k++
			}
		default:
			return k
		}
	}
	return k
}

func nestedShellOf(name string) (shellKind, bool) {
	switch name {
	case "cmd":
		return shellCmd, true
	case "powershell", "pwsh":
		return shellPS, true
	case "bash", "sh", "zsh", "dash", "ksh":
		return shellSh, true
	}
	return 0, false
}

func rejoin(ws []guardWord) string {
	parts := make([]string, len(ws))
	for i, w := range ws {
		if strings.ContainsAny(w.text, " \t\n\r\f\v") {
			parts[i] = `"` + w.text + `"`
		} else {
			parts[i] = w.text
		}
	}
	return strings.Join(parts, " ")
}

func stripOuterQuotes(s string) string {
	t := strings.TrimSpace(s)
	if strings.HasPrefix(t, `"`) {
		if last := strings.LastIndex(t, `"`); last > 0 {
			return t[1:last] + t[last+1:]
		}
	}
	return t
}

type nested struct {
	script  string
	shell   shellKind
	hasFile bool
	file    string
}

func wordText(ws []guardWord, j int) string {
	if j < len(ws) {
		return ws[j].text
	}
	return ""
}

func nestedScript(ws []guardWord, k int, seg guardSegment, outer, inner shellKind) *nested {
	switch inner {
	case shellCmd:
		for j := k + 1; j < len(ws); j++ {
			t := strings.ToLower(ws[j].text)
			if strings.HasPrefix(t, "/c") || strings.HasPrefix(t, "/k") {
				if outer == shellCmd {
					return &nested{script: stripOuterQuotes(seg.raw[clampLen(seg.raw, ws[j].start+2):]), shell: shellCmd}
				}
				return &nested{script: strings.TrimSpace(ws[j].text[2:] + " " + rejoin(ws[j+1:])), shell: shellCmd}
			}
			if !strings.HasPrefix(t, "/") {
				return nil
			}
		}
		return nil
	case shellPS:
		valued := []string{"-executionpolicy", "-ep", "-ex", "-windowstyle", "-w", "-inputformat", "-outputformat", "-of", "-configurationname", "-workingdirectory", "-wd", "-settingsfile", "-custompipename", "-version", "-psconsolefile"}
		for j := k + 1; j < len(ws); j++ {
			t := strings.ToLower(ws[j].text)
			if len(t) >= 2 && strings.HasPrefix("-command", t) {
				if outer == shellCmd {
					return &nested{script: stripOuterQuotes(seg.raw[ws[j].end:]), shell: shellPS}
				}
				return &nested{script: rejoin(ws[j+1:]), shell: shellPS}
			}
			if (len(t) >= 2 && strings.HasPrefix("-encodedcommand", t)) || t == "-ec" {
				encoded := wordText(ws, j+1)
				decoded, ok := decodeUTF16Base64(encoded)
				if encoded == "" || !base64Re.MatchString(encoded) || !ok {
					ambiguousTarget("undecodable -EncodedCommand")
				}
				return &nested{script: decoded, shell: shellPS}
			}
			if len(t) >= 2 && strings.HasPrefix("-file", t) {
				return &nested{shell: shellPS, hasFile: j+1 < len(ws), file: wordText(ws, j+1)}
			}
			if strings.HasPrefix(t, "-") {
				if inList(t, valued...) {
					j++
				}
				continue
			}
			if outer == shellCmd {
				return &nested{script: stripOuterQuotes(seg.raw[ws[j].start:]), shell: shellPS}
			}
			return &nested{script: rejoin(ws[j:]), shell: shellPS}
		}
		return nil
	}
	for j := k + 1; j < len(ws); j++ {
		t := ws[j].text
		if shDashCRe.MatchString(t) && !strings.HasPrefix(t, "--") {
			return &nested{script: wordText(ws, j+1), shell: shellSh}
		}
		if strings.HasPrefix(t, "-") {
			continue
		}
		return &nested{shell: shellSh, hasFile: true, file: t}
	}
	return nil
}

func decodeUTF16Base64(encoded string) (string, bool) {
	// cmd.exe tokenization may drop trailing "=" padding; accept it either way.
	b, err := base64.RawStdEncoding.DecodeString(strings.TrimRight(encoded, "="))
	if err != nil || len(b)%2 != 0 {
		return "", false
	}
	units := make([]uint16, len(b)/2)
	for i := range units {
		units[i] = uint16(b[2*i]) | uint16(b[2*i+1])<<8
	}
	s := string(utf16.Decode(units))
	return s, !strings.ContainsRune(s, '�')
}

func psTargets(ws []guardWord, from int) []guardWord {
	out := []guardWord{}
	for j := from; j < len(ws); j++ {
		w := ws[j]
		if w.pipeItem || w.quoted || !strings.HasPrefix(w.text, "-") || w.text == "-" {
			out = append(out, w)
			continue
		}
		name := strings.ToLower(w.text[1:])
		inline, hasInline := "", false
		if colon := strings.Index(name, ":"); colon >= 0 {
			inline, hasInline = w.text[colon+2:], true
			name = name[:colon]
		}
		pathParam := (len(name) >= 1 && strings.HasPrefix("path", name)) || (len(name) >= 2 && (strings.HasPrefix("literalpath", name) || strings.HasPrefix("pspath", name))) || name == "lp"
		valueParam := false
		if len(name) >= 2 {
			for _, x := range []string{"filter", "include", "exclude", "credential", "stream"} {
				if strings.HasPrefix(x, name) {
					valueParam = true
				}
			}
		}
		if pathParam {
			if hasInline {
				w.text = inline
				out = append(out, w)
			} else if j+1 < len(ws) {
				j++
				out = append(out, ws[j])
			}
			continue
		}
		if valueParam && !hasInline {
			j++
		}
	}
	return out
}

func posixTargets(ws []guardWord, from int) []guardWord {
	out := []guardWord{}
	options := true
	for j := from; j < len(ws); j++ {
		w := ws[j]
		if options && !w.quoted && w.text == "--" {
			options = false
			continue
		}
		if options && !w.quoted && strings.HasPrefix(w.text, "-") && len(w.text) > 1 {
			continue
		}
		out = append(out, w)
	}
	return out
}

func cmdTargets(ws []guardWord, from int) []guardWord {
	out := []guardWord{}
	for _, w := range ws[min(from, len(ws)):] {
		if w.quoted || !strings.HasPrefix(w.text, "/") {
			out = append(out, w)
		}
	}
	return out
}

func listingTargets(info *segInfo) []guardWord {
	if info == nil || info.k >= len(info.words) {
		return nil
	}
	ws, k := info.words, info.k
	name := commandName(ws[k].text)
	dot := []guardWord{{text: ".", raw: "."}}
	if inList(name, "get-childitem", "gci", "ls", "dir", "get-item", "gi") {
		found := []guardWord{}
		if info.shell == shellPS {
			for _, w := range psTargets(ws, k+1) {
				if !w.pipeItem {
					found = append(found, w)
				}
			}
		} else {
			for _, w := range ws[k+1:] {
				if w.quoted || (!strings.HasPrefix(w.text, "-") && !(info.shell == shellCmd && strings.HasPrefix(w.text, "/"))) {
					found = append(found, w)
				}
			}
		}
		if len(found) == 0 {
			return dot
		}
		return found
	}
	if name == "find" || name == "fd" {
		found := []guardWord{}
		for _, w := range ws[k+1:] {
			if !w.quoted && (strings.HasPrefix(w.text, "-") || w.text == "(" || w.text == "!") {
				break
			}
			found = append(found, w)
		}
		if len(found) == 0 {
			return dot
		}
		return found
	}
	return nil
}

// ---------------------------------------------------------------- analysis

// resolveTarget returns the absolute path a delete would reach; ok=false means
// the target is not a filesystem path (PowerShell registry or env drives).
func resolveTarget(w guardWord, st *guardState, shell shellKind) (string, bool) {
	win := st.ctx.Platform == "win32"
	if w.unresolved {
		ambiguousTarget("unexpanded variable or command substitution in " + strconv.Quote(w.raw))
	}
	t := w.text
	if strings.TrimSpace(t) == "" {
		ambiguousTarget("empty path")
	}
	if strings.Contains(t, `"`) {
		ambiguousTarget("a quote character became part of the path " + strconv.Quote(w.raw))
	}
	if win {
		t = strings.ReplaceAll(t, "/", `\`)
		if shell == shellPS {
			t = providerRe.ReplaceAllString(t, "")
			if psDriveRe.MatchString(t) {
				return "", false
			}
		}
		switch {
		case uncLongRe.MatchString(t):
			t = `\\` + t[8:]
		case longDriveRe.MatchString(t):
			t = t[4:]
		case deviceRe.MatchString(t):
			ambiguousTarget("device namespace path " + strconv.Quote(w.raw))
		}
	}
	// Deleting a wildcard is judged by the folder whose contents it matches.
	wildChars := "*?"
	if shell == shellPS {
		wildChars = "*?["
	}
	if wild := strings.IndexAny(t, wildChars); wild >= 0 {
		before := t[:wild]
		sep := "/"
		if win {
			sep = `\`
		}
		if sepAt := strings.LastIndex(before, sep); sepAt >= 0 {
			t = t[:sepAt+1]
		} else if win && driveRe.MatchString(before) {
			t = before[:2]
		} else {
			t = "."
		}
	}
	var abs string
	if win {
		switch {
		case strings.HasPrefix(t, `\\`), driveAbsRe.MatchString(t):
			abs = normWin(t)
		case driveRe.MatchString(t):
			if !st.cwdKnown || len(st.cwd) < 2 || !strings.EqualFold(st.cwd[:2], t[:2]) {
				ambiguousTarget("drive-relative path " + strconv.Quote(w.raw))
			}
			abs = joinGuardPath(true, st.cwd, t[2:])
		case strings.HasPrefix(t, `\`):
			if !st.cwdKnown || !driveRe.MatchString(st.cwd) {
				ambiguousTarget("root-relative path with an unknown current drive")
			}
			abs = normWin(st.cwd[:2] + t)
		default:
			if !st.cwdKnown {
				ambiguousTarget("relative path after the working directory changed to an unknown location")
			}
			abs = joinGuardPath(true, st.cwd, t)
		}
		if shortNameRe.MatchString(abs) {
			long, ok := expandShortNames(abs)
			if !ok {
				ambiguousTarget("unresolvable 8.3 short name " + strconv.Quote(w.raw))
			}
			abs = long
		}
		return abs, true
	}
	if strings.HasPrefix(t, "/") {
		return normPosix(t), true
	}
	if !st.cwdKnown {
		ambiguousTarget("relative path after the working directory changed to an unknown location")
	}
	return joinGuardPath(false, st.cwd, t), true
}

func checkTargets(targets []guardWord, st *guardState, shell shellKind) {
	for _, w := range targets {
		abs, ok := resolveTarget(w, st, shell)
		if !ok {
			continue
		}
		if reason := ProtectedDeleteReason(st.ctx, abs); reason != "" {
			panic(guardRefusal{reason})
		}
	}
}

func checkInline(code string, st *guardState, re *regexp.Regexp) {
	for _, m := range re.FindAllStringSubmatchIndex(code, -1) {
		literal, found := "", false
		for g := 1; 2*g+1 < len(m); g++ {
			if m[2*g] >= 0 {
				literal, found = code[m[2*g]:m[2*g+1]], true
				break
			}
		}
		whole := code[m[0]:m[1]]
		if !found {
			ambiguousTarget("a computed path in " + strconv.Quote(whole))
		}
		after := strings.TrimLeft(code[m[1]:], " \t\n\r\f\v")
		if after != "" && strings.IndexByte("+.%", after[0]) >= 0 {
			ambiguousTarget("a concatenated path in " + strconv.Quote(whole))
		}
		checkTargets([]guardWord{{text: literal, raw: literal, quoted: true}}, st, shellSh)
	}
}

func readGuardScript(file string, st *guardState, shell shellKind) (script string, ok bool) {
	if file == "" {
		return "", false
	}
	defer func() {
		if r := recover(); r != nil {
			if _, isRefusal := r.(guardRefusal); !isRefusal {
				panic(r)
			}
			script, ok = "", false
		}
	}()
	abs, found := resolveTarget(guardWord{text: file, raw: file, quoted: true}, st, shell)
	if !found {
		return "", false
	}
	info, err := os.Stat(abs)
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxScriptBytes {
		return "", false
	}
	b, err := os.ReadFile(abs)
	if err != nil {
		return "", false
	}
	return string(b), true
}

func scriptShellFor(name string) (shellKind, bool) {
	switch {
	case strings.HasSuffix(name, ".ps1"):
		return shellPS, true
	case strings.HasSuffix(name, ".bat"), strings.HasSuffix(name, ".cmd"):
		return shellCmd, true
	case strings.HasSuffix(name, ".sh"):
		return shellSh, true
	}
	return 0, false
}

func (st *guardState) child(freshVars bool) *guardState {
	vars := map[string]*string{}
	if !freshVars {
		for k, v := range st.vars {
			vars[k] = v
		}
	}
	return &guardState{ctx: st.ctx, cwd: st.cwd, cwdKnown: st.cwdKnown, vars: vars, depth: st.depth + 1}
}

func analyzeShell(src string, shell shellKind, st *guardState) {
	if st.depth > maxGuardDepth {
		if deleteMention.MatchString(src) {
			ambiguousTarget("too many nested shell layers")
		}
		return
	}
	segments, unbalanced := splitSegments(src, shell)
	if unbalanced && deleteMention.MatchString(src) {
		ambiguousTarget("unbalanced quotes")
	}
	var last *segInfo
	for _, seg := range segments {
		ws := guardWords(seg, shell, st)
		var upstream *segInfo
		if seg.sep == "|" {
			upstream = last
		} else if seg.sep == "{" && last != nil {
			upstream = last.upstream
		}
		if shell == shellPS {
			checkInline(seg.raw, st, dotnetDelete)
		}
		// Variable assignments used by later segments: NAME=value (sh), $name = value (ps).
		if shell == shellSh && len(ws) > 0 {
			all := true
			for _, w := range ws {
				if !assignRe.MatchString(w.raw) {
					all = false
					break
				}
			}
			if all {
				for _, w := range ws {
					eq := strings.Index(w.text, "=")
					if w.unresolved || eq < 0 {
						if eq >= 0 {
							st.vars[w.text[:eq]] = nil
						}
						continue
					}
					v := w.text[eq+1:]
					st.vars[w.text[:eq]] = &v
				}
				last = &segInfo{words: ws, k: len(ws), shell: shell, upstream: upstream}
				continue
			}
		}
		if shell == shellPS {
			if m := psAssignRe.FindStringSubmatch(seg.raw); m != nil {
				value := guardWords(guardSegment{raw: m[2]}, shell, st)
				if len(value) == 1 && !value[0].unresolved && !value[0].pipeItem {
					v := value[0].text
					st.vars[strings.ToLower(m[1])] = &v
				} else {
					st.vars[strings.ToLower(m[1])] = nil
				}
				last = &segInfo{words: ws, k: len(ws), shell: shell, upstream: upstream}
				continue
			}
		}
		k := skipPrefixes(ws, shell)
		info := &segInfo{words: ws, k: k, shell: shell, upstream: upstream}
		last = info
		if k >= len(ws) {
			continue
		}
		name := commandName(ws[k].text)
		piped := upstream != nil
		viaXargs := false
		// cmd.exe accepts switches glued to the builtin name: rd/s/q, del/q.
		if shell == shellCmd && !ws[k].quoted {
			if g := gluedCmdRe.FindStringSubmatch(ws[k].text); g != nil {
				name = strings.ToLower(g[1])
				extra := ws[k]
				extra.text, extra.raw = g[2], g[2]
				ws = append(ws[:k+1], append([]guardWord{extra}, ws[k+1:]...)...)
				info.words = ws
			}
		}
		if name == "xargs" {
			k++
			for k < len(ws) && strings.HasPrefix(ws[k].text, "-") {
				if xargsValueRe.MatchString(ws[k].text) {
					k += 2
				} else {
					k++
				}
			}
			if k >= len(ws) {
				continue
			}
			name = commandName(ws[k].text)
			piped, viaXargs = true, true
			info.k = k
		}
		if innerShell, ok := nestedShellOf(name); ok {
			inner := nestedScript(ws, k, seg, shell, innerShell)
			if inner == nil {
				continue
			}
			script := inner.script
			if inner.hasFile {
				var found bool
				if script, found = readGuardScript(inner.file, st, shell); !found {
					continue
				}
			}
			if shell != shellSh && strings.Contains(seg.raw[ws[k].start:], `\"`) && deleteMention.MatchString(script) {
				ambiguousTarget(`\" escaped quotes inside a nested ` + name + ` command; cmd.exe and PowerShell do not treat \" as an escape`)
			}
			analyzeShell(script, inner.shell, st.child(false))
			continue
		}
		if fileShell, ok := scriptShellFor(strings.ToLower(ws[k].text)); ok {
			if script, found := readGuardScript(ws[k].text, st, shell); found {
				analyzeShell(script, fileShell, st.child(true))
			}
			continue
		}
		if inList(name, "cd", "chdir", "pushd", "set-location", "sl", "push-location") {
			var args []guardWord
			if shell == shellPS {
				args = psTargets(ws, k+1)
			} else {
				for _, w := range ws[k+1:] {
					if w.quoted || (!(strings.HasPrefix(w.text, "/") && shell == shellCmd && len(w.text) == 2) && !(shell == shellSh && strings.HasPrefix(w.text, "-"))) {
						args = append(args, w)
					}
				}
			}
			if len(args) == 0 {
				if shell == shellSh {
					st.cwd, st.cwdKnown = st.ctx.Home, true
				}
				continue
			}
			if args[0].text == "-" && shell != shellCmd {
				st.cwd, st.cwdKnown = "", false
				continue
			}
			st.cwd, st.cwdKnown = resolveCwd(args[0], st, shell)
			continue
		}
		if inList(name, "popd", "pop-location") {
			st.cwd, st.cwdKnown = "", false
			continue
		}
		if shell == shellPS && inList(name, "start-process", "saps", "invoke-expression", "iex", "invoke-command", "icm") {
			if deleteMention.MatchString(seg.raw) {
				ambiguousTarget("deletion inside " + name)
			}
			continue
		}
		if inList(name, "python", "python3", "py", "node", "perl", "ruby", "deno", "bun") {
			for j := k + 1; j < len(ws); j++ {
				if inList(ws[j].text, "-c", "-e", "--eval", "-p", "--print", "eval") {
					checkInline(wordText(ws, j+1), st, inlineDelete)
					break
				}
			}
			continue
		}
		var targets []guardWord
		hasTargets := false
		switch {
		case shell == shellPS && inList(name, "remove-item", "ri", "rm", "rmdir", "del", "erase", "rd"):
			targets, hasTargets = psTargets(ws, k+1), true
		case shell == shellCmd && inList(name, "rd", "rmdir", "del", "erase"):
			targets, hasTargets = cmdTargets(ws, k+1), true
		case inList(name, "rm", "rmdir", "unlink", "shred", "srm", "rimraf"):
			targets, hasTargets = posixTargets(ws, k+1), true
		case name == "find" && shell != shellCmd:
			deletes := false
			rest := ws[k+1:]
			for j, w := range rest {
				next := ""
				if j+1 < len(rest) {
					next = rest[j+1].text
				}
				if w.text == "-delete" || (inList(w.text, "-exec", "-execdir", "-ok", "-okdir") && inList(commandName(next), "rm", "rmdir", "unlink", "shred")) {
					deletes = true
				}
			}
			if deletes {
				targets = listingTargets(info)
				hasTargets = targets != nil
			}
		case name == "robocopy":
			for _, w := range ws[k+1:] {
				if mirRe.MatchString(w.text) {
					if pos := cmdTargets(ws, k+1); len(pos) > 1 {
						targets, hasTargets = []guardWord{pos[1]}, true
					}
					break
				}
			}
		case name == "rsync":
			for _, w := range ws[k+1:] {
				if strings.HasPrefix(w.text, "--delete") {
					pos := []guardWord{}
					for _, p := range posixTargets(ws, k+1) {
						if !remoteRe.MatchString(p.text) {
							pos = append(pos, p)
						}
					}
					if len(pos) > 0 {
						targets, hasTargets = []guardWord{pos[len(pos)-1]}, true
					}
					break
				}
			}
		}
		if !hasTargets {
			continue
		}
		hasPipeItem := false
		explicit := []guardWord{}
		for _, w := range targets {
			if w.pipeItem {
				hasPipeItem = true
			} else if w.text != "{}" || !piped {
				explicit = append(explicit, w)
			}
		}
		if piped {
			if viaXargs || len(explicit) == 0 || hasPipeItem {
				fromUpstream := listingTargets(upstream)
				if fromUpstream == nil {
					ambiguousTarget("pipeline input from a command whose paths are unknown")
				}
				targets = append(explicit, fromUpstream...)
			}
		} else if hasPipeItem {
			fromUpstream := listingTargets(upstream)
			if fromUpstream == nil {
				ambiguousTarget("$_ without a known pipeline source")
			}
			targets = append(explicit, fromUpstream...)
		}
		checkTargets(targets, st, shell)
	}
}

func resolveCwd(w guardWord, st *guardState, shell shellKind) (cwd string, known bool) {
	defer func() {
		if r := recover(); r != nil {
			if _, isRefusal := r.(guardRefusal); !isRefusal {
				panic(r)
			}
			cwd, known = "", false
		}
	}()
	return resolveTarget(w, st, shell)
}

// FindDangerousDelete returns why the command must not run, or "". Only deletion
// is judged here; the other catastrophic-command rules live in guards.json.
func FindDangerousDelete(command string, ctx DeleteGuardContext) (reason string) {
	win := ctx.Platform == "win32"
	st := &guardState{ctx: ctx, vars: map[string]*string{}}
	if ctx.Cwd != "" {
		st.cwdKnown = true
		if win {
			st.cwd = normWin(ctx.Cwd)
		} else {
			st.cwd = normPosix(ctx.Cwd)
		}
	}
	shell := shellSh
	if win {
		shell = shellCmd
	}
	defer func() {
		if r := recover(); r != nil {
			refusal, ok := r.(guardRefusal)
			if !ok {
				panic(r)
			}
			reason = refusal.msg
		}
	}()
	analyzeShell(command, shell, st)
	return ""
}

// LocalDeleteGuardContext describes this device: platform, home, environment
// and the working directory a command will start in ("" = this process's).
func LocalDeleteGuardContext(cwd string) DeleteGuardContext {
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	home, _ := os.UserHomeDir()
	env := map[string]string{}
	for _, kv := range os.Environ() {
		if eq := strings.Index(kv, "="); eq > 0 {
			env[kv[:eq]] = kv[eq+1:]
		}
	}
	return DeleteGuardContext{Platform: platform, Cwd: cwd, Home: home, Env: env}
}

// expandShortNames replaces 8.3 names (ADMINI~1) with long names by resolving the
// nearest existing ancestor; the not-yet-existing remainder is kept as written.
func expandShortNames(abs string) (string, bool) {
	rest := []string{}
	for dir := abs; ; {
		if real, err := filepath.EvalSymlinks(dir); err == nil {
			long := normWin(real + `\` + strings.Join(rest, `\`))
			return long, !shortNameRe.MatchString(long)
		}
		parent := parentOf(true, dir)
		if parent == dir {
			return "", false
		}
		rest = append([]string{dir[strings.LastIndex(dir, `\`)+1:]}, rest...)
		dir = parent
	}
}
