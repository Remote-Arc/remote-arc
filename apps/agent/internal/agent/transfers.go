package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
)

// relayTransfers is the Agent's side of the Relay's device transfer API
// (docs/file-transfer.md). Bytes go over HTTPS with the device credential,
// never over the control WebSocket.
type relayTransfers struct {
	agent *Agent
	http  *http.Client
}

func newRelayTransfers(a *Agent) *relayTransfers {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = time.Minute
	return &relayTransfers{agent: a, http: &http.Client{
		Transport:     transport,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

var _ execution.TransferClient = (*relayTransfers)(nil)

func (r *relayTransfers) do(ctx context.Context, method, path string, body io.Reader, length int64, header http.Header) (*http.Response, error) {
	cfg := r.agent.cfg()
	base, e := Origin(cfg.Origin)
	if e != nil {
		return nil, e
	}
	req, e := http.NewRequestWithContext(ctx, method, base+"/api/device/transfers/"+path, body)
	if e != nil {
		return nil, e
	}
	if body != nil {
		req.ContentLength = length
	}
	for key, values := range header {
		req.Header[key] = values
	}
	req.Header.Set("Authorization", "Bearer "+cfg.DeviceToken)
	resp, e := r.http.Do(req)
	if e != nil {
		return nil, errors.New("Remote Arc transfer request failed; check the network connection.")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		var problem struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&problem)
		if problem.Error == "" {
			problem.Error = "no detail"
		}
		return nil, fmt.Errorf("Remote Arc returned HTTP %d for the transfer: %s", resp.StatusCode, problem.Error)
	}
	return resp, nil
}

func (r *relayTransfers) json(ctx context.Context, method, path string, input, output any) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	var body io.Reader
	var length int64
	header := http.Header{}
	if input != nil {
		b, e := json.Marshal(input)
		if e != nil {
			return e
		}
		body, length = bytes.NewReader(b), int64(len(b))
		header.Set("Content-Type", "application/json")
	}
	resp, e := r.do(ctx, method, path, body, length, header)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if output != nil {
		return json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(output)
	}
	return nil
}

func (r *relayTransfers) Info(ctx context.Context, id string) (execution.TransferInfo, error) {
	var info execution.TransferInfo
	return info, r.json(ctx, "GET", url.PathEscape(id), nil, &info)
}

func (r *relayTransfers) Download(ctx context.Context, id string, offset int64) (io.ReadCloser, error) {
	header := http.Header{}
	if offset > 0 {
		header.Set("Range", "bytes="+strconv.FormatInt(offset, 10)+"-")
	}
	resp, e := r.do(ctx, "GET", url.PathEscape(id)+"/content", nil, 0, header)
	if e != nil {
		return nil, e
	}
	// A Relay that ignored the range would resend the file from the start.
	if offset > 0 && resp.StatusCode != http.StatusPartialContent {
		resp.Body.Close()
		return nil, errors.New("Remote Arc did not resume the download from the requested offset.")
	}
	return resp.Body, nil
}

func (r *relayTransfers) UploadPart(ctx context.Context, id string, part int, body io.Reader, length int64) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	resp, e := r.do(ctx, "PUT", url.PathEscape(id)+"/parts/"+strconv.Itoa(part), body, length, http.Header{"Content-Type": {"application/octet-stream"}})
	if e != nil {
		return e
	}
	resp.Body.Close()
	return nil
}

func (r *relayTransfers) SourceComplete(ctx context.Context, id, sum string, size int64) error {
	return r.json(ctx, "POST", url.PathEscape(id)+"/source-complete", map[string]any{"sha256": sum, "size": size}, nil)
}

func (r *relayTransfers) Report(ctx context.Context, id string, report map[string]any) error {
	err := r.json(ctx, "POST", url.PathEscape(id)+"/result", report, nil)
	if err != nil {
		r.agent.log("warn", "File transfer result could not be reported: "+err.Error())
	}
	return err
}
