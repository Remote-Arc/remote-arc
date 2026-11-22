//go:build !windows && !darwin

package vault

// Elsewhere (Linux, WSL) the password is kept in vault.json, which only this
// user can read, the same way the device credentials are kept.

func seal(_ string, secret []byte) (string, error) { return fileSeal(secret), nil }

func open(_ string, sealed string) ([]byte, error) { return fileOpen(sealed) }

func forget(string, string) {}

// Protection names how passwords are kept on this computer.
const Protection = "a file only this user can read (~/.remotearc/vault.json)"
