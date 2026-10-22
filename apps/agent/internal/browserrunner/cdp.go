package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// cdpConn is a minimal Chrome DevTools Protocol client for one page target.
// It deliberately exposes only command/response and a single event callback:
// the Runner owns all policy, so no generic "evaluate anything" surface leaks
// to MCP callers.
type cdpConn struct {
	ws      *websocket.Conn
	next    atomic.Int64
	write   sync.Mutex
	mu      sync.Mutex
	pending map[int64]chan cdpReply
	onEvent func(session, method string, params json.RawMessage)
	closed  chan struct{}
	once    sync.Once
	err     error
}

type cdpReply struct {
	Result json.RawMessage
	Err    error
}

type cdpMessage struct {
	ID        int64           `json:"id,omitempty"`
	SessionID string          `json:"sessionId,omitempty"`
	Method    string          `json:"method,omitempty"`
	Params    json.RawMessage `json:"params,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

var errBrowserGone = errors.New("Browser Runner lost its browser connection; the session checkpoint was kept.")

func dialCDP(ctx context.Context, url string, onEvent func(string, string, json.RawMessage)) (*cdpConn, error) {
	// Loopback only: never proxy a DevTools connection.
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second, Proxy: nil}
	ws, resp, err := dialer.DialContext(ctx, url, nil)
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
	if err != nil {
		return nil, err
	}
	ws.SetReadLimit(64 << 20)
	c := &cdpConn{ws: ws, pending: map[int64]chan cdpReply{}, onEvent: onEvent, closed: make(chan struct{})}
	go c.readLoop()
	return c, nil
}

func (c *cdpConn) readLoop() {
	defer c.shutdown(errBrowserGone)
	for {
		var m cdpMessage
		if err := c.ws.ReadJSON(&m); err != nil {
			return
		}
		if m.ID != 0 {
			c.mu.Lock()
			ch := c.pending[m.ID]
			delete(c.pending, m.ID)
			c.mu.Unlock()
			if ch != nil {
				r := cdpReply{Result: m.Result}
				if m.Error != nil {
					r.Err = fmt.Errorf("browser protocol error %d: %s", m.Error.Code, m.Error.Message)
				}
				ch <- r
			}
			continue
		}
		if m.Method != "" && c.onEvent != nil {
			c.onEvent(m.SessionID, m.Method, m.Params)
		}
	}
}

func (c *cdpConn) shutdown(err error) {
	c.once.Do(func() {
		c.mu.Lock()
		c.err = err
		for id, ch := range c.pending {
			ch <- cdpReply{Err: err}
			delete(c.pending, id)
		}
		c.mu.Unlock()
		close(c.closed)
		_ = c.ws.Close()
	})
}

func (c *cdpConn) Close() { c.shutdown(errBrowserGone) }

func (c *cdpConn) Alive() bool {
	select {
	case <-c.closed:
		return false
	default:
		return true
	}
}

// Call sends one command to the page target and decodes its result.
func (c *cdpConn) Call(ctx context.Context, method string, params any, out any) error {
	return c.CallIn(ctx, "", method, params, out)
}

// CallIn sends one command to a flattened child session (an out-of-process
// iframe); an empty session is the page target itself.
func (c *cdpConn) CallIn(ctx context.Context, session, method string, params any, out any) error {
	id := c.next.Add(1)
	ch := make(chan cdpReply, 1)
	c.mu.Lock()
	if c.err != nil {
		err := c.err
		c.mu.Unlock()
		return err
	}
	c.pending[id] = ch
	c.mu.Unlock()
	raw, err := json.Marshal(params)
	if err != nil {
		return err
	}
	if params == nil {
		raw = []byte("{}")
	}
	c.write.Lock()
	_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
	err = c.ws.WriteJSON(cdpMessage{ID: id, SessionID: session, Method: method, Params: raw})
	c.write.Unlock()
	if err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return errBrowserGone
	}
	select {
	case r := <-ch:
		if r.Err != nil {
			return r.Err
		}
		if out != nil && len(r.Result) > 0 {
			return json.Unmarshal(r.Result, out)
		}
		return nil
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return ctx.Err()
	}
}

// Fire sends a command without waiting. It is only used from the event
// goroutine, where blocking on a reply would deadlock the read loop.
func (c *cdpConn) Fire(method string, params any) { c.FireIn("", method, params) }

func (c *cdpConn) FireIn(session, method string, params any) {
	raw, _ := json.Marshal(params)
	id := c.next.Add(1)
	c.write.Lock()
	defer c.write.Unlock()
	_ = c.ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_ = c.ws.WriteJSON(cdpMessage{ID: id, SessionID: session, Method: method, Params: raw})
}
