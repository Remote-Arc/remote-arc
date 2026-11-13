package execution

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/secrets"
)

// deliver plays the user's browser: it encrypts value to the device key
// made for handle, then hands the ciphertext to the device.
func deliver(t *testing.T, c *Core, handle, value string) {
	t.Helper()
	pubText, err := c.Secrets.Prepare(handle)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(pubText)
	pub, _ := ecdh.P256().NewPublicKey(raw)
	eph, _ := ecdh.P256().GenerateKey(rand.Reader)
	shared, _ := eph.ECDH(pub)
	key, _ := hkdf.Key(sha256.New, shared, nil, secrets.Info(handle), 32)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	rand.Read(iv)
	enc := base64.RawURLEncoding.EncodeToString
	if err := c.Secrets.Deliver(handle, enc(eph.PublicKey().Bytes()), enc(iv), enc(gcm.Seal(nil, iv, []byte(value), []byte(handle)))); err != nil {
		t.Fatal(err)
	}
}

func decode(t *testing.T, r protocol.Result) map[string]any {
	t.Helper()
	out := map[string]any{}
	if err := json.Unmarshal([]byte(r.Content[0].Text), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestStartProcessGivesSecretOnStdinAndHidesIt(t *testing.T) {
	c := New("terminal")
	defer c.Close()
	const handle, value = "sec_aaaaaaaaaaaaaaaaaaaaaaaa", "sk-test-9f8e7d6c5b4a"
	deliver(t, c, handle, value)
	r, err := c.Call(context.Background(), "start_process", map[string]any{"command": helper(t, "stdin"), "stdin_secret": handle, "timeout_ms": 20000}, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	out := decode(t, r)
	if out["stdout"] != "got [secret] ok" {
		t.Fatalf("the command received the value and the output hides it, got %q", out["stdout"])
	}
	if out["stderr"] != "length 20 [secret]" {
		t.Fatalf("stderr hides it too, got %q", out["stderr"])
	}
	if strings.Contains(r.Content[0].Text, value) {
		t.Fatal("the value must not appear anywhere in the result")
	}
	if _, err := c.Call(context.Background(), "start_process", map[string]any{"command": helper(t, "stdin"), "stdin_secret": handle}, protocol.Policy{}); err == nil || !strings.HasPrefix(err.Error(), "SECRET_NOT_FOUND") {
		t.Fatalf("a secret is used once, got %v", err)
	}
	r, err = c.Call(context.Background(), "start_process", map[string]any{"command": helper(t, "stdin"), "timeout_ms": 20000}, protocol.Policy{})
	if err != nil || decode(t, r)["stdout"] != "got  ok" {
		t.Fatalf("without stdin_secret the command reads nothing, got %v %v", r, err)
	}
	if _, err := c.Call(context.Background(), "start_process", map[string]any{"command": helper(t, "stdin"), "stdin_secret": "sk-raw-value"}, protocol.Policy{}); err == nil || !strings.Contains(err.Error(), "handle from request_secret") {
		t.Fatalf("only handles are accepted, got %v", err)
	}
}

func TestBackgroundProcessHidesSecretInOutputAndWaits(t *testing.T) {
	c := New("terminal")
	defer c.Close()
	const handle, value = "sec_cccccccccccccccccccccccc", "token-5566778899"
	deliver(t, c, handle, value)
	t.Setenv("REMOTEARC_TEST_STAY", "1")
	r, err := c.Call(context.Background(), "start_process", map[string]any{"command": helper(t, "stdin"), "stdin_secret": handle, "background": true, "max_duration_seconds": 30}, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	id := decode(t, r)["process_id"].(string)
	defer c.Processes.Stop(id)
	// until_text sees only what the caller may see, so it cannot test guesses
	// against the secret.
	status, err := c.Processes.WaitStatus(context.Background(), id, 10000, "got [secret] ok")
	if err != nil || status["wait_reason"] != "text" {
		t.Fatalf("waits on the hidden output, got %v %v", status, err)
	}
	status, _ = c.Processes.WaitStatus(context.Background(), id, 0, "token-55")
	if status["wait_reason"] == "text" {
		t.Fatal("until_text must not match the secret")
	}
	out, _ := c.Processes.Output(id)
	if out["stdout"] != "got [secret] ok" || strings.Contains(out["stderr"].(string), value) {
		t.Fatalf("process_output hides it, got %v", out)
	}
}

func TestRefusedCommandKeepsSecretForRetry(t *testing.T) {
	c := New("terminal")
	defer c.Close()
	const handle = "sec_dddddddddddddddddddddddd"
	deliver(t, c, handle, "value-1234")
	if _, err := c.Call(context.Background(), "start_process", map[string]any{"command": "echo hi", "stdin_secret": handle}, protocol.Policy{WorkspaceRoots: []string{t.TempDir()}}); err == nil {
		t.Fatal("start_process without cwd under Trusted Write Locations is refused")
	}
	if _, err := c.Secrets.Take(handle); err != nil {
		t.Fatalf("a refused command does not use up the secret, got %v", err)
	}
}
