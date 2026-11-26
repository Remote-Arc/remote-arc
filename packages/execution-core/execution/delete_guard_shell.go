package execution

// POSIX shell constructs the Safety Guard reads beyond plain commands: heredoc
// bodies, command substitutions, and the environment a new process inherits.
// The rule throughout is that text which runs is inspected and text that is
// only data is not; when the guard cannot tell, it inspects.

import (
	"regexp"
	"strings"
)

// heredoc is one `<<WORD` body. quoted is true when any part of WORD was
// quoted, which makes the body literal: no expansion or substitution runs.
type heredoc struct {
	delim  string
	strip  bool
	quoted bool
	body   string
	owner  int
}

var (
	shNoExecRe    = regexp.MustCompile(`^-[A-Za-z]*n[A-Za-z]*$`)
	shOptValueRe  = regexp.MustCompile(`^[-+][A-Za-z]*[oO]$`)
	stdinRedirRe  = regexp.MustCompile(`^\d?<$`)
	stdinInlineRe = regexp.MustCompile(`^\d?<[^<&(]`)
)

// Interpreters whose stdin is code. Shells are found with nestedShellOf.
var codeInterpreters = []string{"python", "python3", "py", "node", "perl", "ruby", "deno", "bun"}

// parseHeredocOperator reads `<<WORD` or `<<-WORD` at src[at]. It returns the
// heredoc and the index after WORD, or end == at when there is no valid WORD.
func parseHeredocOperator(src string, at int) (heredoc, int) {
	doc := heredoc{}
	i := at + 2
	if charAt(src, i) == '-' {
		doc.strip = true
		i++
	}
	for i < len(src) && (src[i] == ' ' || src[i] == '\t') {
		i++
	}
	var word strings.Builder
	for i < len(src) {
		c := src[i]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' || strings.IndexByte(";|&<>()", c) >= 0 {
			break
		}
		switch c {
		case '\\':
			doc.quoted = true
			if i+1 < len(src) {
				word.WriteByte(src[i+1])
			}
			i += 2
		case '\'', '"':
			end := indexFrom(src, string(c), i+1)
			if end < 0 {
				return doc, at
			}
			doc.quoted = true
			word.WriteString(src[i+1 : end])
			i = end + 1
		default:
			word.WriteByte(c)
			i++
		}
	}
	doc.delim = word.String()
	if doc.delim == "" {
		return doc, at
	}
	return doc, i
}

// readHeredocBodies fills each pending body from the lines starting at from and
// returns the index of the newline (or end) after the last delimiter line.
// complete is false when a delimiter line is missing; the caller then leaves
// the text in place, so it is inspected as commands.
func readHeredocBodies(src string, from int, pending []heredoc) (next int, complete bool) {
	pos := from
	for d := range pending {
		var body strings.Builder
		found := false
		for pos <= len(src) {
			end := indexFrom(src, "\n", pos)
			if end < 0 {
				end = len(src)
			}
			line := src[pos:end]
			if pending[d].strip {
				line = strings.TrimLeft(line, "\t")
			}
			if line == pending[d].delim {
				found = true
				pos = end
				break
			}
			body.WriteString(line)
			body.WriteByte('\n')
			pos = end + 1
		}
		if !found {
			return from, false
		}
		pending[d].body = body.String()
		if d < len(pending)-1 {
			pos++
		}
	}
	return pos, true
}

// matchBrace returns the index of the bracket closing src[open] ({ or [),
// counting nested ${ and $[, or -1.
func matchBrace(src string, open int) int {
	closer := byte('}')
	if src[open] == '[' {
		closer = ']'
	}
	depth := 0
	for i := open; i < len(src); i++ {
		switch c := src[i]; {
		case c == '\\':
			i++
		case c == src[open]:
			depth++
		case c == closer:
			depth--
			if depth == 0 {
				return i
			}
		case c == '\'' || c == '"':
			end := skipQuoted(src, i, shellSh)
			if end < 0 {
				return -1
			}
			i = end
		}
	}
	return -1
}

