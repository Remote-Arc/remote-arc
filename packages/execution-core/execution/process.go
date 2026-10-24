package execution

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const MaxCaptureBytes = 2 * 1024 * 1024

type cappedBuffer struct {
	mu        sync.Mutex
	b         []byte
	truncated bool
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	space := MaxCaptureBytes - len(b.b)
	if len(p) > space {
		b.truncated = true
		p = p[:max(0, space)]
	}
	b.b = append(b.b, p...)
	return n, nil
}
func (b *cappedBuffer) Text() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	s := strings.ToValidUTF8(string(b.b), "�")
	if b.truncated {
		s += "\n… output truncated …"
	}
	return s
}
func (b *cappedBuffer) Size() int { b.mu.Lock(); defer b.mu.Unlock(); return len(b.b) }
func randomID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

type managed struct {
	mu               sync.Mutex
	id, command, cwd string
	cmd              *exec.Cmd
	started          time.Time
	ended            *time.Time
	code             *int
	signal           any
	out, err         cappedBuffer
	done             chan struct{}
	killOnce         sync.Once
}
type Processes struct {
	mu     sync.Mutex
	items  map[string]*managed
	closed bool
}

func NewProcesses() *Processes { return &Processes{items: map[string]*managed{}} }
func (m *managed) kill()       { m.killOnce.Do(func() { terminateTree(m.cmd) }) }
func (m *managed) status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	status := "running"
	until := time.Now()
	var ended any
	if m.ended != nil {
		status = "exited"
		until = *m.ended
		ended = until.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	var cwd any
	if m.cwd != "" {
		cwd = m.cwd
	}
	return map[string]any{"process_id": m.id, "pid": m.cmd.Process.Pid, "command": m.command, "cwd": cwd, "status": status, "exit_code": m.code, "signal": m.signal, "started_at": m.started.UTC().Format("2006-01-02T15:04:05.000Z"), "ended_at": ended, "duration_ms": until.Sub(m.started).Milliseconds()}
}
func (p *Processes) cleanup() {
	now := time.Now()
	for id, m := range p.items {
		m.mu.Lock()
		expired := m.ended != nil && now.Sub(*m.ended) > 30*time.Minute
		m.mu.Unlock()
		if expired {
			delete(p.items, id)
		}
	}
}
func (p *Processes) start(command, cwd string, deadline time.Duration) (*managed, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil, errors.New("Execution core is closed.")
	}
	p.cleanup()
	if len(p.items) >= 32 {
		return nil, errors.New("Remote Arc already has the maximum number of managed background processes on this device.")
	}
	cmd := shellCommand(command)
	cmd.Dir = cwd
	cmd.WaitDelay = 3 * time.Second
	m := &managed{id: randomID(), command: command, cwd: cwd, cmd: cmd, started: time.Now(), done: make(chan struct{})}
	cmd.Stdout = &m.out
	cmd.Stderr = &m.err
	if e := cmd.Start(); e != nil {
		return nil, e
	}
	p.items[m.id] = m
	go func() {
		e := cmd.Wait()
		m.mu.Lock()
		now := time.Now()
		m.ended = &now
		code := 0
		if e != nil {
			code = cmd.ProcessState.ExitCode()
			m.signal = processSignal(cmd.ProcessState)
			if code < 0 {
				m.code = nil
			} else {
				m.code = &code
			}
		} else {
			m.code = &code
		}
		m.mu.Unlock()
		close(m.done)
	}()
	if deadline > 0 {
		go func() {
			t := time.NewTimer(deadline)
			defer t.Stop()
			select {
			case <-m.done:
			case <-t.C:
				m.err.Write([]byte("\nRemote Arc: authorized process time budget exhausted."))
				m.kill()
			}
		}()
	}
	return m, nil
}
func (p *Processes) Background(command, cwd string, seconds int) (map[string]any, error) {
	if seconds < 0 || seconds > 7*86400 {
		return nil, errors.New("Invalid managed process duration.")
	}
	m, e := p.start(command, cwd, time.Duration(seconds)*time.Second)
	if e != nil {
		return nil, e
	}
	var dir any
	if cwd != "" {
		dir = cwd
	}
	return map[string]any{"process_id": m.id, "pid": m.cmd.Process.Pid, "command": command, "cwd": dir, "status": "running", "started_at": m.started.UTC().Format("2006-01-02T15:04:05.000Z")}, nil
}
func (p *Processes) Run(ctx context.Context, command, cwd string, timeout int) (map[string]any, error) {
	m, e := p.start(command, cwd, 0)
	if e != nil {
		return nil, e
	}
	t := time.NewTimer(time.Duration(max(100, min(120000, timeout))) * time.Millisecond)
	defer t.Stop()
	timedOut := false
	select {
	case <-m.done:
	case <-ctx.Done():
		m.kill()
		<-m.done
	case <-t.C:
		timedOut = true
		m.kill()
		<-m.done
	}
	s := m.status()
	p.mu.Lock()
	delete(p.items, m.id)
	p.mu.Unlock()
	return map[string]any{"command": command, "cwd": s["cwd"], "exit_code": s["exit_code"], "signal": s["signal"], "stdout": m.out.Text(), "stderr": m.err.Text(), "duration_ms": s["duration_ms"], "timed_out": timedOut}, nil
}
func (p *Processes) get(id string) (*managed, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cleanup()
	m := p.items[id]
	if m == nil {
		return nil, errors.New("Managed process not found or its local retention window has expired.")
	}
	return m, nil
}
func (p *Processes) Status(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	return m.status(), nil
}
func (p *Processes) Output(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	s := m.status()
	s["stdout"] = m.out.Text()
	s["stderr"] = m.err.Text()
	s["truncated"] = m.out.Size() >= MaxCaptureBytes || m.err.Size() >= MaxCaptureBytes
	return s, nil
}
func (p *Processes) Stop(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	select {
	case <-m.done:
		s := m.status()
		s["stopped"] = false
		s["already_exited"] = true
		return s, nil
	default:
	}
	m.kill()
	select {
	case <-m.done:
	case <-time.After(5 * time.Second):
		return nil, errors.New("Managed process did not stop within the shutdown deadline.")
	}
	s := m.status()
	s["stopped"] = true
	s["already_exited"] = false
	return s, nil
}

