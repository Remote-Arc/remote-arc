package browserrunner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Explicit opt-in: exercises the real hidden task browser, FFmpeg H.264,
// Pion transport and a second headless browser's video decoder. The SFU API
// boundary is tested separately; this test requires no cloud credentials.
func TestE2EVideoBrowserDecode(t *testing.T) {
	if os.Getenv("REMOTEARC_VIDEO_E2E") != "1" {
		t.Skip("set REMOTEARC_VIDEO_E2E=1 for the real video benchmark")
	}
	if _, err := videoExecutable(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTEARC_RUNNER_VIDEO", "1")
	h, _, _, _ := newHarness(t)
	exe, _ := FindBrowser()
	mux := http.NewServeMux()
	mux.HandleFunc("/motion", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html")
		fmt.Fprint(w, `<!doctype html><title>Runner video benchmark</title><style>body{margin:0;background:#112038;color:#fff;font:32px sans-serif}canvas{position:fixed;inset:0}</style><canvas></canvas><script>const c=document.querySelector('canvas'),g=c.getContext('2d');function tick(t){c.width=innerWidth;c.height=innerHeight;g.fillStyle='#112038';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='32px sans-serif';g.fillText('Remote Arc video benchmark',40,80);g.font='20px sans-serif';g.fillText('Hidden task browser · synthetic page only',40,120);g.fillStyle='#38d5ac';g.fillRect(t/4%1000,180,120,120);const stamp=Date.now()&65535;for(let i=0;i<16;i++){g.fillStyle=stamp&(1<<i)?'white':'black';g.fillRect(32+i*32,c.height-64,24,24)}requestAnimationFrame(tick)}requestAnimationFrame(tick)</script>`)
	})
	mux.HandleFunc("/offer", func(w http.ResponseWriter, r *http.Request) {
		select {
		case signal := <-h.m.VideoSignals():
			if signal.Action != "offer" {
				http.Error(w, "publisher stopped before offer", 500)
				return
			}
			_ = json.NewEncoder(w).Encode(signal)
		case <-r.Context().Done():
		}
	})
	mux.HandleFunc("/answer", func(w http.ResponseWriter, r *http.Request) {
		var value VideoSignal
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 70000)).Decode(&value) != nil {
			http.Error(w, "invalid", 400)
			return
		}
		value.Action, value.SessionID, value.StreamID = "answer", "video-benchmark", "local-benchmark"
		h.m.VideoControl(value)
	})
	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) { h.m.ViewHeartbeatMode("video-benchmark", true, false) })
	mux.HandleFunc("/control", func(w http.ResponseWriter, r *http.Request) {
		var value VideoSignal
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 70000)).Decode(&value) != nil {
			http.Error(w, "invalid", 400)
			return
		}
		value.SessionID = "video-benchmark"
		h.m.VideoControl(value)
	})
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		select {
		case signal := <-h.m.VideoSignals():
			_ = json.NewEncoder(w).Encode(signal)
		case <-r.Context().Done():
		}
	})
	mux.HandleFunc("/viewport", func(w http.ResponseWriter, r *http.Request) {
		var value struct {
			Result struct {
				Value any `json:"value"`
			} `json:"result"`
		}
		_ = h.m.sessions["video-benchmark"].conn.Call(r.Context(), "Runtime.evaluate", map[string]any{"expression": "({width:innerWidth,height:innerHeight})", "returnByValue": true}, &value)
		_ = json.NewEncoder(w).Encode(value.Result.Value)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	h.call("browser_runner_start", map[string]any{"task_id": "video-benchmark", "allowed_origins": []any{srv.URL}, "start_url": srv.URL + "/motion"})
	h.m.ViewHeartbeatMode("video-benchmark", true, false)
	if os.Getenv("REMOTEARC_VIDEO_SFU") != "1" {
		h.m.VideoControl(VideoSignal{Action: "start", SessionID: "video-benchmark", StreamID: "local-benchmark"})
	}
	s := h.m.sessions["video-benchmark"]
	_, window, _ := s.window(h.ctx)
	node := os.Getenv("REMOTEARC_VIDEO_NODE")
	if node == "" {
		node = "node"
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "scripts", "runner-video-browser.mjs"))
	cmd := exec.CommandContext(h.ctx, node, script, srv.URL, exe, os.Getenv("REMOTEARC_VIDEO_REPORT"))
	cmd.Env = append(os.Environ(), "REMOTEARC_VIDEO_WINDOW_STATE="+window.WindowState)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("real video decode failed: %v\n%s", err, out)
	}
	t.Log(strings.TrimSpace(string(out)))
	h.m.StopViews()
	s.ev.Lock()
	stopped := s.video == nil
	s.ev.Unlock()
	if !stopped {
		t.Fatal("video survived viewer disconnect")
	}
	// Native encoder termination is asynchronous but bounded by CommandContext.
	time.Sleep(200 * time.Millisecond)
}