// commandSubstitutions returns the text of each $(...) and `...` that runs when
// src is expanded. Single-quoted text is skipped unless inDoc is true: inside an
// unquoted heredoc body, quote characters are literal.
func commandSubstitutions(src string, inDoc bool) []string {
	out := []string{}
	inDouble := false
	for i := 0; i < len(src); i++ {
		c := src[i]
		switch {
		case c == '\\':
			i++
		case c == '\'' && !inDouble && !inDoc:
			end := indexFrom(src, "'", i+1)
			if end < 0 {
				return out
			}
			i = end
		case c == '"' && !inDoc:
			inDouble = !inDouble
		case c == '$' && charAt(src, i+1) == '(':
			end := matchParen(src, i+1, shellSh)
			if end < 0 {
				// Unbalanced: let the shell analysis see the rest as commands.
				out = append(out, src[i+2:])
				return out
			}
			out = append(out, src[i+2:end])
			i = end
		case c == '`':
			end := indexFrom(src, "`", i+1)
			if end < 0 {
				out = append(out, src[i+1:])
				return out
			}
			out = append(out, strings.ReplaceAll(src[i+1:end], "\\`", "`"))
			i = end
		}
	}
	return out
}

// process is the state a new process starts with: the variables in its
// environment (exported ones, or ones the shell inherited and reassigned) plus
// the NAME=value assignments written before its command.
func (st *guardState) process(prefix []guardWord) *guardState {
	c := st.child(true)
	for name, v := range st.vars {
		if st.exported[name] || lookupGuardEnv(st.ctx, name) != "" {
			c.vars[name] = v
			c.exported[name] = true
		}
	}
	for _, w := range prefix {
		if name, value, ok := assignment(w, true, st); ok {
			c.vars[name] = value
			c.exported[name] = true
		}
	}
	return c
}

// assignment reads NAME=value. value is nil when it cannot be resolved. With
// rawOnly, only unquoted NAME= text counts, as for a shell assignment word.
// An unquoted ~ that starts the value is the home folder, as in the shell.
func assignment(w guardWord, rawOnly bool, st *guardState) (name string, value *string, ok bool) {
	if rawOnly && !assignRe.MatchString(w.raw) {
		return "", nil, false
	}
	eq := strings.Index(w.text, "=")
	if eq < 0 || !fullIdentRe.MatchString(w.text[:eq]) {
		return "", nil, false
	}
	name = w.text[:eq]
	if w.unresolved {
		return name, nil, true
	}
	v := w.text[eq+1:]
	if rawEq := strings.Index(w.raw, "="); rawEq >= 0 && strings.HasPrefix(w.raw[rawEq+1:], "~") {
		rest := w.raw[rawEq+2:]
		if rest != "" && rest[0] != '/' && rest[0] != ':' {
			// ~user is another account's home, which the guard cannot look up.
			return name, nil, true
		}
		v = st.ctx.Home + strings.TrimPrefix(v, "~")
	}
	return name, &v, true
}

// trackShVariables applies export, declare, typeset, local, readonly and unset
// to the variables later commands and scripts will see. It reports whether the
// command was one of them.
func trackShVariables(name string, args []guardWord, st *guardState) bool {
	switch name {
	case "export", "declare", "typeset", "local", "readonly":
		exported := name == "export"
		for _, w := range args {
			if !w.quoted && (strings.HasPrefix(w.text, "-") || strings.HasPrefix(w.text, "+")) {
				if name != "export" && w.text[0] == '-' && strings.Contains(w.text, "x") {
					exported = true
				}
				continue
			}
			v, value, ok := assignment(w, false, st)
			if !ok {
				if !fullIdentRe.MatchString(w.text) {
					continue
				}
				v = w.text
				if name == "local" {
					st.vars[v] = nil
				}
			} else {
				st.vars[v] = value
			}
			if exported {
				st.exported[v] = true
			}
		}
		return true
	case "unset":
		for _, w := range args {
			if w.text == "-f" {
				return true
			}
			if fullIdentRe.MatchString(w.text) {
				st.vars[w.text] = nil
			}
		}
		return true
	}
	return false
}

