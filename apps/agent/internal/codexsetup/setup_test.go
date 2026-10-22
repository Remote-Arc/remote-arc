package codexsetup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspaceidentity"
)

type memoryStore struct {
	record             *record
	saves, removes     int
	failSave           int
	loadErr, removeErr error
}

func copyRecord(r *record) *record {
	if r == nil {
		return nil
	}
	b, _ := json.Marshal(r)
	var copied record
	json.Unmarshal(b, &copied)
	return &copied
}
func (s *memoryStore) load() (*record, error) { return copyRecord(s.record), s.loadErr }
func (s *memoryStore) save(r *record) error {
	s.saves++
	if s.failSave == s.saves {
		return fail("state_save_failed", "synthetic failure")
	}
	s.record = copyRecord(r)
	return nil
}
func (s *memoryStore) remove() error {
	s.removes++
	if s.removeErr != nil {
		return s.removeErr
	}
	s.record = nil
	return nil
}

type fakeProvider struct {
	entry                                               json.RawMessage
	revision, writes, verifies                          int
	conflict, disconnectAfterWrite, verificationFailure bool
	readErr                                             error
	writeName                                           string
}

func (p *fakeProvider) read(name, workspace string) (snapshot, error) {
	return snapshot{File: "synthetic-config", Revision: fmt.Sprint(p.revision), Entry: append(json.RawMessage(nil), p.entry...)}, p.readErr
}
func (p *fakeProvider) write(before snapshot, name string, entry json.RawMessage) error {
	if p.conflict {
		p.revision++
		p.conflict = false
		return fail("codex_request_rejected", "synthetic concurrent revision")
	}
	if before.Revision != fmt.Sprint(p.revision) {
		return fail("revision_conflict", "stale revision")
	}
	p.writes++
	p.writeName = name
	p.revision++
	p.entry = append(json.RawMessage(nil), entry...)
	if p.disconnectAfterWrite {
		p.disconnectAfterWrite = false
		return fail("client_disconnected", "synthetic unknown acknowledgement")
	}
	return nil
}
func (p *fakeProvider) verify(name, workspace string, binding json.RawMessage) error {
	p.verifies++
	if p.verificationFailure {
		return fail("client_verification_failed", "synthetic connection failure")
	}
	if !sameJSON(p.entry, binding) {
		return fail("config_drift", "synthetic drift")
	}
	return nil
}

func fixtureTransaction(t *testing.T) (transaction, *memoryStore, *fakeProvider) {
	t.Helper()
	dir := t.TempDir()
	root := filepath.Join(dir, "project")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "remote-arc-native")
	if err := os.WriteFile(binary, []byte("synthetic native binary"), 0700); err != nil {
		t.Fatal(err)
	}
	identity, err := workspaceidentity.Read(root)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := hashFile(binary)
	if err != nil {
		t.Fatal(err)
	}
	s := &memoryStore{}
	p := &fakeProvider{}
	return transaction{profile: filepath.Join(dir, "profile"), root: root, name: "remote_arc_fixture", binary: binary, identity: identity, binaryHash: hash, store: s, provider: p, held: func() bool { return true }}, s, p
}
func action(t *testing.T, tr transaction, verb string) Result {
	t.Helper()
	result := Result{Changed: change(false)}
	if err := tr.run(verb, &result); err != nil {
		t.Fatal(verb, err)
	}
	return result
}
func expectCode(t *testing.T, err error, code string) {
	t.Helper()
	failure, ok := err.(*Failure)
	if !ok || failure.Code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
}

