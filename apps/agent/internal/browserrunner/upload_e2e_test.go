package browserrunner

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
)

// Own synthetic MP4: 64x64 solid Canvas-like frame, 5fps, 0.4s, generated
// with FFmpeg/libx264. No external footage and no FFmpeg dependency at test time.
func TestE2EMP4UploadReachesServerOnce(t *testing.T) {
	h, _, _, _ := newHarness(t)
	clip, err := os.ReadFile(filepath.Join("testdata", "upload-sample.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	if len(clip) < 16 || !bytes.Equal(clip[4:8], []byte("ftyp")) {
		t.Fatal("fixture must be a real MP4")
	}
	path := filepath.Join(h.policy.WorkspaceRoots[0], "synthetic-clip.mp4")
	if err := os.WriteFile(path, clip, 0600); err != nil {
		t.Fatal(err)
	}
	var uploads atomic.Int32
	received := make(chan []byte, 2)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.URL.Path == "/upload" {
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			file, header, err := r.FormFile("video")
			if err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			defer file.Close()
			data, err := io.ReadAll(io.LimitReader(file, 1<<20))
			if err != nil || header.Filename != "synthetic-clip.mp4" {
				http.Error(w, "bad fixture upload", 400)
				return
			}
			uploads.Add(1)
			select {
			case received <- data:
			default:
			}
			fmt.Fprint(w, "<h1>Video received</h1><p>Reference VIDEO-0001</p>")
			return
		}
		fmt.Fprint(w, `<form action="/upload" method="post" enctype="multipart/form-data"><label>Video sample <input type="file" name="video" accept="video/mp4"></label><button type="submit">Upload video</button></form>`)
	}))
	defer site.Close()
	h.call("browser_runner_start", map[string]any{"task_id": "video-upload", "allowed_origins": []any{site.URL}, "start_url": site.URL})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "video-upload"})
	h.call("browser_runner_act", map[string]any{"session_id": "video-upload", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "file", "video sample"), "action": "upload", "path": path})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "video-upload"})
	args := map[string]any{"session_id": "video-upload", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "upload video"), "action": "click", "effect": "submit", "idempotency_key": "video-once"}
	h.call("browser_runner_act", args)
	if uploads.Load() != 1 {
		t.Fatalf("actual multipart upload count = %d", uploads.Load())
	}
	select {
	case data := <-received:
		if !bytes.Equal(clip, data) {
			t.Fatal("uploaded bytes changed")
		}
	default:
		t.Fatal("server did not receive MP4 bytes")
	}
	h.call("browser_runner_confirm", map[string]any{"session_id": "video-upload", "idempotency_key": "video-once", "outcome": "confirmed", "evidence": "Reference VIDEO-0001"})
	replay := h.call("browser_runner_act", args)
	if replay["replayed"] != true || uploads.Load() != 1 {
		t.Fatal("upload replay dispatched twice", replay, uploads.Load())
	}
	t.Logf("real MP4 received once: bytes=%d sha256=%x", len(clip), sha256.Sum256(clip))
}
