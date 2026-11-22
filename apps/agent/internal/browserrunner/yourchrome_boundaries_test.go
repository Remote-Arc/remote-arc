package browserrunner

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestOwnedChromeTabCloseRequiresObservedDisappearance(t *testing.T) {
	for _, scenario := range []string{"already gone", "refused", "protocol failure", "discovery failure", "never disappears"} {
		t.Run(scenario, func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if message.Method == "Target.closeTarget" {
					switch scenario {
					case "already gone":
						return nil, errors.New("No target with given id")
					case "refused":
						return map[string]any{"success": false}, nil
					case "protocol failure":
						return nil, protocolFailure
					}
					return map[string]any{"success": true}, nil
				}
				if scenario == "discovery failure" {
					return nil, protocolFailure
				}
				return map[string]any{"targetInfo": map[string]any{"targetId": "owned"}}, nil
			})
			err := closeChromeTab(context.Background(), s.conn.(*cdpConn), "owned")
			if scenario == "already gone" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Fatal("unconfirmed tab close claimed success")
			}
		})
	}
}

func TestChromeAttachFailuresCloseOnlyNewlyCreatedTab(t *testing.T) {
	for _, failure := range []string{"Target.createTarget", "Target.attachToTarget"} {
		t.Run(failure, func(t *testing.T) {
			closed := make(chan string, 1)
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if message.Method == failure {
					return nil, protocolFailure
				}
				if message.Method == "Target.closeTarget" {
					closed <- string(message.Params)
				}
				return map[string]any{"targetId": "new-owned-tab"}, nil
			})
			u := s.m.yourChrome()
			u.conn = s.conn.(*cdpConn)
			if _, err := u.openTab(context.Background(), s, ""); err == nil {
				t.Fatal("failed tab attachment accepted")
			}
			if failure == "Target.attachToTarget" {
				select {
				case target := <-closed:
					if !strings.Contains(target, "new-owned-tab") {
						t.Fatal("closed unrelated tab", target)
					}
				case <-time.After(time.Second):
					t.Fatal("failed attach leaked newly created tab")
				}
			}
			if len(u.pages) != 0 {
				t.Fatal("failed attachment retained publication route")
			}
		})
	}
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) { return map[string]any{}, nil })
	u := s.m.yourChrome()
	if closed, err := u.closeTabIfConnected(context.Background(), "owned"); err != nil || closed {
		t.Fatal("disconnected close invented success", closed, err)
	}
	u.conn = s.conn.(*cdpConn)
	page := &yourPage{u: u, base: u.conn, root: "page-session", target: "owned", closed: make(chan struct{})}
	page.gone()
	if err := page.Call(context.Background(), "Page.enable", nil, nil); err != errBrowserGone {
		t.Fatal(err)
	}
	page.Fire("Page.navigate", map[string]any{"url": "https://example.test"})
	if len(calls) != 0 {
		t.Fatal("detached page still drives browser")
	}
	u.closeNow()
	if _, err := u.connect(context.Background()); err != errBrowserGone {
		t.Fatal("stopped Chrome connection reopened", err)
	}
}