func TestInstallRepeatDoctorRepairAndUninstall(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	installed := action(t, tr, "install")
	if installed.Status != "installed" || !*installed.Changed || !installed.ToolsVerified || p.writes != 1 || s.record.Stage != "installed" || p.writeName != tr.name {
		t.Fatal("installation was not verified or scoped")
	}
	if !emptyJSON(s.record.Original) || s.record.BinarySHA256 != tr.binaryHash {
		t.Fatal("undo baseline or binary fingerprint lost")
	}
	if repeat := action(t, tr, "install"); *repeat.Changed || p.writes != 1 {
		t.Fatal("repeat changed the registration")
	}
	if status := action(t, tr, "status"); status.Status != "registered" || status.ToolsVerified {
		t.Fatal("status overstated connection verification")
	}
	if doctor := action(t, tr, "doctor"); doctor.Status != "healthy" || !doctor.ToolsVerified {
		t.Fatal("doctor did not verify the client")
	}
	p.entry = nil
	p.revision++
	if status := action(t, tr, "status"); status.Status != "registration_missing" {
		t.Fatal("missing registration hidden")
	}
	var result Result
	expectCode(t, tr.run("doctor", &result), "registration_missing")
	if repaired := action(t, tr, "repair"); !*repaired.Changed || !repaired.ToolsVerified {
		t.Fatal("missing owned entry not repaired")
	}
	if removed := action(t, tr, "uninstall"); removed.Status != "uninstalled" || !*removed.Changed || s.record != nil || !emptyJSON(p.entry) {
		t.Fatal("uninstall left registration or ownership state")
	}
	if repeat := action(t, tr, "uninstall"); repeat.Status != "not_installed" || *repeat.Changed {
		t.Fatal("repeat uninstall not idempotent")
	}
}

func TestInterruptedInstallAndUnknownWriteAcknowledgement(t *testing.T) {
	for _, afterDispatch := range []bool{false, true} {
		t.Run(fmt.Sprint(afterDispatch), func(t *testing.T) {
			tr, s, p := fixtureTransaction(t)
			p.conflict = !afterDispatch
			p.disconnectAfterWrite = afterDispatch
			var result Result
			if err := tr.run("install", &result); err == nil {
				t.Fatal("synthetic interruption did not fail")
			}
			if result.Changed != nil {
				t.Fatal("unacknowledged write reported a known configuration outcome")
			}
			if s.record == nil || s.record.Stage != "prepared" {
				t.Fatal("recovery journal missing before dispatch")
			}
			if status := action(t, tr, "status"); status.Status != "registration_missing" && status.Status != "interrupted_prepared" {
				t.Fatal("interruption hidden")
			}
			if retry := action(t, tr, "install"); retry.Status != "installed" || !retry.ToolsVerified || s.record.Stage != "installed" {
				t.Fatal("retry failed")
			}
			if p.writes != 1 {
				t.Fatal("acknowledgement loss caused duplicate configuration dispatch", p.writes)
			}
		})
	}
}

func TestDurableRecordMustPrecedeWriteAndCanRecoverFinalSave(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	s.failSave = 1
	var result Result
	expectCode(t, tr.run("install", &result), "state_save_failed")
	if p.writes != 0 {
		t.Fatal("write dispatched before durable journal")
	}
	tr, s, p = fixtureTransaction(t)
	s.failSave = 2
	expectCode(t, tr.run("install", &result), "state_save_failed")
	if p.writes != 1 || s.record.Stage != "prepared" {
		t.Fatal("post-write journal failure not recoverable")
	}
	action(t, tr, "install")
	if p.writes != 1 || s.record.Stage != "installed" {
		t.Fatal("post-write retry dispatched twice")
	}
}

func TestVerificationFailureIsNotReportedInstalled(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	p.verificationFailure = true
	var result Result
	expectCode(t, tr.run("install", &result), "client_verification_failed")
	if result.ToolsVerified || s.record.Stage != "prepared" {
		t.Fatal("unverified installation marked complete")
	}
	expectCode(t, tr.run("doctor", &result), "setup_interrupted")
	p.verificationFailure = false
	action(t, tr, "install")
	if p.writes != 1 || s.record.Stage != "installed" {
		t.Fatal("verified retry wrote again")
	}
}

