package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigFailClosedOnUnwritablePathAndMalformedData(t *testing.T) {
	dir := t.TempDir()
	parentFile := filepath.Join(dir, "parent-file")
	if err := os.WriteFile(parentFile, []byte("not a directory"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg := Config{DeviceID: "device", DeviceToken: "token", Origin: "https://mcp.remotearc.app"}
	if err := SaveAt(filepath.Join(parentFile, "invalid"), cfg); err == nil {
		t.Fatal("save succeeded beneath regular file")
	}
	malformedDir := filepath.Join(dir, "corrupt")
	if err := os.Mkdir(malformedDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(malformedDir, "config.json"), []byte("{not-valid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadAt(malformedDir); err == nil {
		t.Fatal("malformed configuration was silently accepted")
	}
	if err := SyncDirectory(malformedDir); err != nil {
		t.Fatal("sync of existing directory failed:", err)
	}
}

func TestResetRejectsDirectoryInPlaceOfConfigWithoutDeletingContents(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	path := filepath.Join(Dir(), "config.json")
	if err := os.MkdirAll(filepath.Join(path, "keep"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := Reset(); err == nil {
		t.Fatal("reset silently ignored invalid configuration path")
	}
	if _, err := os.Stat(filepath.Join(path, "keep")); err != nil {
		t.Fatal("reset deleted unrelated nested path:", err)
	}
}
