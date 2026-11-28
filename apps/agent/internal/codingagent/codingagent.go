// Package codingagent keeps a person's coding agent (Claude Code) running on
// their computer for Agent Orchestration: one process per conversation, with
// stdin kept open so the next message and the answer to a permission question
// reach the same process, and every line it prints pushed to the Relay as it
// arrives.
//
// Claude Code runs as the Agent SDK runs it: -p with --input-format and
// --output-format stream-json and --permission-prompt-tool=stdio, so a tool
// call its permission mode does not allow arrives as a control_request
// (subtype can_use_tool) that waits for a control_response on stdin (checked
// against Claude Code 2.1.330). The process is started directly, never
// through a shell: the person's words, the permission rules and the session
// id are arguments or stdin lines, never parts of a command line.
package codingagent

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Tools are the Relay-only tools this package answers. The Relay calls them
// for the Dashboard; AI clients never see them.
var Tools = []string{"agent_session_start", "agent_session_input", "agent_session_read", "agent_session_stop"}

// Event is pushed to the Relay over the Agent's connection: the lines a
// session printed since From, and its exit once it has ended.
type Event struct {
	Type     string   `json:"type"`
	Session  string   `json:"session"`
	Tag      string   `json:"tag"`
	From     int      `json:"from"`
	Lines    []string `json:"lines"`
	Exited   bool     `json:"exited,omitempty"`
	ExitCode *int     `json:"exit_code,omitempty"`
	Stderr   string   `json:"stderr,omitempty"`
}

const (
	maxLines     = 4000    // lines kept per session for a Relay that missed a push
	maxLine      = 8 << 20 // the longest line read from the agent
	maxPrompt    = 100_000 // the longest message
	flushAfter   = 150 * time.Millisecond
	idleLimit    = 2 * time.Hour    // a session nobody used for this long is stopped
	keepExited   = 10 * time.Minute // an ended session can still be read this long
	stderrKeep   = 4000
	maxSessions  = 12
	eventsBuffer = 256
)

