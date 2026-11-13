package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

const Label = "app.remotearc.agent"
const Unit = "remotearc-agent.service"

type Runner func(context.Context, string, ...string) (string, error)
type Controller struct {
	Home, Platform, Executable, Version, UID string
	// User is the login name used for systemd linger on Linux. UID is used
	// when it is empty.
	User string
	Run  Runner
	Wait func(time.Duration)
}
type Registration struct {
	Engine  string `json:"engine"`
	Binary  string `json:"binary"`
	Version string `json:"version"`
}
type Status struct {
	Supported bool   `json:"supported"`
	Enabled   bool   `json:"enabled"`
	Active    bool   `json:"active"`
	Service   string `json:"service"`
	PID       *int   `json:"pid"`
	WorkerPID *int   `json:"workerPid,omitempty"`
	Version   any    `json:"version"`
	Engine    string `json:"engine"`
	// Linger is reported on Linux only. False means systemd stops the user
	// service, and the agent with it, when the user's last session ends.
	// Nil means loginctl could not say.
	Linger *bool `json:"linger,omitempty"`
	// LingerCommand turns linger on. It is set while Linger is false.
	LingerCommand string `json:"lingerCommand,omitempty"`
	Detail        string `json:"detail,omitempty"`
}

// LogoutWarning explains, with the command to fix it, that recovery on this
// device stops at logout. It is empty when that is not known to be the case.
func (s Status) LogoutWarning() string {
	if s.Linger == nil || *s.Linger || s.LingerCommand == "" {
		return ""
	}
	return "Background recovery stops when you log out, because systemd linger is off for this user. To keep it running after logout and start it at boot, run: " + s.LingerCommand
}

func New(version string) *Controller {
	exe, _ := os.Executable()
	uid, name := "0", ""
	if u, e := user.Current(); e == nil {
		uid, name = u.Uid, u.Username
	}
	return &Controller{Home: config.Home(), Platform: runtime.GOOS, Executable: exe, Version: version, UID: uid, User: name, Run: RunCommand, Wait: time.Sleep}
}
func RunCommand(ctx context.Context, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	hide(cmd)
	b, e := cmd.CombinedOutput()
	if e != nil {
		return strings.TrimSpace(string(b)), fmt.Errorf("%s: %s", name, strings.TrimSpace(string(b)))
	}
	return strings.TrimSpace(string(b)), nil
}
func (c *Controller) loginUser() string {
	if c.User != "" {
		return c.User
	}
	return c.UID
}

// linger reads systemd-logind's Linger flag for the user. Without it, logind
// stops user@UID.service, and every user unit in it, when the user's last
// session ends, and does not start it at boot.
func (c *Controller) linger(ctx context.Context) *bool {
	out, e := c.Run(ctx, "loginctl", "show-user", c.loginUser(), "--property=Linger", "--value")
	if e != nil {
		return nil
	}
	var on bool
	switch strings.TrimSpace(out) {
	case "yes":
		on = true
	case "no":
		on = false
	default:
		return nil
	}
	return &on
}

// ensureLinger turns linger on when it is not already on. Root may always do
// this, and the default polkit policy on most distributions lets users do it
// for themselves. A refusal is not an install failure: Status then reports
// Linger false with the command to run.
func (c *Controller) ensureLinger(ctx context.Context) {
	if on := c.linger(ctx); on != nil && *on {
		return
	}
	_, _ = c.Run(ctx, "loginctl", "--no-ask-password", "enable-linger", c.loginUser())
}

func (c *Controller) dir() string    { return filepath.Join(c.Home, ".remotearc", "agent") }
func (c *Controller) marker() string { return filepath.Join(c.dir(), "go-runtime.json") }

