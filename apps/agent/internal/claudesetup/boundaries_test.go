package claudesetup

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestProfileAndOwnershipErrorsDoNotInvokeClient(t *testing.T) {
	req, file, log := fixture(t)
	for _, body := range []string{`{"mcpServers":[]}`, `{"projects":[]}`, `{"projects":{` + quotePath(req.CWD) + `:{"mcpServers":[]}}}`} {
		writeFixture(t, file, body)
		if _, err := Run(context.Background(), req); err == nil {
			t.Fatalf("invalid client configuration accepted: %s", body)
		}
		if _, err := os.Stat(log); !os.IsNotExist(err) {
			t.Fatal("malformed config invoked provider", err)
		}
	}
	writeFixture(t, file, `{}`)
	req.Action = "status"
	requireResult(t, req, "not_installed")
	writeFixture(t, file, `{"mcpServers":{"custom":{"url":"https://mcp.remotearc.app/mcp"}}}`)
	requireResult(t, req, "already_registered")
	req.Action = "unknown"
	if _, err := Run(context.Background(), req); err == nil {
		t.Fatal("invalid action accepted")
	}
	req.Action = "install"
	t.Setenv("CLAUDE_CONFIG_DIR", "relative")
	if _, err := Run(context.Background(), req); err == nil {
		t.Fatal("relative profile accepted")
	}
	t.Setenv("CLAUDE_CONFIG_DIR", filepath.Dir(file))
	writeFixture(t, file, `{}`)
	canonical, _ := filepath.Abs(file)
	key := sha256.Sum256([]byte(canonical))
	state := filepath.Join(config.Dir(), "integrations", "claude", hex.EncodeToString(key[:])+".json")
	if err := os.MkdirAll(filepath.Dir(state), 0700); err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`{`, `{"Config":"foreign","Name":"remote_arc","Stage":"installed","Desired":{"command":"remotelink","args":["--mcp"]}}`} {
		writeFixture(t, state, body)
		if _, err := Run(context.Background(), req); err == nil {
			t.Fatal("corrupt ownership adopted")
		}
	}
}

func quotePath(value string) string { data, _ := json.Marshal(value); return string(data) }

func TestBoundedOutputAndConfigurationFileKinds(t *testing.T) {
	var out limitedOutput
	if n, err := out.Write([]byte(strings.Repeat("x", 1<<20))); err != nil || n != 1<<20 {
		t.Fatal(n, err)
	}
	if n, err := out.Write([]byte("overflow")); err != io.ErrShortBuffer || n != 0 || out.Len() != 1<<20 {
		t.Fatal("output budget bypassed", n, err)
	}
	dir := t.TempDir()
	if _, err := readConfig(dir); err == nil {
		t.Fatal("directory accepted as configuration")
	}
	large := filepath.Join(dir, "large.json")
	f, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	err = f.Truncate(4 << 20)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = readConfig(large); err == nil {
		t.Fatal("oversized configuration accepted")
	}
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	if path, err := profileConfig(); err != nil || path != filepath.Join(dir, ".claude.json") {
		t.Fatal(path, err)
	}
}
