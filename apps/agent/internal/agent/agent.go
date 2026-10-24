package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/browserrunner"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/power"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspace"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

type Background interface {
	Status(context.Context) service.Status
	Enable(context.Context) (service.Status, error)
	Disable(context.Context) error
}
type Agent struct {
	Config             config.Config
	Version            string
	BackgroundProcess  bool
	WakeOnly           bool
	Client             *Client
	Core               *execution.Core
	Browser            *browserrunner.Manager // nil while paused (wake-only)
	Journal            *journal.Journal
	Background         Background
	Stop               func()
	Save               func(config.Config) error
	Load               func() (config.Config, error)
	mu                 sync.Mutex
	connected          bool
	connectedAt        string
	connectionSequence uint64
	workspace          workspace.Manager
	settings           sync.Mutex
	capacity           *capacityProbe
}

func New(cfg config.Config, version string, background bool, log *journal.Journal) *Agent {
	mode := "managed"
	if cfg.Mode == "safe" {
		mode = "safe"
	}
	return &Agent{Config: cfg, Version: version, BackgroundProcess: background, Client: NewClient(), Core: execution.New(mode), Browser: browserrunner.New(), Journal: log, Background: service.New(version), Save: config.Save, Load: config.Load, capacity: &capacityProbe{}}
}

// NewWake connects to the same authenticated Relay using a minimal control
// channel. It creates NO filesystem/process execution core while paused.
func NewWake(cfg config.Config, version string, log *journal.Journal) *Agent {
	return &Agent{Config: cfg, Version: version, BackgroundProcess: true,
		WakeOnly: true, Client: NewClient(), Journal: log,
		Background: service.New(version), Save: config.Save, Load: config.Load, capacity: &capacityProbe{}}
}
func (a *Agent) log(level, message string) {
	if a.Journal != nil {
		a.Journal.Log(level, CleanMessage(message))
	}
}

var runnerBypass = regexp.MustCompile(`(?i)(playwright|puppeteer|selenium|chromedriver|webdriver)`)

func (a *Agent) cfg() config.Config { a.mu.Lock(); defer a.mu.Unlock(); return a.Config }
func (a *Agent) Status() map[string]any {
	// Work that stopping this Agent would interrupt, reported as counts only so
	// a newer CLI can decide whether an automatic upgrade is safe.
	work := map[string]any{"managedProcesses": 0, "browser_runner_sessions": 0}
	if a.Core != nil && a.Core.Processes != nil {
		work["managedProcesses"] = a.Core.Processes.ActiveCount()
	}
	if a.Browser != nil {
		work["browser_runner_sessions"] = a.Browser.ActiveSessions()
	}
	// rc.5 launchers still read this field before deciding whether work is idle.
	// Keep the deprecated alias so mixed-version upgrades cannot lose sessions.
	work["browserRunnerSessions"] = work["browser_runner_sessions"]
	a.mu.Lock()
	defer a.mu.Unlock()
	return map[string]any{"activeWork": work, "executionPaused": a.WakeOnly || a.Config.ExecutionPaused, "engine": "go", "version": a.Version, "pid": os.Getpid(), "deviceId": a.Config.DeviceID, "mode": a.Config.Mode, "connected": a.connected, "connectedAt": a.connectedAt, "connectionSequence": a.connectionSequence, "fileDurability": config.FileDurability(), "undoDurability": config.UndoDurability(), "backgroundProcess": a.BackgroundProcess}
}
func (a *Agent) identityValid() bool {
	saved, e := a.Load()
	cfg := a.cfg()
	valid := e == nil && saved.DeviceID == cfg.DeviceID && saved.DeviceToken == cfg.DeviceToken
	if valid {
		a.mu.Lock()
		a.Config.BackgroundEnabled = saved.BackgroundEnabled
		a.Config.Extra = saved.Extra
		a.mu.Unlock()
	}
	return valid
}

// Fleet capacity does not reveal managed commands, paths or their outputs.
func (a *Agent) fleetCapacity(ctx context.Context) map[string]any {
	raw := a.capacity.sample(ctx)
	if raw == nil {
		return nil
	}
	result := make(map[string]any, len(raw)+1)
	for key, value := range raw {
		result[key] = value
	}
	if a.Core != nil && a.Core.Processes != nil {
		result["managedProcesses"] = a.Core.Processes.ActiveCount()
	}
	return result
}

