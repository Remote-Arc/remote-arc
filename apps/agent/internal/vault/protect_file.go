package vault

import (
	"encoding/base64"
	"errors"
	"os"
	"strings"
)

// fileStore keeps passwords in vault.json (readable only by this user), the
// default where the system offers no store, and chosen anywhere with
// REMOTEARC_VAULT_STORE=file (for example a Mac without a login session).
func fileStore() bool { return os.Getenv("REMOTEARC_VAULT_STORE") == "file" }

func fileSeal(secret []byte) string { return "file:" + base64.StdEncoding.EncodeToString(secret) }

func fileOpen(sealed string) ([]byte, error) {
	raw, ok := strings.CutPrefix(sealed, "file:")
	if !ok {
		return nil, errors.New("not readable on this computer")
	}
	return base64.StdEncoding.DecodeString(raw)
}
