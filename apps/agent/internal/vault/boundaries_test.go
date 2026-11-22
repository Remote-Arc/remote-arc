package vault

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestVaultInvalidInputsNeverPersistOrEchoPassword(t *testing.T) {
	useTestStore(t)
	for _, args := range [][]string{{"add"}, {"add", "--bad"}, {"add", "name", "--unknown", "value"}, {"add", "name", "--site", "file:///private"}, {"remove"}, {"unknown"}} {
		var out bytes.Buffer
		if err := Command(args, os.Stdin, &out); err == nil {
			t.Fatalf("invalid input accepted: %v", args)
		}
	}
	for _, args := range [][]string{nil, {"help"}, {"-h"}, {"list"}} {
		var out bytes.Buffer
		if err := Command(args, os.Stdin, &out); err != nil || out.Len() == 0 {
			t.Fatalf("read-only command %v: %v %q", args, err, out.String())
		}
	}
	for _, input := range []string{"", "\n", "\r\n"} {
		r, w, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		_, err = io.WriteString(w, input)
		w.Close()
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		err = Command([]string{"add", "name", "--site=https://example.test"}, r, &out)
		r.Close()
		if err == nil || !strings.Contains(err.Error(), "no password") {
			t.Fatalf("empty password accepted: %q %v", input, err)
		}
	}
	for _, tc := range []struct {
		sites    []string
		password string
	}{{nil, "secret"}, {[]string{"file:///private"}, "secret"}, {[]string{"https://example.test"}, ""}} {
		if err := Put("name", tc.sites, "", tc.password, "cli", time.Now()); err == nil {
			t.Fatal("invalid entry persisted")
		}
	}
	if _, err := os.Stat(path()); !os.IsNotExist(err) {
		t.Fatalf("invalid commands changed vault: %v", err)
	}
}

func TestVaultCorruptionFailsClosedWithoutOverwritingUserFile(t *testing.T) {
	useTestStore(t)
	if err := os.MkdirAll(filepath.Dir(path()), 0700); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"{broken", "null"} {
		if err := os.WriteFile(path(), []byte(raw), 0600); err != nil {
			t.Fatal(err)
		}
		if raw == "null" {
			list, err := List()
			if err != nil || len(list) != 0 {
				t.Fatal("null store not treated as empty", err)
			}
			continue
		}
		if _, err := List(); err == nil {
			t.Fatal("corrupt store listed")
		}
		if _, err := Remove("name"); err == nil {
			t.Fatal("corrupt store overwritten on remove")
		}
		if err := Put("name", []string{"https://example.test"}, "", "secret", "cli", time.Now()); err == nil {
			t.Fatal("corrupt store overwritten on put")
		}
		if _, _, err := Reveal("name", "https://example.test"); err == nil {
			t.Fatal("corrupt store revealed password")
		}
		data, err := os.ReadFile(path())
		if err != nil || string(data) != raw {
			t.Fatal("user store changed", err)
		}
	}
	if err := os.Remove(path()); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path(), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := List(); err == nil {
		t.Fatal("directory accepted as vault")
	}
	if Allows([]string{"https://%zz", "http://example.test"}, "https://example.test") || Allows(nil, "://bad") {
		t.Fatal("invalid site matched")
	}
	if got := Mask(""); got != "" {
		t.Fatalf("empty username mask: %q", got)
	}
}