// shScriptArgs reads a POSIX shell's options. It returns the -c script or the
// script file; noexec (-n, -o noexec) means nothing is run.
func shScriptArgs(ws []guardWord, k int) (inner *nested, noexec bool) {
	for j := k + 1; j < len(ws); j++ {
		t := ws[j].text
		if t == "--" {
			if j+1 < len(ws) {
				return &nested{shell: shellSh, hasFile: true, file: ws[j+1].text}, noexec
			}
			return nil, noexec
		}
		if shNoExecRe.MatchString(t) && !strings.HasPrefix(t, "--") {
			noexec = true
		}
		if shDashCRe.MatchString(t) && !strings.HasPrefix(t, "--") {
			return &nested{script: wordText(ws, j+1), shell: shellSh}, noexec
		}
		if shOptValueRe.MatchString(t) || inList(t, "--rcfile", "--init-file") {
			if strings.EqualFold(wordText(ws, j+1), "noexec") {
				noexec = true
			}
			j++
			continue
		}
		if strings.HasPrefix(t, "-") || strings.HasPrefix(t, "+") {
			continue
		}
		return &nested{shell: shellSh, hasFile: true, file: t}, noexec
	}
	return nil, noexec
}

// stdinSource returns what a command reads as stdin: a file through `< file`,
// or the text of a `<<< word` here-string (hereString true).
func stdinSource(seg guardSegment, st *guardState) (w guardWord, hereString, ok bool) {
	all := allGuardWords(seg, shellSh, st)
	for j, w := range all {
		if w.quoted && !strings.HasPrefix(w.raw, "<<<") {
			continue
		}
		switch {
		case w.raw == "<<<" && j+1 < len(all):
			return all[j+1], true, true
		case strings.HasPrefix(w.raw, "<<<"):
			w.text, w.raw = strings.TrimPrefix(w.text, "<<<"), w.raw[3:]
			return w, true, true
		case stdinRedirRe.MatchString(w.raw) && j+1 < len(all):
			return all[j+1], false, true
		case stdinInlineRe.MatchString(w.raw):
			cut := strings.IndexByte(w.text, '<') + 1
			w.text, w.raw = w.text[cut:], w.raw[cut:]
			return w, false, true
		}
	}
	return guardWord{}, false, false
}

// stdinCode returns the shell that runs text written to this command's stdin,
// or ok=false when the command treats stdin as data.
func stdinCode(name string) (shell shellKind, inline, ok bool) {
	if s, isShell := nestedShellOf(name); isShell {
		return s, false, true
	}
	if inList(name, "eval", "source", ".") {
		return shellSh, false, true
	}
	if inList(name, codeInterpreters...) {
		return shellSh, true, true
	}
	return 0, false, false
}

// checkHeredocs inspects the heredoc bodies of segment index si. A body is code
// when its command, or a later command in the same pipeline, runs stdin as code;
// otherwise only an unquoted body's command substitutions run.
func checkHeredocs(segments []guardSegment, si int, ws []guardWord, k int, st *guardState) {
	seg := segments[si]
	if len(seg.heredocs) == 0 {
		return
	}
	consumers := []string{}
	if k < len(ws) {
		consumers = append(consumers, commandName(ws[k].text))
	}
	for j := si + 1; j < len(segments) && segments[j].sep == "|"; j++ {
		next := guardWords(segments[j], shellSh, st)
		if nk := skipPrefixes(next, shellSh); nk < len(next) {
			consumers = append(consumers, commandName(next[nk].text))
		}
	}
	for _, doc := range seg.heredocs {
		code := false
		for _, name := range consumers {
			shell, inline, ok := stdinCode(name)
			if !ok {
				continue
			}
			code = true
			if inline {
				checkInline(doc.body, st, inlineDelete)
				continue
			}
			// An unquoted body is expanded by this shell before the next one reads it.
			inner := st.process(ws[:k])
			if !doc.quoted {
				inner = st.child(false)
			}
			analyzeShell(doc.body, shell, inner)
		}
		if !code && !doc.quoted {
			for _, sub := range commandSubstitutions(doc.body, true) {
				analyzeShell(sub, shellSh, st.child(false))
			}
		}
	}
}

