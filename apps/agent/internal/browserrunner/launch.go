package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// FindBrowser returns an installed Chromium-family browser. Remote Arc does not
// download a browser or a Node/Playwright driver: Windows ships Edge, and most
// macOS/Linux desktops already have Chrome, Edge or Chromium. An explicit
// REMOTEARC_BROWSER_PATH wins so users and CI can pin a binary.
func FindBrowser() (string, error) {
	if p := strings.TrimSpace(os.Getenv("REMOTEARC_BROWSER_PATH")); p != "" {
		if isExecutable(p) {
			return p, nil
		}
		return "", fmt.Errorf("REMOTEARC_BROWSER_PATH does not point to an executable browser.")
	}
	for _, c := range browserCandidates() {
		if filepath.IsAbs(c) {
			if isExecutable(c) {
				return c, nil
			}
			continue
		}
		if p, e := exec.LookPath(c); e == nil {
			return p, nil
		}
	}
	return "", errors.New("browser_runner needs Google Chrome, Microsoft Edge or Chromium installed on this device.")
}

func isExecutable(p string) bool {
	s, e := os.Stat(p)
	if e != nil || s.IsDir() {
		return false
	}
	return runtime.GOOS == "windows" || s.Mode()&0111 != 0
}

func browserCandidates() []string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		out := []string{}
		for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
			if base == "" {
				continue
			}
			out = append(out,
				filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
				filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(base, "Chromium", "Application", "chrome.exe"))
		}
		return out
	case "darwin":
		out := []string{}
		for _, root := range []string{"/Applications", filepath.Join(home, "Applications")} {
			out = append(out,
				filepath.Join(root, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
				filepath.Join(root, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
				filepath.Join(root, "Chromium.app", "Contents", "MacOS", "Chromium"))
		}
		return out
	default:
		out := []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"}
		// Pre-provisioned Playwright browsers (CI images, dev containers).
		for _, root := range []string{os.Getenv("PLAYWRIGHT_BROWSERS_PATH"), "/opt/pw-browsers", filepath.Join(home, ".cache", "ms-playwright")} {
			if root == "" {
				continue
			}
			matches, _ := filepath.Glob(filepath.Join(root, "chromium-*", "chrome-linux", "chrome"))
			sort.Sort(sort.Reverse(sort.StringSlice(matches)))
			out = append(out, matches...)
		}
		return out
	}
}

type browserProcess struct {
	cmd        *exec.Cmd
	exited     chan struct{}
	port       int
	browserWS  string
	attached   bool // reused a browser that survived an Agent restart
	profileDir string
}

func readActivePort(profile string) (int, string, error) {
	b, e := os.ReadFile(filepath.Join(profile, "DevToolsActivePort"))
	if e != nil {
		return 0, "", e
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) < 2 {
		return 0, "", errors.New("incomplete DevToolsActivePort")
	}
	port, e := strconv.Atoi(strings.TrimSpace(lines[0]))
	if e != nil || port <= 0 || port > 65535 {
		return 0, "", errors.New("invalid DevToolsActivePort")
	}
	return port, strings.TrimSpace(lines[1]), nil
}

var loopback = &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{Proxy: nil}}

func devtoolsJSON(ctx context.Context, port int, path string, out any) error {
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:"+strconv.Itoa(port)+path, nil)
	resp, e := loopback.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("devtools %s: %s", path, resp.Status)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(out)
}

// attachExisting reuses a browser that kept running after the Agent stopped.
// It must belong to this profile: the browser websocket path recorded in the
// profile has to match the live endpoint on that port.
func attachExisting(ctx context.Context, profile string) (*browserProcess, bool) {
	port, path, e := readActivePort(profile)
	if e != nil {
		return nil, false
	}
	var v struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if devtoolsJSON(ctx, port, "/json/version", &v) != nil || !strings.HasSuffix(v.WebSocketDebuggerURL, path) {
		return nil, false
	}
	return &browserProcess{port: port, browserWS: v.WebSocketDebuggerURL, attached: true, profileDir: profile}, true
}

