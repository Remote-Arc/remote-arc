package codexsetup

import (
	"encoding/json"
	"errors"
	"io"
	"os"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

const recordContract = "remotearc.codex-local-integration/v1"

type record struct {
	Contract     string          `json:"contract"`
	Profile      string          `json:"profile"`
	Workspace    string          `json:"workspace"`
	Identity     string          `json:"workspace_identity"`
	Name         string          `json:"registration"`
	Stage        string          `json:"stage"`
	Original     json.RawMessage `json:"original_entry"`
	Desired      json.RawMessage `json:"desired_entry"`
	PendingFrom  json.RawMessage `json:"pending_from"`
	BinarySHA256 string          `json:"binary_sha256"`
}

type store interface {
	load() (*record, error)
	save(*record) error
	remove() error
}
type fileStore struct{ path string }

func (s fileStore) load() (*record, error) {
	info, err := os.Lstat(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil || !info.Mode().IsRegular() {
		return nil, fail("state_unavailable", "Could not read the local integration ownership record.")
	}
	f, err := os.Open(s.path)
	if err != nil {
		return nil, fail("state_unavailable", "Could not read the local integration ownership record.")
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 64<<10))
	if err != nil || len(b) >= 64<<10 {
		return nil, fail("state_invalid", "The integration ownership record exceeds its size limit.")
	}
	var r record
	if json.Unmarshal(b, &r) != nil {
		return nil, fail("state_invalid", "The integration ownership record is invalid; retain it for diagnosis.")
	}
	return &r, nil
}
func (s fileStore) save(r *record) error {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return fail("state_save_failed", "Could not prepare the local integration record.")
	}
	if config.DurableWrite(s.path, append(b, '\n'), 0600) != nil {
		return fail("state_save_failed", "Could not durably save the integration recovery record; registration was not confirmed.")
	}
	return nil
}
func (s fileStore) remove() error {
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fail("state_cleanup_failed", "The owned registration is removed but its recovery record could not be deleted; rerun uninstall.")
	}
	return nil
}