// Windows HKCU Run must never point directly at the console-subsystem Go
// executable: Windows creates a visible console on login, and closing that
// window terminates the background supervisor. Windows Script Host (wscript)
// is a GUI-subsystem host and launches the supervisor with window style 0.
func (c *Controller) windowsStartupScriptPath() string {
	return filepath.Join(c.dir(), "windows-autostart.vbs")
}
func windowsScriptEscape(s string) string { return strings.ReplaceAll(s, "\"", "\"\"") }
func windowsStartupScript(binary string) string {
	return "Option Explicit\r\n" +
		"Dim shell\r\n" +
		"Set shell = CreateObject(\"WScript.Shell\")\r\n" +
		"shell.Run Chr(34) & \"" + windowsScriptEscape(binary) + "\" & Chr(34) & \" --supervise\", 0, False\r\n"
}
func (c *Controller) windowsRunValue() string {
	return "wscript.exe //B //Nologo \"" + c.windowsStartupScriptPath() + "\""
}
func (c *Controller) writeWindowsStartupScript(binary string) error {
	return config.DurableWrite(c.windowsStartupScriptPath(), []byte(windowsStartupScript(binary)), 0600)
}
func (c *Controller) installedWindowsStartupScript(binary string) bool {
	b, e := os.ReadFile(c.windowsStartupScriptPath())
	return e == nil && string(b) == windowsStartupScript(binary)
}
func (c *Controller) read() (Registration, error) {
	var r Registration
	b, e := os.ReadFile(c.marker())
	if e == nil {
		e = json.Unmarshal(b, &r)
	}
	return r, e
}
func psQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
func xml(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;").Replace(s)
}
func unitQuote(s string) string {
	b, _ := json.Marshal(s)
	return strings.ReplaceAll(string(b), "%", "%%")
}

// StandardOutput/StandardError take the literal path after append:, unlike
// ExecStart's word parser. Quoting just the path makes the leading quote part
// of the path and systemd rejects it as non-absolute. Escape specifiers only.
func linuxUnit(binary, logs string) (string, error) {
	if strings.ContainsAny(logs, "\r\n\x00") {
		return "", errors.New("Invalid systemd log directory.")
	}
	output := strings.ReplaceAll(filepath.Join(logs, "agent.log"), "%", "%%")
	stderr := strings.ReplaceAll(filepath.Join(logs, "agent-error.log"), "%", "%%")
	return "[Unit]\nDescription=Remote Arc Go device agent\n[Service]\nType=simple\nExecStart=" + unitQuote(binary) + " --agent\nRestart=on-failure\nRestartSec=5\nStandardOutput=append:" + output + "\nStandardError=append:" + stderr + "\n[Install]\nWantedBy=default.target\n", nil
}