// ActiveCount exposes only the number of live managed jobs, not process names
// or arguments. Finished jobs retained for inspection do not count as load.
func (p *Processes) ActiveCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	active := 0
	for _, job := range p.items {
		select {
		case <-job.done:
		default:
			active++
		}
	}
	return active
}

func (p *Processes) List() []map[string]any {
	p.mu.Lock()
	p.cleanup()
	items := []*managed{}
	for _, m := range p.items {
		items = append(items, m)
	}
	p.mu.Unlock()
	sort.Slice(items, func(i, j int) bool { return items[i].started.After(items[j].started) })
	result := []map[string]any{}
	for _, m := range items {
		s := m.status()
		s["stdout_bytes"] = m.out.Size()
		s["stderr_bytes"] = m.err.Size()
		result = append(result, s)
	}
	return result
}
func (p *Processes) Close() {
	p.mu.Lock()
	p.closed = true
	items := []*managed{}
	for _, m := range p.items {
		items = append(items, m)
	}
	p.mu.Unlock()
	var wg sync.WaitGroup
	for _, m := range items {
		wg.Add(1)
		go func(m *managed) {
			defer wg.Done()
			select {
			case <-m.done:
				return
			default:
			}
			m.kill()
			select {
			case <-m.done:
			case <-time.After(5 * time.Second):
			}
		}(m)
	}
	wg.Wait()
}

// secretArgument redacts obvious credentials that some tools pass on their
// command line, so a process listing does not become a token leak.
var secretArgument = regexp.MustCompile(`(?i)((?:--?|/)(?:token|password|passwd|secret|api[-_]?key|access[-_]?key|auth[-_]?token|client[-_]secret)[=: ]+|\b(?:token|password|passwd|secret|api[-_]?key|access[-_]?key|client[-_]secret)=)("(?:\\.|[^"\\])*"|'[^']*'|\S+)|(bearer\s+)\S+`)

func redactCommandLine(line string) string {
	return secretArgument.ReplaceAllStringFunc(line, func(match string) string {
		parts := secretArgument.FindStringSubmatch(match)
		if parts[3] != "" {
			return parts[3] + "[redacted]"
		}
		return parts[1] + "[redacted]"
	})
}

