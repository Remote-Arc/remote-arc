package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// A local DevTools protocol endpoint supplies browser-side replies/failures.
// The real CDP transport, session logic, policy and durable checkpoint remain
// under test; this is not a mock of the operation being asserted.
func protocolSession(t *testing.T, reply func(cdpMessage) (any, error)) (*session, <-chan cdpMessage) {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	calls := make(chan cdpMessage, 256)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		for {
			var message cdpMessage
			if ws.ReadJSON(&message) != nil {
				return
			}
			select {
			case calls <- message:
			default:
				t.Error("protocol fixture call buffer exceeded")
			}
			result, err := reply(message)
			response := map[string]any{"id": message.ID}
			if err != nil {
				response["error"] = map[string]any{"code": -32000, "message": err.Error()}
			} else {
				response["result"] = result
			}
			if ws.WriteJSON(response) != nil {
				return
			}
		}
	}))
	t.Cleanup(server.Close)
	conn, err := dialCDP(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(conn.Close)
	m := New()
	t.Cleanup(m.Close)
	scope, err := newScope([]string{"https://example.test"})
	if err != nil {
		t.Fatal(err)
	}
	s := &session{m: m, cp: &Checkpoint{Version: 1, SessionID: "protocol", Profile: "protocol", State: StateActive, AllowedOrigins: []string{"https://example.test"}}, scope: scope, conn: conn, href: "https://example.test/form", mainFrame: "main", worldCtx: 1, snapshotID: "snapshot", frames: map[string]*frameInfo{}, requests: map[string]time.Time{}, snapFrames: map[string]string{}}
	m.sessions["protocol"] = s
	return s, calls
}

func evaluated(value any) any { return map[string]any{"result": map[string]any{"value": value}} }

func helperOperation(message cdpMessage) string {
	var params struct {
		Expression string `json:"expression"`
	}
	_ = json.Unmarshal(message.Params, &params)
	i := strings.LastIndex(params.Expression, "(\"")
	if i < 0 {
		return ""
	}
	tail := params.Expression[i+1:]
	end := strings.Index(tail, ", ")
	if end < 0 {
		return ""
	}
	var op string
	_ = json.Unmarshal([]byte(tail[:end]), &op)
	return op
}

var protocolFailure = errors.New("synthetic DevTools failure")
