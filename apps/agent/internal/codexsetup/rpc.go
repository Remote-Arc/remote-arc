// Package codexsetup manages one owned, project-scoped local Codex integration.
// It uses the installed client's configuration API, never model generation.
package codexsetup

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// Failure is a redacted setup error. RPCCode keeps only the numeric JSON-RPC
// error code from Codex; vendor messages are never retained.
type Failure struct {
	Code, Hint string
	RPCCode    int
}

func (e *Failure) Error() string   { return e.Code + ": " + e.Hint }
func fail(code, hint string) error { return &Failure{Code: code, Hint: hint} }

type rpcClient struct {
	cmd    *exec.Cmd
	in     io.WriteCloser
	out    *bufio.Scanner
	cancel context.CancelFunc
	id     int
	mu     sync.Mutex
}

func command(ctx context.Context, binary string, args ...string) *exec.Cmd {
	c := exec.CommandContext(ctx, binary, args...)
	c.WaitDelay = time.Second
	hideWindow(c)
	return c
}

func startRPC(ctx context.Context, binary, profile string) (*rpcClient, error) {
	ctx, cancel := context.WithCancel(ctx)
	c := command(ctx, binary, "app-server")
	c.Dir = profile
	c.Env = profileEnv(profile)
	c.Stderr = io.Discard // Vendor diagnostics may contain config/credential data.
	in, err := c.StdinPipe()
	if err != nil {
		cancel()
		return nil, fail("client_start_failed", "Could not open the Codex control channel.")
	}
	out, err := c.StdoutPipe()
	if err != nil {
		cancel()
		in.Close()
		return nil, fail("client_start_failed", "Could not open the Codex control channel.")
	}
	if err = c.Start(); err != nil {
		cancel()
		in.Close()
		return nil, fail("client_start_failed", "Could not start the selected Codex executable.")
	}
	scanner := bufio.NewScanner(out)
	scanner.Buffer(make([]byte, 4096), 8<<20)
	r := &rpcClient{cmd: c, in: in, out: scanner, cancel: cancel}
	var initialized json.RawMessage
	if err = r.call("initialize", map[string]any{"clientInfo": map[string]any{"name": "remote_arc_setup", "version": "1"}, "capabilities": map[string]any{"experimentalApi": true, "explicitGatewayOauth": true}}, &initialized); err != nil {
		r.close()
		return nil, err
	}
	if err = json.NewEncoder(in).Encode(map[string]any{"method": "initialized"}); err != nil {
		r.close()
		return nil, fail("client_disconnected", "Codex initialization was interrupted; retry setup.")
	}
	return r, nil
}

func (r *rpcClient) close() {
	r.in.Close()
	done := make(chan error, 1)
	go func() { done <- r.cmd.Wait() }()
	select {
	case <-done:
	case <-time.After(time.Second):
		r.cancel()
		<-done
	}
	r.cancel()
}

func (r *rpcClient) call(method string, params, result any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.id++
	if err := json.NewEncoder(r.in).Encode(map[string]any{"id": r.id, "method": method, "params": params}); err != nil {
		return fail("client_disconnected", "Codex disconnected; rerun setup to reconcile the saved registration.")
	}
	for notifications := 0; notifications < 1000 && r.out.Scan(); notifications++ {
		var message struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Code int `json:"code"`
			} `json:"error"`
		}
		if json.Unmarshal(r.out.Bytes(), &message) != nil {
			return fail("client_protocol_invalid", "Codex returned an unsupported control response; update the client.")
		}
		if message.Method != "" {
			if len(message.ID) > 0 && string(message.ID) != "null" {
				// Setup cannot answer native trust, credential or user-input requests.
				_ = json.NewEncoder(r.in).Encode(map[string]any{"id": message.ID, "error": map[string]any{"code": -32601, "message": "Complete provider trust in the Codex client."}})
				return fail("provider_action_required", "Complete the required action in Codex, then retry setup.")
			}
			continue
		}
		if string(message.ID) != fmt.Sprint(r.id) {
			continue
		}
		if message.Error != nil {
			return &Failure{Code: "codex_request_rejected", Hint: fmt.Sprintf("Codex rejected %s (code %d); run setup doctor or update Codex. Private provider diagnostics were omitted.", method, message.Error.Code), RPCCode: message.Error.Code}
		}
		if len(message.Result) == 0 || json.Unmarshal(message.Result, result) != nil {
			return fail("client_protocol_invalid", "Codex returned an unsupported response shape; update the client.")
		}
		return nil
	}
	return fail("client_disconnected", "Codex timed out, disconnected or exceeded the response limit; retry to reconcile registration state.")
}
