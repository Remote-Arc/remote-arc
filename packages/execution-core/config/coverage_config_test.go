package config

import (
	"encoding/json"
	"os"
	"path/filepath"
 "runtime"
	"strings"
	"testing"
)

func TestConfigMigrationCorruptAndMissingFields(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	dir := Dir()
	if Home() != home || dir != filepath.Join(home, ".remotearc") {
		t.Fatal("home override ignored")
	}
	if _, err := Load(); !os.IsNotExist(err) {
		t.Fatalf("missing config should return not-exist: %v", err)
	}
	legacy := filepath.Join(home, ".remote-link")
	if err := os.MkdirAll(legacy, 0700); err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(legacy, "config.json")
	for _, tt := range []struct {
		text string
		fail bool
	}{
		{"{invalid", true},
		{"{}", true},
		{"{\"deviceId\":\"id\",\"deviceToken\":\"token\"}", true},
		{"{\"deviceId\":\"id\",\"deviceToken\":\"token\",\"origin\":\"https://relay.example\",\"futureFlag\":42}", false},
	} {
		if err := os.WriteFile(legacyPath, []byte(tt.text), 0600); err != nil {
			t.Fatal(err)
		}
		saved, err := Load()
		if (err != nil) != tt.fail {
			t.Fatalf("Load() for %s returned %v", tt.text, err)
		}
		if err == nil {
			if saved.Mode != "managed" || string(saved.Extra["futureFlag"]) != "42" {
				t.Fatalf("legacy config lost unknown values: %#v", saved)
			}
		}
	}
}
func TestConfigPreservesUnknownKeysWithoutResurrectingSensitiveStates(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "cfg")
	on := true
	c := Config{DeviceID: "d", DeviceToken: "secret", Origin: "https://relay.example", Mode: "managed", BackgroundEnabled: &on, ExecutionPaused: true,
		Extra: map[string]json.RawMessage{"newFeature": json.RawMessage("\"value\""), "executionPaused": json.RawMessage("true"), "backgroundEnabled": json.RawMessage("true")}}
	if err := SaveAt(dir, c); err != nil {
		t.Fatal(err)
	}
	restored, err := LoadAt(dir)
	if err != nil || !restored.ExecutionPaused || restored.BackgroundEnabled == nil || !*restored.BackgroundEnabled {
		t.Fatalf("status not persisted: %#v %v", restored, err)
	}
	restored.ExecutionPaused = false
	restored.BackgroundEnabled = nil
	if err := SaveAt(dir, restored); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "\"executionPaused\"") || strings.Contains(string(raw), "\"backgroundEnabled\"") {
		t.Fatalf("stale enabled states restored: %s", raw)
	}
	again, err := LoadAt(dir)
	if err != nil || again.ExecutionPaused || again.BackgroundEnabled != nil || string(again.Extra["newFeature"]) != "\"value\"" {
		t.Fatalf("roundtrip corrupted: %#v %v", again, err)
	}
}
func TestResetRemovesBothActiveAndLegacyConfigs(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	current := Dir()
	legacy := filepath.Join(home, ".remote-link")
	for _, dir := range []string{current, legacy} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
		os.WriteFile(filepath.Join(dir, "config.json"), []byte("dummy"), 0600)
	}
	if err := Reset(); err != nil {
		t.Fatal(err)
	}
	if err := Reset(); err != nil {
		t.Fatal("repeated reset should be safe:", err)
	}
	for _, dir := range []string{current, legacy} {
		if _, err := os.Stat(filepath.Join(dir, "config.json")); !os.IsNotExist(err) {
			t.Fatal("reset left config:", dir, err)
		}
	}
}
func TestDurabilityDefaultsAndDirectorySyncFailure(t *testing.T) {
	t.Setenv("REMOTEARC_FILE_DURABILITY", "")
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "")
	if FileDurability() != "durable" || UndoDurability() != "durable" {
		t.Fatal("defaults must be durable")
	}
	t.Setenv("REMOTEARC_FILE_DURABILITY", "atomic")
	if FileDurability() != "atomic" || UndoDurability() != "atomic" {
		t.Fatal("atomic opt-in ignored")
	}
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "unknown")
	if UndoDurability() != "durable" {
		t.Fatal("invalid undo mode weakened durability")
	}
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "atomic")
	if UndoDurability() != "atomic" {
		t.Fatal("explicit undo opt-in ignored")
	}
	if err := SyncDirectoryWithDurability(filepath.Join(t.TempDir(), "absent"), "atomic"); err != nil {
		t.Fatal("atomic mode attempted sync:", err)
	}
	if err := SyncDirectoryWithDurability(filepath.Join(t.TempDir(), "absent"), "durable"); err == nil && runtime.GOOS != "windows" {
		t.Fatal("durable mode ignored missing folder")
	}
}