func (a *Agent) hello(ctx context.Context) map[string]any {
	cfg := a.cfg()
	a.mu.Lock()
	connectedAt, sequence := a.connectedAt, a.connectionSequence
	a.mu.Unlock()
	status := a.Background.Status(ctx)
	hostname, _ := os.Hostname()
	names := []string{}
	if !a.WakeOnly {
		for _, t := range a.Core.ListTools() {
			names = append(names, t.Name)
		}
		names = append(names, "background_agent_status", "set_background_agent", "set_task_keep_awake", "goal_workspace", "agent_execution_log")
		if a.browserRunnerReady() {
			names = append(names, browserrunner.Tools...)
		}
	} else {
		names = append(names, "background_agent_status", "set_background_agent")
	}
	names = append(names, "set_device_runtime")
	capabilities := []string{"device_policy_v1", "background_agent_v1", "background_recovery_v2", "device_stop_v1", "device_pause_v1", "go_agent_v1"}
	if !a.WakeOnly {
		capabilities = append(capabilities, "native_core_v1", "undo_history_v1")
		if a.browserRunnerReady() {
			capabilities = append(capabilities, "browser_runner_v1")
		}
	}
	return map[string]any{"type": "hello", "device": map[string]any{"id": cfg.DeviceID, "name": cfg.DeviceName, "platform": protocol.Platform(runtime.GOOS), "arch": Arch(), "hostname": hostname, "agentVersion": a.Version, "pid": os.Getpid(), "backgroundProcess": a.BackgroundProcess, "executionPaused": a.WakeOnly || cfg.ExecutionPaused, "connectedAt": connectedAt, "connectionSequence": sequence, "recoveryEnabled": cfg.BackgroundEnabled != nil && *cfg.BackgroundEnabled && status.Enabled && status.Active, "supervisorActive": status.Active, "supervisorPid": status.PID, "supervisorService": status.Service, "recoveryVersion": status.Version, "capacity": a.fleetCapacity(ctx)}, "tools": names, "capabilities": capabilities}
}

