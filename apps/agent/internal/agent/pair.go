package agent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func Arch() string {
	if runtime.GOARCH == "amd64" {
		return "x64"
	}
	if runtime.GOARCH == "386" {
		return "ia32"
	}
	return runtime.GOARCH
}

type PairingStart struct {
	DeviceCode           string `json:"device_code"`
	DeviceSecret         string `json:"device_secret"`
	UserCode             string `json:"user_code"`
	VerificationURI      string `json:"verification_uri"`
	VerificationComplete string `json:"verification_uri_complete"`
	ExpiresIn            int    `json:"expires_in"`
	Interval             int    `json:"interval"`
}
type PairingToken struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
}

// errPairingExpired ends one pairing code that was not approved in time.
var errPairingExpired = errors.New("Pairing cancelled or expired; run remotelink again to retry.")

// pairingSecond is the unit of the relay's expires_in and interval. Tests
// shorten it; it is always time.Second in a release.
var pairingSecond = time.Second

// Unattended pairing waits this long after a code fails, doubling up to the cap.
var unattendedRetryFirst, unattendedRetryMax = 10 * time.Minute, time.Hour

// retryablePairing marks a failure that a later pairing code may get past:
// the relay was unreachable or busy, or the code expired. Its message is
// unchanged.
type retryablePairing struct{ error }

func (e retryablePairing) Unwrap() error { return e.error }

// Pair shows one pairing code and waits for it to be approved in the browser.
func (c *Client) Pair(ctx context.Context, origin, mode string, output io.Writer, open func(string) error) (config.Config, error) {
	return c.pairOnce(ctx, origin, mode, output, open)
}

// PairUnattended pairs where nobody may be watching, such as a container or a
// service log. An expired code or an unavailable relay does not end the
// process: a new code is shown after a growing delay. Exiting instead would
// let a supervisor that restarts on exit turn into an endless pairing loop.
func (c *Client) PairUnattended(ctx context.Context, origin, mode string, output io.Writer, open func(string) error) (config.Config, error) {
	wait := unattendedRetryFirst
	for {
		saved, e := c.pairOnce(ctx, origin, mode, output, open)
		var retry retryablePairing
		if e == nil || ctx.Err() != nil || !errors.As(e, &retry) {
			return saved, e
		}
		fmt.Fprintf(output, "Pairing was not completed (%s). A new pairing code will be shown in %s.\n", strings.TrimSuffix(e.Error(), "."), retryLabel(wait))
		if pause(ctx, wait) != nil {
			return saved, ctx.Err()
		}
		wait = min(wait*2, unattendedRetryMax)
	}
}

func retryLabel(d time.Duration) string {
	if d >= time.Minute {
		return fmt.Sprintf("%d min", int(d.Minutes()))
	}
	return d.String()
}

func (c *Client) pairOnce(ctx context.Context, origin, mode string, output io.Writer, open func(string) error) (config.Config, error) {
	var saved config.Config
	origin, e := Origin(origin)
	if e != nil {
		return saved, e
	}
	hostname, _ := os.Hostname()
	var start PairingStart
	status, e := c.Request(ctx, origin, "", "POST", "/api/device/start", map[string]any{"device_name": hostname, "platform": protocol.Platform(runtime.GOOS), "arch": Arch(), "hostname": hostname}, &start)
	if e != nil {
		if status == 0 || status == 429 || status >= 500 {
			return saved, retryablePairing{e}
		}
		return saved, e
	}
	if start.DeviceCode == "" || start.DeviceSecret == "" || start.ExpiresIn < 1 || start.ExpiresIn > 86400 {
		return saved, errors.New("Invalid pairing response.")
	}
	link := start.VerificationComplete
	if link == "" {
		link = start.VerificationURI
	}
	if link == "" {
		return saved, errors.New("Pairing response did not include an authorization URL.")
	}
	fmt.Fprintf(output, "Pair this computer: %s\nCode: %s\n", link, start.UserCode)
	if open != nil {
		_ = open(link)
	}
	interval := start.Interval
	if interval < 2 {
		interval = 2
	}
	if interval > 60 {
		interval = 60
	}
	deadline, cancel := context.WithTimeout(ctx, time.Duration(start.ExpiresIn)*pairingSecond)
	defer cancel()
	for {
		if e = pause(deadline, time.Duration(interval)*pairingSecond); e != nil {
			return saved, retryablePairing{errPairingExpired}
		}
		var token PairingToken
		status, err := c.Request(deadline, origin, "", "POST", "/api/device/token", map[string]any{"device_code": start.DeviceCode, "device_secret": start.DeviceSecret}, &token)
		if status == 428 {
			continue
		}
		if status == 429 {
			// Polling too fast for the relay: slow down as RFC 8628 slow_down does.
			interval = min(interval+5, 60)
			continue
		}
		if err != nil {
			if status == 0 || status >= 500 {
				continue
			}
			if status == 400 {
				// The relay answers 400 once the code has expired on its clock.
				return saved, retryablePairing{err}
			}
			return saved, err
		}
		if token.DeviceID == "" || token.DeviceToken == "" {
			return saved, errors.New("Invalid pairing token response.")
		}
		saved = config.Config{DeviceID: token.DeviceID, DeviceToken: token.DeviceToken, DeviceName: hostname, Origin: origin, Mode: mode}
		return saved, config.Save(saved)
	}
}
