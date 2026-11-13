package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/release"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// UpdateTool replaces this Agent with a newer published release, started from
// Dashboard. Only an Agent running as its background service offers it.
//   - Linux: the systemd unit is rewritten to the new binary, then this worker
//     exits and systemd starts the new one. systemd stops every process in the
//     unit's cgroup, so no helper could outlive this worker anyway.
//   - macOS and Windows: the new binary is started detached with --background
//     --update-handoff and takes over through the CLI's own upgrade handoff, the
//     same path as running the installer by hand: it stops this Agent, retires
//     its service and installs its own, keeping pairing and permissions. It then
//     exits, so the new background service, not a detached process, runs it.
const UpdateTool = "update_agent"

// The checksum manifest always comes from GitHub Releases, never from the Relay,
// so a Relay that is compromised can at most install another published release.
const (
	releaseManifestURL = "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v%s/go-binaries.json"
	releaseMirrorURL   = "https://remotearc.app/api/downloads/release/remotelink-v%s/%s"
	releaseGitHubURL   = "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v%s/%s"
	maxManifestBytes   = 64 << 10
	maxBinaryBytes     = 100 << 20
)

var stableRelease = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// Updater holds everything an update touches, so tests can replace each part.
type Updater struct {
	Version  string // the running release
	Platform string
	Arch     string
	Home     string
	HTTP     *http.Client
	// URLs take the version, and the binary URLs also the asset name.
	ManifestURL string
	BinaryURLs  []string
	// Background reports whether this worker runs as the enabled, active service.
	Background func(ctx context.Context) bool
	// Busy names work a restart would interrupt, or "" when idle.
	Busy func() string
	// Probe runs the downloaded binary's --version.
	Probe func(ctx context.Context, binary string) (string, error)
	// Install prepares the background service for binary, without stopping this
	// worker. On macOS and Windows the new binary's handoff installs it instead.
	Install func(ctx context.Context, binary, version string) error
	// Restart hands over to the verified binary after the reply is sent.
	Restart func(binary string)
}

func newUpdater(a *Agent) *Updater { return newUpdaterFor(a, runtime.GOOS) }

// newUpdaterFor wires the update for one platform; tests pick the platform.
func newUpdaterFor(a *Agent, platform string) *Updater {
	u := &Updater{
		Version:     a.Version,
		Platform:    platform,
		Arch:        runtime.GOARCH,
		Home:        config.Home(),
		HTTP:        &http.Client{Timeout: 2 * time.Minute},
		ManifestURL: releaseManifestURL,
		BinaryURLs:  []string{releaseMirrorURL, releaseGitHubURL},
		Background: func(ctx context.Context) bool {
			if !a.BackgroundProcess || a.Background == nil {
				return false
			}
			status := a.Background.Status(ctx)
			cfg := a.cfg()
			return cfg.BackgroundEnabled != nil && *cfg.BackgroundEnabled && status.Enabled && status.Active
		},
		Busy:  func() string { return busySummary(a.Status()) },
		Probe: probeVersion,
	}
	if platform == "linux" {
		u.Install = installService
		u.Restart = func(string) {
			if a.Stop != nil {
				a.Stop()
			}
		}
		return u
	}
	u.Install = func(context.Context, string, string) error { return nil }
	u.Restart = func(binary string) {
		if err := startHandoff(u.Home, binary); err != nil {
			a.log("error", "Could not start the updated Agent: "+err.Error())
		}
	}
	return u
}

func busySummary(status map[string]any) string {
	work, _ := status["activeWork"].(map[string]any)
	parts := []string{}
	if n, _ := work["managedProcesses"].(int); n > 0 {
		parts = append(parts, fmt.Sprintf("%d managed process(es)", n))
	}
	if n, _ := work["browser_runner_sessions"].(int); n > 0 {
		parts = append(parts, fmt.Sprintf("%d browser_runner session(s)", n))
	}
	return strings.Join(parts, ", ")
}

// Supported reports whether this platform can update itself remotely.
func (u *Updater) Supported() bool {
	return u.Platform == "linux" || u.Platform == "darwin" || u.Platform == "windows"
}

// asset is the published file name, as the npm launcher's goAsset() builds it.
func (u *Updater) asset(version string) (string, error) {
	cpu := map[string]string{"amd64": "amd64", "arm64": "arm64"}[u.Arch]
	if cpu == "" || !u.Supported() {
		return "", fmt.Errorf("AGENT_UPDATE_UNSUPPORTED: no published Agent for %s/%s", u.Platform, u.Arch)
	}
	name := "remotelink-v" + version + "-" + u.Platform + "-" + cpu
	if u.Platform == "windows" {
		name += ".exe"
	}
	return name, nil
}