func TestUnrelatedEntryAndConfigDriftAreNotAdoptedOrDeleted(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	p.entry = json.RawMessage(`{"command":"unrelated-user-tool","env":{"token":"PRIVATE_CANARY"}}`)
	var result Result
	err := tr.run("install", &result)
	expectCode(t, err, "config_drift")
	if p.writes != 0 || s.record != nil || strings.Contains(err.Error(), "PRIVATE_CANARY") {
		t.Fatal("unowned entry overwritten, adopted or exposed")
	}
	p.entry = nil
	action(t, tr, "install")
	original := append(json.RawMessage(nil), p.entry...)
	p.entry = json.RawMessage(`{"command":"changed-by-user"}`)
	for _, verb := range []string{"install", "repair", "status", "doctor", "uninstall"} {
		expectCode(t, tr.run(verb, &result), "config_drift")
	}
	if p.writes != 1 || s.record == nil {
		t.Fatal("drift overwritten or journal deleted")
	}
	p.entry = original
	action(t, tr, "uninstall")
}

func TestUpgradeInterruptedBeforeAndAfterWritePreservesOwnership(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	action(t, tr, "install")
	old := append(json.RawMessage(nil), p.entry...)
	tr.binary = filepath.Join(filepath.Dir(tr.binary), "new-native-binary")
	tr.binaryHash = "new-hash"
	p.conflict = true
	var result Result
	expectCode(t, tr.run("install", &result), "codex_request_rejected")
	if !sameJSON(s.record.PendingFrom, old) || s.record.Stage != "prepared" {
		t.Fatal("upgrade baseline lost")
	}
	if retry := action(t, tr, "install"); !*retry.Changed || p.writes != 2 {
		t.Fatal("upgrade not reconciled")
	}
	if s.record.BinarySHA256 != "new-hash" {
		t.Fatal("upgrade fingerprint not saved")
	}
	action(t, tr, "uninstall")
}

func TestInterruptedUninstallAndMissingWorkspace(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	action(t, tr, "install")
	tr.identity = ""
	p.disconnectAfterWrite = true
	var result Result
	expectCode(t, tr.run("uninstall", &result), "client_disconnected")
	if s.record.Stage != "removing" || !emptyJSON(p.entry) {
		t.Fatal("interrupted removal state wrong")
	}
	if removed := action(t, tr, "uninstall"); *removed.Changed || s.record != nil {
		t.Fatal("removed entry retried or journal retained")
	}
	if p.writes != 2 {
		t.Fatal("uninstall repeated external write")
	}
}

func TestMissingOrReplacedWorkspaceRequiresExplicitReinstall(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	action(t, tr, "install")
	tr.identity = "replacement"
	var result Result
	for _, verb := range []string{"install", "repair", "status", "doctor"} {
		expectCode(t, tr.run(verb, &result), "workspace_changed")
	}
	if p.writes != 1 || s.record == nil {
		t.Fatal("replacement workspace silently adopted")
	}
	action(t, tr, "uninstall")
	if s.record != nil {
		t.Fatal("old registration could not be removed")
	}
}

func TestInvalidJournalProviderFailureAndLostLeaseNeverWrite(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	s.record = &record{Contract: "unsupported"}
	var result Result
	expectCode(t, tr.run("install", &result), "state_invalid")
	s.record = nil
	s.loadErr = fail("state_unavailable", "fixture")
	expectCode(t, tr.run("install", &result), "state_unavailable")
	s.loadErr = nil
	p.readErr = fail("managed_config", "fixture")
	expectCode(t, tr.run("install", &result), "managed_config")
	p.readErr = nil
	tr.held = func() bool { return false }
	expectCode(t, tr.run("install", &result), "setup_lock_lost")
	if p.writes != 0 || s.record != nil {
		t.Fatal("invalid or unlocked transaction mutated state")
	}
}

func TestRemoveRecordFailureCanBeRetried(t *testing.T) {
	tr, s, p := fixtureTransaction(t)
	action(t, tr, "install")
	s.removeErr = fail("state_cleanup_failed", "fixture")
	var result Result
	expectCode(t, tr.run("uninstall", &result), "state_cleanup_failed")
	if !emptyJSON(p.entry) {
		t.Fatal("entry still installed")
	}
	s.removeErr = nil
	action(t, tr, "uninstall")
	if s.record != nil {
		t.Fatal("journal cleanup not retried")
	}
}