// browserRunnerReady advertises the browser_runner only where it can run:
// an execution (not wake-only) Agent in terminal mode with a Chromium-family
// browser installed. The Relay still requires the user to enable the tools.
func (a *Agent) browserRunnerReady() bool {
	return a.Browser != nil && a.Core != nil && a.Core.Mode != "safe" && a.Core.Mode != "developer" && a.Browser.Available()
}
func (a *Agent) heartbeat(ctx context.Context) error {
	cfg := a.cfg()
	status := a.Background.Status(ctx)
	_, e := a.Client.Request(ctx, cfg.Origin, cfg.DeviceToken, "POST", "/api/device/heartbeat", map[string]any{"background_enabled": cfg.BackgroundEnabled != nil && *cfg.BackgroundEnabled && status.Enabled && status.Active, "background_process": a.BackgroundProcess, "background_service": status.Service}, nil)
	return e
}
func (a *Agent) dispatch(ctx context.Context, call protocol.Call, awake *power.Manager) (any, error) {
	if !a.identityValid() {
		return nil, ErrRevoked
	}
	args := call.Arguments
	if args == nil {
		args = map[string]any{}
	}
	// The native wake channel never exposes an execution core. A pause arriving
	// mid-flight immediately closes the gate for new tool dispatch.
	if (a.WakeOnly || a.cfg().ExecutionPaused) &&
		call.Tool != "set_device_runtime" && call.Tool != "set_background_agent" && call.Tool != "background_agent_status" {
		return nil, errors.New("Device is paused. Resume it from Dashboard before using computer tools.")
	}
	switch call.Tool {
	case "set_device_runtime":
		a.settings.Lock()
		defer a.settings.Unlock()
		paused, ok := args["paused"].(bool)
		if !ok {
			return nil, errors.New("paused must be a boolean.")
		}
		cfg := a.cfg()
		if a.Stop == nil {
			return nil, errors.New("No supervised runtime handoff is available.")
		}
		if paused {
			status := a.Background.Status(ctx)
			if cfg.BackgroundEnabled == nil || !*cfg.BackgroundEnabled || !status.Enabled || !status.Active {
				return nil, errors.New("Pause requires an active background wake supervisor; enable recovery first.")
			}
			if a.WakeOnly {
				return map[string]any{"accepted": true, "paused": true}, nil
			}
		} else {
			if !a.WakeOnly {
				return nil, errors.New("Resume requires a paused wake-only Agent.")
			}
		}
		cfg.ExecutionPaused = paused
		if err := a.Save(cfg); err != nil {
			return nil, err
		}
		a.mu.Lock()
		a.Config = cfg
		a.mu.Unlock()
		// Acknowledge before the old owner yields its execution lease. The
		// supervisor will start a new wake-only or execution worker using the
		// durable paused flag. No new source AI or operating-system tool access.
		go func() { time.Sleep(750 * time.Millisecond); a.Stop() }()
		return map[string]any{"accepted": true, "paused": paused}, nil

	case "background_agent_status":
		s := a.Background.Status(ctx)
		b, _ := json.Marshal(s)
		m := map[string]any{}
		json.Unmarshal(b, &m)
		m["desired_enabled"] = a.cfg().BackgroundEnabled
		return m, nil
	case "agent_execution_log":
		if a.Journal == nil {
			return nil, errors.New("Execution journal is unavailable.")
		}
		return a.Journal.Tail(protocol.Number(args, "limit", 100)), nil
	case "set_task_keep_awake":
		id, e := protocol.String(args, "task_id")
		if e != nil {
			return nil, e
		}
		seconds, e := protocol.Integer(args, "seconds", 0, 0, 180)
		if e != nil {
			return nil, e
		}
		return awake.Set(id, seconds)
	case "browser_runner_start", "browser_runner_snapshot", "browser_runner_act",
		"browser_runner_status", "browser_runner_confirm", "browser_runner_close", "browser_runner_wait":
		if a.Browser == nil || a.Core == nil || a.Core.Mode == "safe" || a.Core.Mode == "developer" {
			return nil, errors.New("browser_runner requires terminal mode on this device.")
		}
		a.Browser.SetAttentionMode(call.Policy.RunnerAttentionMode)
		return a.Browser.Call(ctx, call.Tool, args, call.Policy)
	case "goal_workspace":
		if a.Core.Mode == "safe" || a.Core.Mode == "developer" {
			return nil, errors.New("Goal checkpoints require terminal mode.")
		}
		return a.workspace.Call(ctx, args, call.Policy)
	case "set_background_agent":
		a.settings.Lock()
		defer a.settings.Unlock()
		enabled, ok := args["enabled"].(bool)
		if !ok {
			return nil, errors.New("enabled must be a boolean.")
		}
		stopCurrent := !enabled && protocol.Bool(args, "stop_current")
		if stopCurrent && a.Stop == nil {
			return nil, errors.New("Current Agent cannot be stopped from this session.")
		}
		cfg := a.cfg()
		cfg.BackgroundEnabled = &enabled
		if stopCurrent {
			cfg.ExecutionPaused = false
		}
		if e := a.Save(cfg); e != nil {
			return nil, e
		}
		a.mu.Lock()
		a.Config = cfg
		a.mu.Unlock()
		var status service.Status
		var e error
		if enabled {
			status, e = a.Background.Enable(ctx)
		} else {
			e = a.Background.Disable(ctx)
			status = a.Background.Status(ctx)
		}
		if e != nil {
			return nil, e
		}
		if stopCurrent {
			// Acknowledge over the existing WebSocket before closing the
			// foreground OR background executor. Supervisor checks the persisted
			// disabled setting and will not resurrect the stopped worker.
			go func() { time.Sleep(750 * time.Millisecond); a.Stop() }()
		}
		b, _ := json.Marshal(status)
		m := map[string]any{}
		json.Unmarshal(b, &m)
		m["desired_enabled"] = enabled
		return m, nil
	default:
		if a.Core == nil {
			return nil, errors.New("Execution core unavailable while paused.")
		}
		result, err := a.Core.Call(ctx, call.Tool, args, call.Policy)
		if err == nil && call.Tool == "start_process" && call.Policy.BrowserRunnerEnabled && runnerBypass.MatchString(protocol.OptionalString(args, "command")) {
			a.log("warn", "RUNNER_BYPASS: browser automation started outside Browser Runner; handoff and submit deduplication are unavailable.")
			if len(result.Content) > 0 {
				var value map[string]any
				if json.Unmarshal([]byte(result.Content[0].Text), &value) == nil && value != nil {
					value["warning"] = "RUNNER_BYPASS"
					value["guidance"] = "For websites use browser_runner_*; custom Playwright, Puppeteer or Selenium scripts lose CAPTCHA handoff, submit deduplication and saved credentials. The requested command still ran."
					result = protocol.TextResult(value)
				}
			}
		}
		return result, err
	}
}
func (a *Agent) Run(ctx context.Context) error {
	if a.Core != nil {
		defer a.Core.Close()
	}
	if a.Browser != nil {
		// Stop task browsers but keep their checkpoints for a later resume.
		defer a.Browser.Close()
	}
	delay := time.Second
	for ctx.Err() == nil {
		if !a.identityValid() {
			return ErrRevoked
		}
		cfg := a.cfg()
		origin, e := Origin(cfg.Origin)
		if e != nil {
			return e
		}
		u, _ := url.Parse(origin)
		if u.Scheme == "https" {
			u.Scheme = "wss"
		} else {
			u.Scheme = "ws"
		}
		u.Path = "/agent"
		dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second, Proxy: http.ProxyFromEnvironment}
		conn, resp, e := dialer.DialContext(ctx, u.String(), http.Header{"Authorization": []string{"Bearer " + cfg.DeviceToken}})
		if e != nil {
			if resp != nil && resp.Body != nil {
				resp.Body.Close()
			}
			if resp != nil && (resp.StatusCode == 401 || resp.StatusCode == 403) {
				return ErrRevoked
			}
			a.log("warn", "Relay unavailable; reconnecting in "+strconv.Itoa(int(delay/time.Second))+"s.")
		} else {
			started := time.Now()
			e = a.session(ctx, conn)
			conn.Close()
			if errors.Is(e, ErrRevoked) {
				return e
			}
			if time.Since(started) > 30*time.Second {
				delay = time.Second
			}
			if ctx.Err() == nil {
				a.log("warn", "Relay disconnected; reconnecting.")
			}
		}
		if pause(ctx, delay) != nil {
			break
		}
		delay *= 2
		if delay > 30*time.Second {
			delay = 30 * time.Second
		}
	}
	a.log("info", "Go agent stopped.")
	return ctx.Err()
}
func (a *Agent) session(parent context.Context, conn *websocket.Conn) error {
	a.mu.Lock()
	a.connectionSequence++
	a.connectedAt = time.Now().UTC().Format(time.RFC3339Nano)
	sequence := a.connectionSequence
	a.mu.Unlock()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	awake := power.New()
	defer awake.Close()
	var write sync.Mutex
	send := func(v any) error {
		write.Lock()
		defer write.Unlock()
		conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
		return conn.WriteJSON(v)
	}
	if e := send(a.hello(ctx)); e != nil {
		return e
	}
	a.mu.Lock()
	a.connected = true
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.connected = false; a.mu.Unlock() }()
	a.log("success", fmt.Sprintf("Connected · Go agent %s · session %d", a.Version, sequence))
	conn.SetReadLimit(32 << 20)
	conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(75 * time.Second)) })
	var frames <-chan browserrunner.ViewFrame
	if a.Browser != nil {
		frames = a.Browser.Frames()
	}
	var workers sync.WaitGroup
	slots := make(chan struct{}, 32)
	finished := make(chan struct{})
	revoked := make(chan struct{}, 1)
	go func() {
		defer close(finished)
		presence := time.NewTicker(30 * time.Second)
		attention := time.NewTicker(time.Second)
		defer attention.Stop()
		heartbeat := time.NewTicker(15 * time.Minute)
		defer presence.Stop()
		defer heartbeat.Stop()
		for {
			select {
			case <-ctx.Done():
				conn.Close()
				return
			case frame := <-frames:
				if send(frame) != nil {
					cancel()
				}
			case <-attention.C:
				if a.Browser != nil {
					for _, event := range a.Browser.PendingAttention() {
						if send(event) != nil {
							cancel()
							break
						}
					}
				}
			case <-presence.C:
				if !a.identityValid() {
					revoked <- struct{}{}
					cancel()
					continue
				}
				if send(a.hello(ctx)) != nil {
					cancel()
					continue
				}
				write.Lock()
				e := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
				write.Unlock()
				if e != nil {
					cancel()
				}
			case <-heartbeat.C:
				if errors.Is(a.heartbeat(ctx), ErrRevoked) {
					revoked <- struct{}{}
					cancel()
				}
			}
		}
	}()
	defer func() { cancel(); conn.Close(); <-finished; workers.Wait() }()
	for {
		_, data, e := conn.ReadMessage()
		if e != nil {
			select {
			case <-revoked:
				return ErrRevoked
			default:
				return e
			}
		}
		conn.SetReadDeadline(time.Now().Add(75 * time.Second))
		var ack browserrunner.Attention
		if json.Unmarshal(data, &ack) == nil && ack.Type == "runner_attention_ack" {
			if a.Browser != nil {
				a.Browser.AckAttention(ack)
			}
			continue
		}
		var control struct {
			Type      string `json:"type"`
			SessionID string `json:"session_id"`
			Action    string `json:"action"`
		}
		if json.Unmarshal(data, &control) == nil && control.Type == "runner_view" {
			if a.Browser != nil && (control.Action == "watch" || control.Action == "stop") {
				a.Browser.ViewHeartbeat(control.SessionID, control.Action == "watch")
			}
			continue
		}
		var call protocol.Call
		if json.Unmarshal(data, &call) != nil || call.Type != "call" || call.ID == "" || call.Tool == "" || len(call.ID) > 256 || len(call.Tool) > 100 {
			continue
		}
		select {
		case slots <- struct{}{}:
		default:
			_ = send(map[string]any{"type": "result", "id": call.ID, "error": "Too many concurrent device calls."})
			continue
		}
		workers.Add(1)
		go func(call protocol.Call) {
			defer workers.Done()
			releaseSlot := sync.OnceFunc(func() { <-slots })
			defer releaseSlot()
			started := time.Now()
			a.log("event", "tool.call "+call.Tool+" · "+call.ID)
			result, err := a.dispatch(ctx, call, awake)
			response := map[string]any{"type": "result", "id": call.ID}
			if err != nil {
				response["error"] = err.Error()
				a.log("error", fmt.Sprintf("tool.error %s · %s · %dms · %s", call.Tool, call.ID, time.Since(started).Milliseconds(), failureClass(err)))
			} else {
				response["result"] = result
				a.log("success", fmt.Sprintf("tool.done %s · %s · %dms", call.Tool, call.ID, time.Since(started).Milliseconds()))
			}
			// A completed call must free capacity BEFORE its result allows the
			// client to submit the next full batch. Otherwise back-to-back batches
			// of 32 calls can spuriously hit the 32-worker admission limit.
			releaseSlot()
			if send(response) != nil {
				cancel()
			}
			if (call.Tool == "set_background_agent" || call.Tool == "set_device_runtime") && err == nil {
				_ = send(a.hello(ctx))
				if errors.Is(a.heartbeat(ctx), ErrRevoked) {
					select {
					case revoked <- struct{}{}:
					default:
					}
					cancel()
				}
			}
		}(call)
	}
}

// Never log request arguments or returned file contents. These may contain secrets.
func CleanMessage(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 32 && r != '\t' {
			return -1
		}
		return r
	}, s)
}
func failureClass(e error) string {
	s := e.Error()
	switch {
	case strings.Contains(s, "Safety Guard"):
		return "blocked by command safety guard"
	case strings.Contains(s, "Blocked by Remote Arc") || strings.Contains(s, "permission mode"):
		return "blocked by device policy"
	case strings.Contains(s, "FILE_CHANGED") || strings.Contains(s, "changed again") || strings.Contains(s, "checkpoint changed"):
		return "concurrent change detected"
	case errors.Is(e, context.Canceled):
		return "cancelled"
	case errors.Is(e, context.DeadlineExceeded):
		return "deadline exceeded"
	default:
		return "operation failed; see tool response"
	}
}
