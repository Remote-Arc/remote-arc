package agent

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"slices"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/secrets"
)

func secretAgent(t *testing.T, mode string) *Agent {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "token", Origin: "https://example.invalid", Mode: mode}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "test", false, nil)
	t.Cleanup(func() { a.Browser.Close(); a.Core.Close() })
	return a
}

// The Relay prepares a key on the device, the user's browser encrypts to it,
// and the Relay forwards only ciphertext; start_process then takes the value.
func TestSecretPrepareDeliverThroughDispatch(t *testing.T) {
	a := secretAgent(t, "managed")
	hello := a.hello(context.Background())
	if !slices.Contains(hello["tools"].([]string), "secret_deliver") || !slices.Contains(hello["capabilities"].([]string), "one_time_secret_v1") {
		t.Fatal("a terminal-mode Agent advertises one-time secrets")
	}
	const handle = "sec_eeeeeeeeeeeeeeeeeeeeeeee"
	out, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_prepare", Arguments: map[string]any{"handle": handle}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(out.(map[string]any)["public_key"].(string))
	pub, err := ecdh.P256().NewPublicKey(raw)
	if err != nil {
		t.Fatal(err)
	}
	eph, _ := ecdh.P256().GenerateKey(rand.Reader)
	shared, _ := eph.ECDH(pub)
	key, _ := hkdf.Key(sha256.New, shared, nil, secrets.Info(handle), 32)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	rand.Read(iv)
	enc := base64.RawURLEncoding.EncodeToString
	args := map[string]any{"handle": handle, "epk": enc(eph.PublicKey().Bytes()), "iv": enc(iv), "ciphertext": enc(gcm.Seal(nil, iv, []byte("api-key-value"), []byte(handle)))}
	if _, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_deliver", Arguments: args}, nil); err != nil {
		t.Fatal(err)
	}
	if v, err := a.Core.Secrets.Take(handle); err != nil || v != "api-key-value" {
		t.Fatalf("got %q %v", v, err)
	}
	if _, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_prepare", Arguments: map[string]any{}}, nil); err == nil {
		t.Fatal("handle is required")
	}
	if _, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_deliver", Arguments: map[string]any{"handle": handle}}, nil); err == nil {
		t.Fatal("an unknown or used request cannot be delivered")
	}
	if _, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_prepare", Arguments: map[string]any{"handle": "bad"}}, nil); err == nil {
		t.Fatal("handles are checked")
	}
}

func TestSecretsFollowTerminalMode(t *testing.T) {
	a := secretAgent(t, "safe")
	if slices.Contains(a.hello(context.Background())["tools"].([]string), "secret_prepare") {
		t.Fatal("a mode without start_process does not advertise one-time secrets")
	}
	if _, err := a.dispatch(context.Background(), protocol.Call{Tool: "secret_prepare", Arguments: map[string]any{"handle": "sec_ffffffffffffffffffffffff"}}, nil); err == nil || !strings.Contains(err.Error(), "terminal mode") {
		t.Fatalf("got %v", err)
	}
}