// processCommand picks the OS listing command. tasklist has no header row of
// its own, so one is supplied; details on Windows adds command lines via CIM.
func processCommand(goos string, details bool) (name string, args []string, header string) {
	if goos != "windows" {
		return "ps", []string{"-axo", "pid,ppid,user,%cpu,%mem,etime,command"}, ""
	}
	if details {
		return "powershell.exe", []string{"-NoProfile", "-NonInteractive", "-Command",
			"[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{n='MemoryMB';e={[math]::Round($_.WorkingSetSize/1MB)}},CommandLine | ConvertTo-Json -Compress"}, ""
	}
	return "tasklist.exe", []string{"/FO", "CSV", "/NH"}, `"Image Name","PID","Session Name","Session#","Mem Usage"`
}

// Redact the actual command before formatting it. CSV doubles embedded quotes,
// so applying the command-line regex to raw CSV can redact an empty quote pair
// and leave the credential behind. JSON also preserves multiline commands.
func windowsProcessDetails(output string) (string, error) {
	type row struct {
		PID     int     `json:"ProcessId"`
		PPID    int     `json:"ParentProcessId"`
		Name    string  `json:"Name"`
		Memory  float64 `json:"MemoryMB"`
		Command string  `json:"CommandLine"`
	}
	rows := []row{}
	output = strings.TrimSpace(output)
	if output != "" && output != "null" {
		if strings.HasPrefix(output, "{") {
			output = "[" + output + "]"
		}
		if err := json.Unmarshal([]byte(output), &rows); err != nil {
			return "", errors.New("Invalid process details response")
		}
	}
	lines := []string{"PID\tPPID\tName\tMemoryMB\tCommandLine"}
	for _, r := range rows {
		// Keep each process on one display row after redacting quoted values.
		command := strings.NewReplacer("\r", " ", "\n", " ", "\t", " ").Replace(redactCommandLine(r.Command))
		name := strings.NewReplacer("\r", " ", "\n", " ", "\t", " ").Replace(r.Name)
		lines = append(lines, fmt.Sprintf("%d\t%d\t%s\t%.0f\t%s", r.PID, r.PPID, name, r.Memory, command))
	}
	return strings.Join(lines, "\n"), nil
}

// listProcesses returns a header plus one line per process. filter keeps rows
// whose text contains it (case-insensitive); limit caps rows; details adds
// command lines on Windows (ps already includes them elsewhere).
func listProcesses(filter string, limit int, details bool) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if limit < 1 || limit > 1000 {
		limit = 200
	}
	name, args, header := processCommand(runtime.GOOS, details)
	cmd := exec.CommandContext(ctx, name, args...)
	hideCommand(cmd)
	var out, err cappedBuffer
	cmd.Stdout = &out
	cmd.Stderr = &err
	if e := cmd.Run(); e != nil {
		return "", fmt.Errorf("Could not list processes: %s", err.Text())
	}
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	output := out.Text()
	if runtime.GOOS == "windows" && details {
		var parseErr error
		output, parseErr = windowsProcessDetails(output)
		if parseErr != nil {
			return "", parseErr
		}
	}
	lines := strings.Split(strings.ReplaceAll(strings.TrimSpace(output), "\r\n", "\n"), "\n")
	if header == "" && len(lines) > 0 {
		header, lines = lines[0], lines[1:]
	}
	needle := strings.ToLower(strings.TrimSpace(filter))
	kept, matched := []string{}, 0
	for _, line := range lines {
		if strings.TrimSpace(line) == "" || needle != "" && !strings.Contains(strings.ToLower(line), needle) {
			continue
		}
		matched++
		if len(kept) < limit {
			kept = append(kept, redactCommandLine(line))
		}
	}
	summary := fmt.Sprintf("[%d of %d processes", len(kept), matched)
	if needle != "" {
		summary += fmt.Sprintf(" matching %q", filter)
	}
	if matched > len(kept) {
		summary += "; raise limit or narrow filter for the rest"
	}
	summary += "]"
	return "Processes on " + platform + ":\n\n" + redactCommandLine(header) + "\n" + strings.Join(kept, "\n") + "\n\n" + summary, nil
}
