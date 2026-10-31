package codexsetup

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestOwnershipStorageFailuresNeverAcknowledgeRegistration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store := fileStore{path: path}
	if err := store.save(&record{Desired: json.RawMessage("{")}); err == nil {
		t.Fatal("malformed ownership serialized")
	}
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := store.load(); err == nil {
		t.Fatal("directory accepted as ownership")
	}
	if err := os.WriteFile(filepath.Join(path, "preserve"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	if err := store.remove(); err == nil {
		t.Fatal("nonempty directory removed as ownership record")
	}
	if err := store.save(&record{Contract: recordContract}); err == nil {
		t.Fatal("failed durable save acknowledged")
	}
	if _, err := hashFile(path); err == nil {
		t.Fatal("directory hashed as native executable")
	}
	tr, s, p := fixtureTransaction(t)
	tr.held = func() bool { return false }
	if err := tr.write(snapshot{}, json.RawMessage(`{}`)); err == nil || p.writes != 0 || s.record != nil {
		t.Fatal("lost lease wrote configuration", err)
	}
	// Invalid profile/workspace paths must fail before starting a client process.
	t.Setenv("CODEX_HOME", t.TempDir())
	for _, request := range []Request{{Action: "install", Workspace: filepath.Join(t.TempDir(), "missing"), CodexBinary: "must-not-start"}, {Action: "install", Workspace: t.TempDir(), RemoteArcBinary: "relative", CodexBinary: "must-not-start"}} {
		result, err := Run(context.Background(), request)
		if err == nil || result.Status != "action_required" || result.ToolsVerified {
			t.Fatal("invalid local setup claimed ready", result, err)
		}
	}
}

func TestDefaultCodexProfileUsesOnlyTheIsolatedUserHome(t *testing.T) {
	request, _, _ := nativeFixture(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", "")
	request.Global = true
	request.Workspace = ""
	result, err := Run(context.Background(), request)
	if err != nil || result.Status != "installed" || !result.ToolsVerified {
		t.Fatal("default-profile registration was not verified", result, err)
	}
	if _, err := os.Stat(filepath.Join(home, ".codex", "synthetic-state.json")); err != nil {
		t.Fatal("registration did not use the user's default profile", err)
	}
	request.Action = "uninstall"
	if result, err := Run(context.Background(), request); err != nil || result.Status != "uninstalled" {
		t.Fatal("default-profile registration could not be removed", result, err)
	}
}