var (
	sessionRef = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	runTag     = regexp.MustCompile(`^ar_[0-9a-f]{12}$`)
	modes      = map[string]bool{"acceptEdits": true, "manual": true, "plan": true, "auto": true}
	// A model alias or name, and Claude Code's --effort levels (checked against 2.1.330).
	modelName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$`)
	efforts   = map[string]bool{"low": true, "medium": true, "high": true, "xhigh": true, "max": true}
)

type session struct {
	mu         sync.Mutex
	id, tag    string
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	lines      []string // lines[i] is line base+i
	base       int
	pushed     int // lines up to here were pushed
	exited     bool
	exitCode   int
	stderr     string
	lastActive time.Time
	exitedAt   time.Time
	flushing   bool
	// readers finish once the process's stdout and stderr are drained.
	readers sync.WaitGroup
}

func (s *session) next() int { return s.base + len(s.lines) }

// Manager holds the sessions on this computer.
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*session
	events   chan Event
	// Command makes the process for an agent; tests replace it.
	Command func(name string, args ...string) *exec.Cmd
	Now     func() time.Time
}

func New() *Manager {
	m := &Manager{sessions: map[string]*session{}, events: make(chan Event, eventsBuffer), Command: exec.Command, Now: time.Now}
	go m.janitor()
	return m
}

// Events delivers the pushes for the Relay.
func (m *Manager) Events() <-chan Event { return m.events }

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "as_" + hex.EncodeToString(b)
}

func str(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

// Call answers one of Tools.
func (m *Manager) Call(tool string, args map[string]any, p protocol.Policy) (any, error) {
	switch tool {
	case "agent_session_start":
		return m.start(args, p)
	case "agent_session_input":
		return m.input(args)
	case "agent_session_read":
		return m.read(args)
	case "agent_session_stop":
		return m.stop(args)
	}
	return nil, fmt.Errorf("unknown agent session tool %q", tool)
}

func (m *Manager) running() int {
	n := 0
	for _, s := range m.sessions {
		s.mu.Lock()
		if !s.exited {
			n++
		}
		s.mu.Unlock()
	}
	return n
}

func (m *Manager) start(args map[string]any, p protocol.Policy) (any, error) {
	if agent := str(args, "agent"); agent != "claude" {
		return nil, fmt.Errorf("agent_session_start runs Claude Code only, not %q", agent)
	}
	tag, ref, mode, prompt := str(args, "tag"), str(args, "session_ref"), str(args, "mode"), str(args, "prompt")
	if !runTag.MatchString(tag) || !sessionRef.MatchString(ref) || !modes[mode] {
		return nil, errors.New("agent_session_start needs a run tag, a session id that is a UUID and a known mode")
	}
	if strings.TrimSpace(prompt) == "" || len(prompt) > maxPrompt {
		return nil, fmt.Errorf("the message must be 1 to %d characters", maxPrompt)
	}
	cwd, err := policy.Enforce(str(args, "cwd"), p, true)
	if err != nil {
		return nil, err
	}
	// What the person always allows, and the computer's protected paths that
	// Claude Code refuses in every mode (Relay's agent-protected-paths.ts).
	allow, deny := rules(args, "allow"), rules(args, "deny")
	permissions := map[string]any{"allow": allow}
	if len(deny) > 0 {
		permissions["deny"] = deny
	}
	settings, _ := json.Marshal(map[string]any{"permissions": permissions})
	m.mu.Lock()
	limit := maxSessions
	if p.BackgroundTaskLimit > 0 && p.BackgroundTaskLimit < limit {
		limit = p.BackgroundTaskLimit
	}
	if m.running() >= limit {
		m.mu.Unlock()
		return nil, fmt.Errorf("BACKGROUND_TASK_LIMIT: this computer already runs %d agent sessions, the most its plan allows at once", limit)
	}
	m.mu.Unlock()
	model, effort := str(args, "model"), str(args, "effort")
	if (model != "" && !modelName.MatchString(model)) || (effort != "" && !efforts[effort]) {
		return nil, errors.New("agent_session_start needs a model name of letters, digits and . _ : - and a known effort level")
	}
	argv := []string{"-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
		"--permission-prompt-tool=stdio", "--permission-mode", mode, "--settings", string(settings)}
	if model != "" {
		argv = append(argv, "--model", model)
	}
	if effort != "" {
		argv = append(argv, "--effort", effort)
	}
	if args["resume"] == true {
		argv = append(argv, "--resume", ref)
	} else {
		argv = append(argv, "--session-id", ref)
	}
	cmd := m.Command(findAgent("claude"), argv...)
	cmd.Dir = cwd
	prepare(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("Claude Code did not start: %w (is it installed on this computer?)", err)
	}
	s := &session{id: newID(), tag: tag, cmd: cmd, stdin: stdin, lastActive: m.Now()}
	m.mu.Lock()
	m.sessions[s.id] = s
	m.mu.Unlock()
	s.readers.Add(2)
	go func() { defer s.readers.Done(); m.readOut(s, stdout) }()
	go func() { defer s.readers.Done(); m.readErr(s, stderr) }()
	go m.wait(s)
	// As the Agent SDK does: initialize, then the first message.
	if err := m.write(s, map[string]any{"type": "control_request", "request_id": "init-" + s.id, "request": map[string]any{"subtype": "initialize"}}); err != nil {
		return nil, err
	}
	if err := m.write(s, userMessage(prompt)); err != nil {
		return nil, err
	}
	return map[string]any{"session": s.id, "pid": cmd.Process.Pid}, nil
}

func userMessage(text string) map[string]any {
	return map[string]any{"type": "user", "message": map[string]any{"role": "user", "content": text}, "parent_tool_use_id": nil, "session_id": ""}
}

func (m *Manager) get(args map[string]any) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.sessions[str(args, "session")]
	if s == nil {
		return nil, errors.New("AGENT_SESSION_NOT_FOUND: this computer has no such agent session, for example after the Agent restarted")
	}
	return s, nil
}

func (m *Manager) write(s *session, value any) error {
	line, err := json.Marshal(value)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.exited {
		return errors.New("AGENT_SESSION_ENDED: the agent session has ended")
	}
	s.lastActive = m.Now()
	_, err = s.stdin.Write(append(line, '\n'))
	return err
}

// input sends the next message, the answer to a permission question, or an interrupt.
func (m *Manager) input(args map[string]any) (any, error) {
	s, err := m.get(args)
	if err != nil {
		return nil, err
	}
	switch {
	case str(args, "message") != "":
		text := str(args, "message")
		if len(text) > maxPrompt {
			return nil, fmt.Errorf("the message must be at most %d characters", maxPrompt)
		}
		err = m.write(s, userMessage(text))
	case str(args, "request_id") != "":
		behavior := str(args, "behavior")
		answer := map[string]any{"behavior": behavior}
		switch behavior {
		case "allow":
			// Without an updated input Claude Code runs the tool with the one it asked about.
			if input, ok := args["updated_input"].(map[string]any); ok {
				answer["updatedInput"] = input
			}
			// Permission updates, such as a rule for the rest of the session or leaving plan mode.
			if updates, ok := args["updated_permissions"].([]any); ok && len(updates) > 0 {
				if len(updates) > 20 {
					return nil, errors.New("at most 20 permission updates")
				}
				for _, update := range updates {
					if _, ok := update.(map[string]any); !ok {
						return nil, errors.New("each permission update must be an object")
					}
				}
				answer["updatedPermissions"] = updates
			}
		case "deny":
			message := str(args, "deny_message")
			if message == "" {
				message = "The person declined this."
			}
			answer["message"] = message
		default:
			return nil, errors.New("behavior must be allow or deny")
		}
		err = m.write(s, map[string]any{"type": "control_response", "response": map[string]any{"subtype": "success", "request_id": str(args, "request_id"), "response": answer}})
	case args["interrupt"] == true:
		err = m.write(s, map[string]any{"type": "control_request", "request_id": "interrupt-" + newID(), "request": map[string]any{"subtype": "interrupt"}})
	default:
		return nil, errors.New("agent_session_input needs a message, an answer or an interrupt")
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true}, nil
}

// read returns the lines from a sequence number on, for a Relay that missed a push.
func (m *Manager) read(args map[string]any) (any, error) {
	s, err := m.get(args)
	if err != nil {
		return nil, err
	}
	from := 0
	if v, ok := args["from"].(float64); ok && v > 0 {
		from = int(v)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	start := from
	if start < s.base {
		start = s.base
	}
	lines := []string{}
	if start < s.next() {
		lines = append(lines, s.lines[start-s.base:]...)
	}
	out := map[string]any{"session": s.id, "from": start, "lines": lines, "next": s.next(), "running": !s.exited, "missed": from < s.base}
	if s.exited {
		out["exit_code"] = s.exitCode
		out["stderr"] = s.stderr
	}
	return out, nil
}

func (m *Manager) stop(args map[string]any) (any, error) {
	s, err := m.get(args)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	exited := s.exited
	s.mu.Unlock()
	if !exited {
		terminateTree(s.cmd)
	}
	return map[string]any{"stopped": true}, nil
}

func (m *Manager) readOut(s *session, out io.Reader) {
	scanner := bufio.NewScanner(out)
	scanner.Buffer(make([]byte, 64<<10), maxLine)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		s.mu.Lock()
		s.lines = append(s.lines, line)
		if len(s.lines) > maxLines {
			drop := len(s.lines) - maxLines
			s.lines = s.lines[drop:]
			s.base += drop
			if s.pushed < s.base {
				s.pushed = s.base
			}
		}
		s.lastActive = m.Now()
		schedule := !s.flushing
		s.flushing = true
		s.mu.Unlock()
		if schedule {
			time.AfterFunc(flushAfter, func() { m.flush(s, false) })
		}
	}
	// A line over the limit stops the scanner: keep reading, so the agent never
	// blocks on a full pipe and its end is still seen.
	_, _ = io.Copy(io.Discard, out)
}

func (m *Manager) readErr(s *session, errOut io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := errOut.Read(buf)
		if n > 0 {
			s.mu.Lock()
			s.stderr += string(buf[:n])
			if len(s.stderr) > stderrKeep {
				s.stderr = s.stderr[len(s.stderr)-stderrKeep:]
			}
			s.mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}

func (m *Manager) wait(s *session) {
	// Wait closes the pipes once the process exits, so read them to the end
	// first: otherwise its last lines, often the reply's result, can be lost.
	s.readers.Wait()
	err := s.cmd.Wait()
	code := 0
	if s.cmd.ProcessState != nil {
		code = s.cmd.ProcessState.ExitCode()
	} else if err != nil {
		code = -1
	}
	s.mu.Lock()
	s.exited, s.exitCode, s.exitedAt = true, code, m.Now()
	s.mu.Unlock()
	m.flush(s, true)
}

// flush pushes the lines printed since the last push; a full queue drops the
// push, and the Relay reads what it missed with agent_session_read.
func (m *Manager) flush(s *session, final bool) {
	s.mu.Lock()
	s.flushing = false
	from := s.pushed
	if from < s.base {
		from = s.base
	}
	lines := append([]string(nil), s.lines[from-s.base:]...)
	s.pushed = s.next()
	event := Event{Type: "agent_session_events", Session: s.id, Tag: s.tag, From: from, Lines: lines}
	if final {
		code := s.exitCode
		event.Exited, event.ExitCode, event.Stderr = true, &code, s.stderr
	}
	s.mu.Unlock()
	if len(lines) == 0 && !final {
		return
	}
	select {
	case m.events <- event:
	default:
	}
}

func (m *Manager) janitor() {
	for range time.Tick(time.Minute) {
		m.sweep()
	}
}

// sweep forgets sessions that ended a while ago and stops ones nobody used for long.
func (m *Manager) sweep() {
	now := m.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		s.mu.Lock()
		exited, idle, ended := s.exited, now.Sub(s.lastActive), now.Sub(s.exitedAt)
		s.mu.Unlock()
		if exited && ended > keepExited {
			delete(m.sessions, id)
		} else if !exited && idle > idleLimit {
			go terminateTree(s.cmd)
		}
	}
}

// StopAll stops every session, when the Agent shuts down.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		s.mu.Lock()
		exited := s.exited
		s.mu.Unlock()
		if !exited {
			terminateTree(s.cmd)
		}
	}
}

// rules reads a list of Claude Code permission rules, at most 200 of up to
// 1000 characters each.
func rules(args map[string]any, key string) []string {
	out := []string{}
	if list, ok := args[key].([]any); ok {
		for _, item := range list {
			if rule, ok := item.(string); ok && rule != "" && len(rule) <= 1000 && len(out) < 200 {
				out = append(out, rule)
			}
		}
	}
	return out
}
