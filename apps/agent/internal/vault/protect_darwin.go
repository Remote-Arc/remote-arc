//go:build darwin

package vault

import (
	"bytes"
	"errors"
	"os/exec"
	"strings"
)

// macOS keeps passwords in the user's login Keychain. Commands go to the
// security tool on standard input, so a password never appears in a process
// list.

const service = "Remote Arc vault"

func quote(s string) string { return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"` }

func seal(name string, secret []byte) (string, error) {
	cmd := exec.Command("/usr/bin/security", "-i")
	cmd.Stdin = strings.NewReader("add-generic-password -U -s " + quote(service) + " -a " + quote(name) + " -w " + quote(string(secret)) + "\n")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if e := cmd.Run(); e != nil || strings.Contains(out.String(), "error") {
		return "", errors.New(strings.TrimSpace("keychain: " + out.String()))
	}
	return "keychain:" + name, nil
}

func open(name string, sealed string) ([]byte, error) {
	if !strings.HasPrefix(sealed, "keychain:") {
		return nil, errors.New("not kept in the Keychain on this computer")
	}
	b, e := exec.Command("/usr/bin/security", "find-generic-password", "-s", service, "-a", name, "-w").Output()
	if e != nil {
		return nil, errors.New("the Keychain did not return the password (is the login keychain unlocked?)")
	}
	return bytes.TrimRight(b, "\n"), nil
}

func forget(name string, _ string) {
	_ = exec.Command("/usr/bin/security", "delete-generic-password", "-s", service, "-a", name).Run()
}

// Protection names how passwords are kept on this computer.
const Protection = "macOS login Keychain"