func (c *Controller) serviceFile() string {
	if c.Platform == "darwin" {
		return filepath.Join(c.Home, "Library", "LaunchAgents", Label+".plist")
	}
	return filepath.Join(c.Home, ".config", "systemd", "user", Unit)
}
func (c *Controller) pid(ctx context.Context, binary, role string) *int {
	script := `$expected='^\s*"?'+[regex]::Escape(` + psQuote(binary) + `)+'"?\s+'+[regex]::Escape(` + psQuote(role) + `)+ '(?:\s|$)'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $expected } | Select-Object -First 1 -ExpandProperty ProcessId`
	s, e := c.Run(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script)
	if e != nil {
		return nil
	}
	n, e := strconv.Atoi(strings.TrimSpace(s))
	if e != nil || n <= 0 {
		return nil
	}
	return &n
}
func (c *Controller) Status(ctx context.Context) Status {
	s := Status{Supported: true, Service: "unsupported", Engine: "go"}
	reg, e := c.read()
	if e != nil || reg.Engine != "go" {
		s.Detail = "Go background recovery is not configured."
	}
	s.Version = nil
	if reg.Version != "" {
		s.Version = reg.Version
	}
	switch c.Platform {
	case "darwin":
		s.Service = "launchd"
		b, e := os.ReadFile(c.serviceFile())
		s.Enabled = e == nil && reg.Engine == "go" && strings.Contains(string(b), xml(reg.Binary))
		disabled, _ := c.Run(ctx, "launchctl", "print-disabled", "gui/"+c.UID)
		if strings.Contains(disabled, `"`+Label+`" => true`) {
			s.Enabled = false
		}
		out, e := c.Run(ctx, "launchctl", "print", "gui/"+c.UID+"/"+Label)
		if e == nil && reg.Engine == "go" && reg.Binary != "" {
			if found := regexp.MustCompile(`\bpid\s*=\s*(\d+)`).FindStringSubmatch(out); len(found) > 1 {
				n, _ := strconv.Atoi(found[1])
				if n > 0 {
					s.PID = &n
					s.Active = true
				}
			}
		}
	case "linux":
		s.Service = "systemd-user"
		out, e := c.Run(ctx, "systemctl", "--user", "is-enabled", Unit)
		b, fe := os.ReadFile(c.serviceFile())
		s.Enabled = e == nil && strings.TrimSpace(out) == "enabled" && fe == nil && reg.Engine == "go" && strings.Contains(string(b), unitQuote(reg.Binary))
		pid, e := c.Run(ctx, "systemctl", "--user", "show", Unit, "--property=MainPID", "--value")
		if e == nil && reg.Engine == "go" && reg.Binary != "" {
			n, _ := strconv.Atoi(strings.TrimSpace(pid))
			if n > 0 {
				s.PID = &n
				s.Active = true
			}
		}
		s.Linger = c.linger(ctx)
		if s.Linger != nil && !*s.Linger {
			s.LingerCommand = "sudo loginctl enable-linger " + c.loginUser()
			if s.Detail == "" {
				s.Detail = s.LogoutWarning()
			}
		}
	case "windows":
		s.Service = "registry-run"
		key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
		out, e := c.Run(ctx, "reg.exe", "query", key, "/v", "Remote Arc Agent")
		s.Enabled = e == nil && reg.Engine == "go" && reg.Binary != "" &&
			strings.Contains(strings.ToLower(out), strings.ToLower(c.windowsRunValue())) &&
			c.installedWindowsStartupScript(reg.Binary)
		if reg.Binary != "" {
			s.PID = c.pid(ctx, reg.Binary, "--supervise")
			s.WorkerPID = c.pid(ctx, reg.Binary, "--agent")
			s.Active = s.PID != nil
		}
	default:
		s.Supported = false
		s.Detail = "Background services are unavailable on this system."
	}
	return s
}
func (c *Controller) installBinary() (Registration, error) {
	if !regexp.MustCompile(`^[A-Za-z0-9_.-]+$`).MatchString(c.Version) {
		return Registration{}, errors.New("Invalid device binary version.")
	}
	name := "remotelink"
	if c.Platform == "windows" {
		name += ".exe"
	}
	binary := filepath.Join(c.dir(), "bin", "go-"+c.Version, name)
	source, e := filepath.Abs(c.Executable)
	if e != nil {
		return Registration{}, e
	}
	if source != binary {
		b, e := os.ReadFile(source)
		if e != nil {
			return Registration{}, e
		}
		existing, _ := os.ReadFile(binary)
		if string(existing) != string(b) {
			if e = config.DurableWrite(binary, b, 0700); e != nil {
				return Registration{}, e
			}
		}
	}
	reg := Registration{Engine: "go", Binary: binary, Version: c.Version}
	b, _ := json.Marshal(reg)
	if e = config.DurableWrite(c.marker(), b, 0600); e != nil {
		return reg, e
	}
	return reg, nil
}

// launchd keeps the loaded job definition in memory. Updating a plist alone
// does not replace an existing label, even when launchctl reports no live PID.
func (c *Controller) loadedMacJob(ctx context.Context) (loaded bool, active bool, program string) {
	if c.Platform != "darwin" {
		return false, false, ""
	}
	out, err := c.Run(ctx, "launchctl", "print", "gui/"+c.UID+"/"+Label)
	if err != nil {
		return false, false, ""
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "program = ") {
			program = strings.TrimSpace(strings.TrimPrefix(line, "program = "))
		}
	}
	return true, regexp.MustCompile(`(?m)^\s*pid\s*=\s*[1-9]\d*`).MatchString(out), program
}

