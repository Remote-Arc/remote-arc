package browserrunner

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBrowserSetupAndNavigationFailuresNeverClaimSuccess(t *testing.T) {
	for _, method := range []string{"Page.enable", "Runtime.enable", "Fetch.enable", "DOM.enable", "Network.enable", "Target.setAutoAttach", "Page.getFrameTree"} {
		t.Run(method, func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if message.Method == method {
					return nil, protocolFailure
				}
				return map[string]any{}, nil
			})
			if err := s.setup(context.Background()); err == nil || !strings.Contains(err.Error(), "synthetic DevTools failure") {
				t.Fatal("setup error suppressed", err)
			}
		})
	}
	for _, failure := range []string{"protocol", "net::ERR_BLOCKED_BY_CLIENT", "net::ERR_NAME_NOT_RESOLVED"} {
		t.Run(failure, func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if failure == "protocol" {
					return nil, protocolFailure
				}
				return map[string]any{"errorText": failure}, nil
			})
			if _, err := s.navigate(context.Background(), "https://example.test/next"); err == nil {
				t.Fatal("failed navigation accepted")
			}
		})
	}
}

func TestMalformedPageRepliesAndMissingWorldFailClosed(t *testing.T) {
	for _, reply := range []any{evaluated("not an object"), map[string]any{"exceptionDetails": map[string]any{"text": "synthetic exception"}}} {
		t.Run("malformed", func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return reply, nil })
			if _, err := s.snapshot(context.Background(), 20, 500); err == nil {
				t.Fatal("invalid snapshot accepted")
			}
			if _, _, ok := s.domState(context.Background(), ""); ok {
				t.Fatal("invalid DOM reply considered stable")
			}
		})
	}
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	if _, err := s.evaluateMain(context.Background(), "1"); err == nil {
		t.Fatal("failed evaluation accepted")
	}
	s.worldCtx = 0
	if _, err := s.helper(context.Background(), "probe", nil, true); err == nil {
		t.Fatal("helper ran without world")
	}
	s.onEvent("", "Network.webSocketFrameSent", nil)
	if s.lastRequest.IsZero() {
		t.Fatal("WebSocket send not counted as possible external effect")
	}
	s.requests = map[string]time.Time{"stale": time.Now().Add(-time.Minute), "active": time.Now()}
	if open, sent := s.pending(time.Now().Add(-time.Second)); open != 1 || !sent {
		t.Fatalf("in-flight request accounting: %d %v", open, sent)
	}
	if _, ok := s.requests["stale"]; ok {
		t.Fatal("expired request blocks settling forever")
	}
	for _, method := range []string{"Page.frameNavigated", "Page.navigatedWithinDocument"} {
		s.onEvent("", method, json.RawMessage("{"))
	}
	if got := clip(strings.Repeat("界", 10), 4); got != "界界界…" {
		t.Fatalf("unicode diagnostic clipping: %q", got)
	}
}

func TestUploadFailuresDoNotRecordAttachedAndKeepOnlyFileMetadata(t *testing.T) {
	for _, stage := range []string{"resolve", "missing object", "attach", "state", "not retained"} {
		t.Run(stage, func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				op := helperOperation(message)
				if stage == "resolve" && op == "file_input" || stage == "attach" && message.Method == "DOM.setFileInputFiles" || stage == "state" && op == "file_state" {
					return nil, protocolFailure
				}
				if op == "file_input" && stage != "missing object" {
					return map[string]any{"result": map[string]any{"objectId": "fixture-input"}}, nil
				}
				return evaluated(map[string]any{"label": "CV", "files": []any{}}), nil
			})
			file := filepath.Join(t.TempDir(), "private.txt")
			if err := os.WriteFile(file, []byte("private document contents"), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := s.upload(context.Background(), "snapshot", "e1", file); err == nil {
				t.Fatal("failed upload reported success")
			}
			for _, entry := range s.cp.Uploads {
				if entry.Status == "attached" || entry.File != "private.txt" || entry.SHA256 == "" {
					t.Fatalf("unsafe upload receipt: %+v", entry)
				}
			}
			data, err := json.Marshal(s.cp)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(data), file) || strings.Contains(string(data), "private document contents") {
				t.Fatal("upload checkpoint leaked path/content")
			}
			if _, _, err := fileDigest(filepath.Dir(file)); err == nil {
				t.Fatal("directory accepted as upload")
			}
		})
	}
}

func TestKeyboardAndCoveredClicksNeverDuplicateSubmit(t *testing.T) {
	for _, effect := range []string{"none", "submit", "covered", "minimized"} {
		t.Run(effect, func(t *testing.T) {
			var clicks atomic.Int32
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if message.Method == "Browser.getWindowForTarget" {
					return map[string]any{"windowId": 1, "bounds": windowBounds{WindowState: "minimized"}}, nil
				}
				switch helperOperation(message) {
				case "locate":
					return evaluated(map[string]any{"reachable": effect != "covered", "label": "fixture"}), nil
				case "click_seen":
					return evaluated(false), nil
				case "jsclick":
					clicks.Add(1)
				}
				return evaluated(true), nil
			})
			if effect == "minimized" {
				s.proc = &browserProcess{profileDir: t.TempDir()}
			}
			out, sent, err := s.act(context.Background(), actRequest{Action: "click", Ref: "e1", SnapshotID: "snapshot", Effect: effect})
			if err != nil || !sent {
				t.Fatal(out, sent, err)
			}
			if effect == "submit" {
				if clicks.Load() != 0 || !strings.Contains(out["note"].(string), "may not have reached") {
					t.Fatal("uncertain submit retried", out)
				}
			} else if clicks.Load() != 1 {
				t.Fatalf("direct click count %d", clicks.Load())
			}
		})
	}
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return evaluated(true), nil })
	for _, key := range []string{"Tab", "Space", "Enter"} {
		out, sent, err := s.act(context.Background(), actRequest{Action: "press", Key: key})
		if err != nil || !sent || out["key"] != key {
			t.Fatal("valid keyboard event failed", out, err)
		}
	}
}