// analyzeNestedShell inspects a script run by `sh`, `bash`, `cmd` or `pwsh`.
// It is judged twice and refused if either view refuses: with the variables
// the new process really inherits, and with every variable of this shell, as
// earlier versions did, so tracking exports never makes the guard looser.
func analyzeNestedShell(script string, shell shellKind, st *guardState, prefix []guardWord) {
	inherited := st.child(false)
	for _, w := range prefix {
		if name, value, ok := assignment(w, true, st); ok {
			inherited.vars[name] = value
		}
	}
	analyzeShell(script, shell, inherited)
	analyzeShell(script, shell, st.process(prefix))
}

// skipHeredocs lets a scanner of sh text step over heredoc bodies: at a `<<`
// operator it records the heredoc, and at the end of that line it returns the
// index of the newline after the last body. Otherwise it returns i.
func skipHeredocs(src string, i int, pending *[]heredoc) int {
	c, n := src[i], charAt(src, i+1)
	if c == '<' && n == '<' && charAt(src, i+2) != '<' {
		if doc, end := parseHeredocOperator(src, i); end > i {
			*pending = append(*pending, doc)
			return end
		}
	}
	if c == '\n' && len(*pending) > 0 {
		next, complete := readHeredocBodies(src, i+1, *pending)
		*pending = (*pending)[:0]
		if complete {
			return next
		}
	}
	return i
}

// catIntoShell returns the script `cat file... | sh` runs, or nil when the
// upstream command is not cat of files the guard can read.
func catIntoShell(upstream *segInfo, shell shellKind, st *guardState) *nested {
	if upstream == nil || upstream.k >= len(upstream.words) || commandName(upstream.words[upstream.k].text) != "cat" {
		return nil
	}
	var script strings.Builder
	for _, w := range posixTargets(upstream.words, upstream.k+1) {
		text, found := readGuardScript(w.text, st, shellSh)
		if !found {
			return nil
		}
		script.WriteString(text)
		script.WriteByte('\n')
	}
	if script.Len() == 0 {
		return nil
	}
	return &nested{script: script.String(), shell: shell}
}

// narrowUnresolved reports whether an unresolved target in a sourced file may be
// let through. Sourced files are mostly function libraries (nvm.sh, venv
// activate) whose deletes may never run, so a target whose variable part is
// followed by a fixed, unprotected folder name ("$NVM_DIR/.cache") is allowed:
// whatever the variable holds, only that one named folder can go. A bare
// variable or substitution ("$X"), a wildcard ("$X"/*), and a fixed name that
// is a protected folder's name ("$X/.ssh") are still refused.
func narrowUnresolved(w guardWord, ctx DeleteGuardContext) bool {
	if !w.unresolved {
		return false
	}
	raw := strings.NewReplacer(`"`, "", "'", "").Replace(w.raw)
	raw = strings.TrimRight(raw, "/")
	cut := strings.LastIndex(raw, "/")
	if cut < 0 {
		return false
	}
	name := raw[cut+1:]
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "$`*?[](){}~\\") {
		return false
	}
	rules := rulesFor(ctx)
	for _, list := range [][]string{rules.ancestor, rules.inside, rules.homeParents, rules.mountParents} {
		for _, p := range list {
			base := p[strings.LastIndexAny(p, `/\`)+1:]
			if strings.EqualFold(base, name) {
				return false
			}
		}
	}
	return !strings.EqualFold(name, ".remotearc")
}