func (c *Controller) Enable(ctx context.Context) (Status, error) {
	current := c.Status(ctx)
	if c.Foreign(ctx) {
		return current, errors.New("A retired TypeScript background service is registered. Disable it with npx remotelink@0.6.5 --ts --no-background and stop its agent locally before selecting Go recovery.")
	}
	if c.Platform == "darwin" {
		loaded, running, program := c.loadedMacJob(ctx)
		reg, _ := c.read()
		if loaded && running && (program == "" || reg.Binary == "" || program != reg.Binary) {
			return current, errors.New("An existing launchd Agent is running from a different runtime or binary. Stop that Agent explicitly before switching background recovery.")
		}
	}
	if current.Enabled && current.Active && current.Version == c.Version {
		// Installs from before linger was handled are healthy until logout.
		if c.Platform == "linux" && (current.Linger == nil || !*current.Linger) {
			c.ensureLinger(ctx)
			return c.Status(ctx), nil
		}
		return current, nil
	}
	// Re-enable future recovery without restarting the worker that is executing
	// this request. Disable intentionally preserves that worker.
	if current.Active && current.Version == c.Version {
		reg, e := c.read()
		if e != nil {
			return current, e
		}
		switch c.Platform {
		case "darwin":
			_, e = c.Run(ctx, "launchctl", "enable", "gui/"+c.UID+"/"+Label)
		case "linux":
			if _, e = c.Run(ctx, "systemctl", "--user", "enable", Unit); e == nil {
				c.ensureLinger(ctx)
			}
		case "windows":
			if e = c.writeWindowsStartupScript(reg.Binary); e == nil {
				_, e = c.Run(ctx, "reg.exe", "add", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "Remote Arc Agent", "/t", "REG_SZ", "/d", c.windowsRunValue(), "/f")
			}
		}
		return c.Status(ctx), e
	}
	if !current.Supported {
		return current, nil
	}
	reg, e := c.installBinary()
	if e != nil {
		return current, e
	}
	logs := filepath.Join(c.Home, ".remotearc", "logs")
	if e = os.MkdirAll(logs, 0700); e != nil {
		return current, e
	}
	run := func(name string, args ...string) error { _, e := c.Run(ctx, name, args...); return e }
	switch c.Platform {
	case "darwin":
		// An idle job with the same label may still contain an old Node/TS
		// definition. Boot it out before rewriting and bootstrapping Go.
		loaded, running, _ := c.loadedMacJob(ctx)
		if loaded && !running {
			if _, e = c.Run(ctx, "launchctl", "bootout", "gui/"+c.UID+"/"+Label); e != nil {
				return current, fmt.Errorf("Could not unload stale launchd job before updating: %w", e)
			}
		}
		plist := `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>` + Label + `</string><key>ProgramArguments</key><array><string>` + xml(reg.Binary) + `</string><string>--agent</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>5</integer><key>StandardOutPath</key><string>` + xml(filepath.Join(logs, "agent.log")) + `</string><key>StandardErrorPath</key><string>` + xml(filepath.Join(logs, "agent-error.log")) + `</string></dict></plist>`
		if current.Active {
			_, _ = c.Run(ctx, "launchctl", "bootout", "gui/"+c.UID+"/"+Label)
		}
		if e = config.DurableWrite(c.serviceFile(), []byte(plist), 0600); e == nil {
			e = run("launchctl", "enable", "gui/"+c.UID+"/"+Label)
		}
		if e == nil {
			e = run("launchctl", "bootstrap", "gui/"+c.UID, c.serviceFile())
		}
	case "linux":
		unit, err := linuxUnit(reg.Binary, logs)
		if err != nil {
			return current, err
		}
		if e = config.DurableWrite(c.serviceFile(), []byte(unit), 0600); e == nil {
			e = run("systemctl", "--user", "daemon-reload")
		}
		if e == nil {
			e = run("systemctl", "--user", "enable", "--now", Unit)
		}
		if e == nil {
			c.ensureLinger(ctx)
		}
	case "windows":
		// Use the *same* silent launcher on initial enable and at user login.
		// The Windows Script Host process exits after spawning the hidden
		// supervisor; the Go supervisor still owns the existing execution
		// and supervisor leases.
		if e = c.writeWindowsStartupScript(reg.Binary); e == nil {
			e = run("reg.exe", "add", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "Remote Arc Agent", "/t", "REG_SZ", "/d", c.windowsRunValue(), "/f")
		}
		if e == nil {
			e = run("wscript.exe", "//B", "//Nologo", c.windowsStartupScriptPath())
		}
	}
	if e != nil {
		return c.Status(ctx), e
	}
	for i := 0; i < 20; i++ {
		status := c.Status(ctx)
		if status.Enabled && status.Active {
			return status, nil
		}
		if ctx.Err() != nil {
			return status, ctx.Err()
		}
		c.Wait(250 * time.Millisecond)
	}
	return c.Status(ctx), errors.New("Background installation did not produce a live Go supervisor; foreground execution is preserved.")
}
func (c *Controller) Disable(ctx context.Context) error {
	reg, _ := c.read()
	if reg.Engine != "go" {
		return nil
	}
	var e error
	switch c.Platform {
	case "darwin":
		_, e = c.Run(ctx, "launchctl", "disable", "gui/"+c.UID+"/"+Label)
	case "linux":
		_, e = c.Run(ctx, "systemctl", "--user", "disable", Unit)
	case "windows":
		_, e = c.Run(ctx, "reg.exe", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "Remote Arc Agent", "/f")
	}
	return e
}

