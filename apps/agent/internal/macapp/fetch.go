package macapp

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

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// TeamID is the Apple Developer team that signs the Agent app.
const TeamID = "U94L2UMT25"

// The app archive comes from Remote Arc's release mirror or GitHub; its
// checksum only ever comes from GitHub, as for every other Agent download.
const (
	mirrorURL       = "https://remotearc.app/api/downloads/release/remotelink-v%s/%s"
	githubURL       = "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v%s/%s"
	maxManifest     = 64 << 10
	maxArchiveBytes = 100 << 20
)

var stableRelease = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// Fetcher gets the signed Agent app of a release, so an Agent installed as a
// bare binary (Homebrew, npm, the curl installer) can run its background
// service from Remote Arc.app, which macOS names and draws as Remote Arc.
type Fetcher struct {
	HTTP *http.Client
	Home string
	// ManifestURL takes the version; ArchiveURLs take the version and asset.
	ManifestURL string
	ArchiveURLs []string
	// Verify checks the unpacked app's code signature.
	Verify func(ctx context.Context, app string) error
	// Probe runs the app's program with --version.
	Probe func(ctx context.Context, program string) (string, error)
}

// NewFetcher uses the published sources and the real signature check.
func NewFetcher(home string) *Fetcher {
	return &Fetcher{
		HTTP:        &http.Client{Timeout: 2 * time.Minute},
		Home:        home,
		ManifestURL: ManifestURL,
		ArchiveURLs: []string{mirrorURL, githubURL},
		Verify:      VerifySignature,
		Probe:       probeVersion,
	}
}

// Fetch downloads, checks and unpacks the Agent app of version and returns its
// program and the archive's checksum. Nothing is returned unless the archive
// matches the checksum published on GitHub, the app carries Remote Arc's
// Developer ID signature and its program reports version.
func (f *Fetcher) Fetch(ctx context.Context, version string) (string, string, error) {
	if !stableRelease.MatchString(version) {
		return "", "", fmt.Errorf("no Agent app is published for %q", version)
	}
	asset := Asset(version)
	checksum, err := f.checksum(ctx, version, asset)
	if err != nil {
		return "", "", err
	}
	dir := filepath.Join(f.Home, ".remotearc", "agent", "downloads", version)
	archive, err := f.download(ctx, version, asset, checksum, dir)
	if err != nil {
		return "", "", err
	}
	program, err := Extract(archive, dir)
	if err != nil {
		return "", "", err
	}
	if f.Verify == nil {
		return "", "", errors.New("no signature check is configured")
	}
	if err := f.Verify(ctx, EnclosingApp(program)); err != nil {
		return "", "", fmt.Errorf("the Agent app is not signed by Remote Arc: %v", err)
	}
	if got, err := f.Probe(ctx, program); err != nil || got != version {
		return "", "", fmt.Errorf("the Agent app did not report v%s", version)
	}
	return program, checksum, nil
}

func (f *Fetcher) get(ctx context.Context, url string, limit int64) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	response, err := f.HTTP.Do(request)
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

func (f *Fetcher) checksum(ctx context.Context, version, asset string) (string, error) {
	body, err := f.get(ctx, fmt.Sprintf(f.ManifestURL, version), maxManifest)
	if err != nil {
		return "", fmt.Errorf("no Agent app checksum is published for v%s: %v", version, err)
	}
	var manifest struct {
		Version   string            `json:"version"`
		Checksums map[string]string `json:"checksums"`
	}
	if json.Unmarshal(body, &manifest) != nil || manifest.Version != version {
		return "", fmt.Errorf("the published Agent app checksums are not for v%s", version)
	}
	checksum := manifest.Checksums[asset]
	if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(checksum) {
		return "", fmt.Errorf("no checksum is published for %s", asset)
	}
	return checksum, nil
}

// download keeps only bytes matching checksum, beside the Agent's other downloads.
func (f *Fetcher) download(ctx context.Context, version, asset, checksum, dir string) (string, error) {
	archive := filepath.Join(dir, asset)
	if existing, err := os.ReadFile(archive); err == nil && digest(existing) == checksum {
		return archive, nil
	}
	failure := "no download source"
	for _, source := range f.ArchiveURLs {
		body, err := f.get(ctx, fmt.Sprintf(source, version, asset), maxArchiveBytes)
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
		if err := config.DurableWrite(archive, body, 0o600); err != nil {
			return "", err
		}
		return archive, nil
	}
	return "", fmt.Errorf("could not download %s: %s", asset, failure)
}

// VerifySignature accepts only an app signed by Remote Arc's Developer ID as
// the Agent app (app.remotearc.agent).
func VerifySignature(ctx context.Context, app string) error {
	if runtime.GOOS != "darwin" {
		return errors.New("the Agent app's signature can only be checked on macOS")
	}
	if app == "" {
		return errors.New("not an app")
	}
	requirement := `anchor apple generic and identifier "` + BundleID +
		`" and certificate leaf[subject.OU] = "` + TeamID + `"`
	check, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(check, "/usr/bin/codesign", "--verify", "--strict", "-R="+requirement, app).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func probeVersion(ctx context.Context, program string) (string, error) {
	probe, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(probe, program, "--version").Output()
	return strings.TrimSpace(string(out)), err
}

func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