func launchBrowser(ctx context.Context, exe, profile string, headless bool) (*browserProcess, error) {
	if p, ok := attachExisting(ctx, profile); ok {
		return p, nil
	}
	wait := startupWait(profile)
	if e := os.MkdirAll(profile, 0700); e != nil {
		return nil, e
	}
	_ = os.Remove(filepath.Join(profile, "DevToolsActivePort"))
	args := []string{
		"--user-data-dir=" + profile,
		"--remote-debugging-address=127.0.0.1",
		"--remote-debugging-port=0",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-sync",
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-default-apps",
		// A headed task window is often behind other windows; Chromium would
		// otherwise throttle it and drop synthetic input (Windows occlusion).
		"--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,CalculateNativeWinOcclusion",
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		"--disable-background-timer-throttling",
		"--password-store=basic",
		"--use-mock-keychain",
		"--window-size=1280,900",
	}
	if headless {
		args = append(args, "--headless=new", "--hide-scrollbars", "--mute-audio")
	}
	if runtime.GOOS == "linux" && os.Geteuid() == 0 {
		// Chromium refuses to start as root with its sandbox (containers/CI).
		args = append(args, "--no-sandbox")
	}
	args = append(args, "about:blank")
	cmd := exec.Command(exe, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	detach(cmd)
	if e := cmd.Start(); e != nil {
		return nil, fmt.Errorf("browser_runner could not start the browser: %w", e)
	}
	exited := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exited) }()
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		select {
		case <-exited:
			return nil, errors.New("The browser exited during startup. If this profile is open in another window, close it and retry.")
		case <-ctx.Done():
			_ = cmd.Process.Kill()
			return nil, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
		port, path, e := readActivePort(profile)
		if e != nil {
			continue
		}
		var v struct {
			WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
		}
		if devtoolsJSON(ctx, port, "/json/version", &v) == nil && strings.HasSuffix(v.WebSocketDebuggerURL, path) {
			return &browserProcess{cmd: cmd, exited: exited, port: port, browserWS: v.WebSocketDebuggerURL, profileDir: profile}, nil
		}
	}
	_ = cmd.Process.Kill()
	return nil, fmt.Errorf("The browser did not open its local automation endpoint within %s.", wait)
}

// startupWait is how long a launched browser gets to open its automation
// endpoint. The first start of a task profile does first-run setup and, on
// Windows, is often held by antivirus scanning, so it gets longer than a
// relaunch of a profile that has started before.
func startupWait(profile string) time.Duration {
	if _, e := os.Stat(filepath.Join(profile, "Local State")); e != nil {
		return 60 * time.Second
	}
	return 30 * time.Second
}

// pageTarget returns the websocket URL of a page target, creating one if the
// browser has none (for example after the user closed every tab).
func (b *browserProcess) pageTarget(ctx context.Context) (string, error) {
	var targets []struct {
		Type string `json:"type"`
		URL  string `json:"url"`
		WS   string `json:"webSocketDebuggerUrl"`
	}
	if e := devtoolsJSON(ctx, b.port, "/json/list", &targets); e != nil {
		return "", e
	}
	for _, t := range targets {
		if t.Type == "page" && t.WS != "" && !strings.HasPrefix(t.URL, "devtools://") {
			return t.WS, nil
		}
	}
	conn, e := dialCDP(ctx, b.browserWS, nil)
	if e != nil {
		return "", e
	}
	defer conn.Close()
	var created struct {
		TargetID string `json:"targetId"`
	}
	if e := conn.Call(ctx, "Target.createTarget", map[string]any{"url": "about:blank"}, &created); e != nil {
		return "", e
	}
	for i := 0; i < 20; i++ {
		if devtoolsJSON(ctx, b.port, "/json/list", &targets) == nil {
			for _, t := range targets {
				if t.Type == "page" && strings.HasSuffix(t.WS, created.TargetID) {
					return t.WS, nil
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return "", errors.New("browser_runner could not open a page.")
}

// stop closes the browser gracefully so the profile (cookies the user chose to
// keep for this account) is flushed, then kills it if needed.
func (b *browserProcess) stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if conn, e := dialCDP(ctx, b.browserWS, nil); e == nil {
		_ = conn.Call(ctx, "Browser.close", nil, nil)
		conn.Close()
	}
	if b.cmd != nil && b.cmd.Process != nil {
		select {
		case <-b.exited:
		case <-time.After(3 * time.Second):
			_ = b.cmd.Process.Kill()
			<-b.exited
		}
	}
	_ = os.Remove(filepath.Join(b.profileDir, "DevToolsActivePort"))
}