// StopSupervision is called only after future recovery has been disabled.
func (c *Controller) StopSupervision(ctx context.Context) {
	registration, e := c.read()
	if e != nil || registration.Engine != "go" {
		return
	}
	switch c.Platform {
	case "darwin":
		_, _ = c.Run(ctx, "launchctl", "bootout", "gui/"+c.UID+"/"+Label)
	case "linux":
		_, _ = c.Run(ctx, "systemctl", "--user", "stop", Unit)
	case "windows":
		reg := registration
		if reg.Binary != "" {
			if pid := c.pid(ctx, reg.Binary, "--supervise"); pid != nil {
				_, _ = c.Run(ctx, "taskkill.exe", "/PID", strconv.Itoa(*pid), "/T", "/F")
			}
		}
	}
}
func (c *Controller) ExecutionActive() bool { return lease.Active(c.dir(), "execution") }
func (c *Controller) Foreign(ctx context.Context) bool {
	reg, _ := c.read()
	if c.Platform == "windows" {
		out, e := c.Run(ctx, "reg.exe", "query", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "Remote Arc Agent")
		if e != nil {
			return false
		}
		if reg.Engine != "go" || reg.Binary == "" {
			return true
		}
		// Accept our old direct-console Run registration as owned, so it can
		// be safely migrated to the silent launcher. Other user startup
		// entries must never be silently overwritten.
		newOwned := strings.Contains(strings.ToLower(out), strings.ToLower(c.windowsRunValue())) && c.installedWindowsStartupScript(reg.Binary)
		oldOwned := strings.Contains(strings.ToLower(out), strings.ToLower(reg.Binary)) &&
			strings.Contains(strings.ToLower(out), "--supervise")
		return !newOwned && !oldOwned
	}
	b, e := os.ReadFile(c.serviceFile())
	if e != nil {
		return false
	}
	expected := xml(reg.Binary)
	if c.Platform == "linux" {
		expected = unitQuote(reg.Binary)
	}
	return reg.Engine != "go" || reg.Binary == "" || !strings.Contains(string(b), expected)
}
