package codexsetup

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
)

func nativeFixture(t *testing.T) (Request, string, string) {
	t.Helper()
	base := t.TempDir()
	project, profile, state := filepath.Join(base, "project"), filepath.Join(base, "profile"), filepath.Join(base, "arc")
	for _, dir := range []string{project, profile, state} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("CODEX_HOME", profile)
	t.Setenv("REMOTEARC_HOME", state)
	t.Setenv("REMOTEARC_CODEX_TEST_HELPER", "1")
	t.Setenv("REMOTEARC_CODEX_TEST_MODE", "integration")
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return Request{Action: "install", Workspace: project, CodexBinary: binary, Version: "test"}, profile, state
}

func TestNativeRunUsesProfileJournalAndClientVerification(t *testing.T) {
	request, profile, state := nativeFixture(t)
	for _, verb := range []string{"status", "install", "install", "status", "doctor", "repair", "uninstall", "uninstall"} {
		request.Action = verb
		result, err := Run(context.Background(), request)
		if err != nil {
			t.Fatal(verb, err)
		}
		if result.Contract != recordContract || result.Agent != "codex" || result.Changed == nil {
			t.Fatal("missing receipt fields")
		}
		if (verb == "install" || verb == "repair" || verb == "doctor") && !result.ToolsVerified {
			t.Fatal("native path skipped client verification")
		}
	}
	files, err := filepath.Glob(filepath.Join(state, ".remotearc", "integrations", "codex", "*.json"))
	if err != nil || len(files) != 0 {
		t.Fatal("ownership journal retained after uninstall", err)
	}
	if _, err = os.Stat(filepath.Join(state, ".remotearc", "config.json")); !os.IsNotExist(err) {
		t.Fatal("local setup paired a device", err)
	}
	if _, err = os.Stat(filepath.Join(profile, "synthetic-state.json")); err != nil {
		t.Fatal("native provider was not exercised", err)
	}
}

func TestNativeRunManagedMissingClientInvalidWorkspaceAndCancellation(t *testing.T) {
	request, profile, _ := nativeFixture(t)
	if err := os.WriteFile(filepath.Join(profile, "synthetic-state.json"), []byte(`{"managed":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := Run(context.Background(), request)
	expectCode(t, err, "managed_config")
	if err = os.Remove(filepath.Join(profile, "synthetic-state.json")); err != nil {
		t.Fatal(err)
	}
	request.CodexBinary = filepath.Join(profile, "missing-client")
	result, err := Run(context.Background(), request)
	expectCode(t, err, "codex_not_found")
	if result.ErrorCode != "codex_not_found" || result.Status != "action_required" || result.Changed == nil || *result.Changed {
		t.Fatal("missing-client receipt wrong")
	}
	request, _, _ = nativeFixture(t)
	request.Workspace = filepath.Join(request.Workspace, "missing")
	_, err = Run(context.Background(), request)
	expectCode(t, err, "workspace_unavailable")
	request, _, _ = nativeFixture(t)
	request.RemoteArcBinary = "relative"
	_, err = Run(context.Background(), request)
	expectCode(t, err, "binary_unavailable")
	request.RemoteArcBinary = filepath.Join(profile, "missing-go-binary")
	_, err = Run(context.Background(), request)
	expectCode(t, err, "binary_unavailable")
	request, _, _ = nativeFixture(t)
	request.Action = "unknown"
	_, err = Run(context.Background(), request)
	expectCode(t, err, "action_invalid")
	request.Action = "install"
	request.Workspace = "relative"
	_, err = Run(context.Background(), request)
	expectCode(t, err, "workspace_invalid")
	request, _, _ = nativeFixture(t)
	t.Setenv("CODEX_HOME", "relative")
	_, err = Run(context.Background(), request)
	expectCode(t, err, "profile_invalid")
	request, _, _ = nativeFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = Run(ctx, request)
	expectCode(t, err, "codex_version_unavailable")
}

func TestNativeRunCompetingSetupAndBinaryChange(t *testing.T) {
	request, _, state := nativeFixture(t)
	if _, err := Run(context.Background(), request); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(filepath.Join(state, ".remotearc", "integrations", "codex", "*.json"))
	if err != nil || len(files) != 1 {
		t.Fatal(files, err)
	}
	key := strings.TrimSuffix(filepath.Base(files[0]), ".json")
	lock, err := lease.Acquire(filepath.Dir(files[0]), key)
	if err != nil || lock == nil {
		t.Fatal(err)
	}
	request.Action = "repair"
	_, err = Run(context.Background(), request)
	expectCode(t, err, "setup_busy")
	lock.Release()
	s := fileStore{files[0]}
	r, err := s.load()
	if err != nil {
		t.Fatal(err)
	}
	r.BinarySHA256 = "changed"
	if err = s.save(r); err != nil {
		t.Fatal(err)
	}
	request.Action = "doctor"
	_, err = Run(context.Background(), request)
	expectCode(t, err, "binary_changed")
	request.Action = "repair"
	if result, err := Run(context.Background(), request); err != nil || !result.ToolsVerified {
		t.Fatal("repair did not refresh native binary fingerprint", err)
	}
}

func TestFileStoreRejectsInvalidOversizedLinkedRecords(t *testing.T) {
	dir := t.TempDir()
	s := fileStore{filepath.Join(dir, "records", "entry.json")}
	if r, err := s.load(); err != nil || r != nil {
		t.Fatal("missing record", err)
	}
	r := &record{Contract: recordContract, Stage: "prepared", Desired: json.RawMessage(`{"command":"native"}`)}
	if err := s.save(r); err != nil {
		t.Fatal(err)
	}
	loaded, err := s.load()
	if err != nil || loaded.Stage != "prepared" {
		t.Fatal(err)
	}
	if err = os.WriteFile(s.path, []byte("PRIVATE_CANARY_INVALID"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err = s.load()
	expectCode(t, err, "state_invalid")
	if strings.Contains(err.Error(), "PRIVATE_CANARY") {
		t.Fatal("invalid state leaked")
	}
	if err = os.WriteFile(s.path, make([]byte, 64<<10), 0600); err != nil {
		t.Fatal(err)
	}
	_, err = s.load()
	expectCode(t, err, "state_invalid")
	if err = s.remove(); err != nil {
		t.Fatal(err)
	}
	if err = s.remove(); err != nil {
		t.Fatal("repeated cleanup", err)
	}
	if err = os.Mkdir(s.path, 0700); err != nil {
		t.Fatal(err)
	}
	_, err = s.load()
	expectCode(t, err, "state_unavailable")
	if err = os.WriteFile(filepath.Join(s.path, "retained"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	expectCode(t, s.remove(), "state_cleanup_failed")
	blocked := fileStore{filepath.Join(dir, "not-a-directory", "entry.json")}
	if err = os.WriteFile(filepath.Dir(blocked.path), nil, 0600); err != nil {
		t.Fatal(err)
	}
	expectCode(t, blocked.save(r), "state_save_failed")
	r.Desired = json.RawMessage("invalid-json")
	expectCode(t, (fileStore{filepath.Join(dir, "invalid.json")}).save(r), "state_save_failed")
	if _, err = hashFile(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("missing binary fingerprint succeeded")
	}
}