// Update downloads, verifies and installs version, then schedules the restart.
// Every refusal happens before anything on disk or in the service changes.
func (u *Updater) Update(ctx context.Context, version string) (map[string]any, error) {
	if !stableRelease.MatchString(version) {
		return nil, errors.New("AGENT_UPDATE_INVALID_VERSION: version must be a stable release such as 1.2.3")
	}
	if !release.Older(u.Version, version) {
		return nil, fmt.Errorf("AGENT_UPDATE_NOT_NEWER: this Agent runs v%s; only a newer release can be installed remotely", u.Version)
	}
	if !u.Supported() {
		return nil, errors.New("AGENT_UPDATE_UNSUPPORTED: remote updates are available on Linux, macOS and Windows; rerun the installer on this computer")
	}
	if !u.Background(ctx) {
		return nil, errors.New("AGENT_UPDATE_NEEDS_BACKGROUND: remote updates need the Agent running as its background service; rerun the installer with --background")
	}
	if busy := u.Busy(); busy != "" {
		return nil, fmt.Errorf("AGENT_UPDATE_BUSY: the Agent has active work (%s); update when it finishes", busy)
	}
	asset, err := u.asset(version)
	if err != nil {
		return nil, err
	}
	checksum, err := u.manifestChecksum(ctx, version, asset)
	if err != nil {
		return nil, err
	}
	binary, err := u.download(ctx, version, asset, checksum)
	if err != nil {
		return nil, err
	}
	if got, err := u.Probe(ctx, binary); err != nil || got != version {
		return nil, fmt.Errorf("AGENT_UPDATE_VERIFY_FAILED: the downloaded Agent did not report v%s", version)
	}
	if err := u.Install(ctx, binary, version); err != nil {
		return nil, fmt.Errorf("AGENT_UPDATE_INSTALL_FAILED: %v", err)
	}
	// Reply first: the Relay sees this result, then the Agent hands over to v<version>.
	go func() { time.Sleep(750 * time.Millisecond); u.Restart(binary) }()
	return map[string]any{"accepted": true, "from": u.Version, "version": version, "sha256": checksum}, nil
}

func (u *Updater) fetch(ctx context.Context, url string, limit int64) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	response, err := u.HTTP.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, errors.New("response exceeds the size limit")
	}
	return body, nil
}

func (u *Updater) manifestChecksum(ctx context.Context, version, asset string) (string, error) {
	body, err := u.fetch(ctx, fmt.Sprintf(u.ManifestURL, version), maxManifestBytes)
	if err != nil {
		return "", fmt.Errorf("AGENT_UPDATE_MANIFEST_UNAVAILABLE: cannot read the published checksums for v%s from GitHub: %v", version, err)
	}
	var manifest struct {
		Version   string            `json:"version"`
		Checksums map[string]string `json:"checksums"`
	}
	if json.Unmarshal(body, &manifest) != nil || manifest.Version != version {
		return "", fmt.Errorf("AGENT_UPDATE_MANIFEST_INVALID: the published checksums are not for v%s", version)
	}
	checksum := manifest.Checksums[asset]
	if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(checksum) {
		return "", fmt.Errorf("AGENT_UPDATE_MANIFEST_INVALID: no checksum is published for %s", asset)
	}
	return checksum, nil
}

// download tries each source in turn and keeps only bytes matching checksum,
// written next to the npm launcher's own downloads.
func (u *Updater) download(ctx context.Context, version, asset, checksum string) (string, error) {
	dir := filepath.Join(u.Home, ".remotearc", "agent", "downloads", version)
	binary := filepath.Join(dir, asset)
	if existing, err := os.ReadFile(binary); err == nil && digest(existing) == checksum {
		return binary, nil
	}
	failure := "no download source"
	for _, source := range u.BinaryURLs {
		body, err := u.fetch(ctx, fmt.Sprintf(source, version, asset), maxBinaryBytes)
		if err != nil {
			failure = err.Error()
			continue
		}
		if digest(body) != checksum {
			failure = "checksum does not match the published release"
			continue
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return "", err
		}
		if err := config.DurableWrite(binary, body, 0o700); err != nil {
			return "", err
		}
		return binary, nil
	}
	return "", fmt.Errorf("AGENT_UPDATE_DOWNLOAD_FAILED: %s", failure)
}

func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func probeVersion(ctx context.Context, binary string) (string, error) {
	probe, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(probe, binary, "--version").Output()
	return strings.TrimSpace(string(out)), err
}

// installService points the systemd unit at binary. The running worker keeps
// going until Restart; systemd then starts the new binary from the new unit.
func installService(ctx context.Context, binary, version string) error {
	controller := service.New(version)
	controller.Executable = binary
	_, err := controller.Enable(ctx)
	return err
}

// remoteUpdateReady: offered only by a Linux worker the background service started.
func (a *Agent) remoteUpdateReady() bool {
	return !a.WakeOnly && a.BackgroundProcess && a.updater().Supported()
}

// startHandoff starts binary --background --update-handoff outside this Agent's
// process tree, so retiring this Agent's service cannot stop it. The new binary
// takes over, installs its background service and exits, leaving the service to
// run it. Its output goes to logs/agent-update.log for diagnosis.
func startHandoff(home, binary string) error {
	logs := filepath.Join(home, ".remotearc", "logs")
	if err := os.MkdirAll(logs, 0o700); err != nil {
		return err
	}
	out, err := os.OpenFile(filepath.Join(logs, "agent-update.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer out.Close()
	cmd := exec.Command(binary, "--background", "--update-handoff")
	cmd.Stdout = out
	cmd.Stderr = out
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	// Reap it if it ends while this Agent is still running, for example when the
	// handoff refuses because new work started.
	go func() { _ = cmd.Wait() }()
	return nil
}

func (a *Agent) updateAgent(ctx context.Context, args map[string]any) (any, error) {
	version, _ := args["version"].(string)
	return a.updater().Update(ctx, version)
}

func (a *Agent) updater() *Updater {
	if a.Updater != nil {
		return a.Updater
	}
	return newUpdater(a)
}
