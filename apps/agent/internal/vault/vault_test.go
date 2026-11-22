package vault

import (
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

// CI Macs have no unlocked login Keychain; the Keychain path is exercised on
// real Macs. Windows CI exercises DPAPI.
func useTestStore(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	if runtime.GOOS == "darwin" {
		t.Setenv("REMOTEARC_VAULT_STORE", "file")
	}
}

func TestVaultFillsOnlyItsSites(t *testing.T) {
	useTestStore(t)
	now := time.Date(2026, 10, 23, 4, 0, 0, 0, time.UTC)
	if e := Put("jenny-pageup", []string{"nzlinfox-identity.login.pageuppeople.com", "https://*.pageuppeople.com"}, "cenniferchen@gmail.com", "s3cret pass", "cli", now); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(path())
	if strings.Contains(string(b), "s3cret pass") {
		t.Fatal("password stored in the clear")
	}
	if fi, e := os.Stat(path()); e == nil && fi.Mode().Perm()&0077 != 0 && os.PathSeparator == '/' {
		t.Fatalf("vault readable by others: %v", fi.Mode())
	}
	u, p, e := Reveal("jenny-pageup", "https://secure.dc2.pageuppeople.com/apply/941")
	if e != nil || u != "cenniferchen@gmail.com" || p != "s3cret pass" {
		t.Fatalf("reveal on a bound site: %q %q %v", u, p, e)
	}
	for _, page := range []string{"https://pageuppeople.com.evil.test/login", "http://nzlinfox-identity.login.pageuppeople.com/", "https://evilpageuppeople.com/"} {
		if _, _, e := Reveal("jenny-pageup", page); e == nil || !strings.HasPrefix(e.Error(), "SECRET_WRONG_SITE") {
			t.Fatalf("revealed on %s: %v", page, e)
		}
	}
	if _, _, e := Reveal("nobody", "https://secure.dc2.pageuppeople.com/"); e == nil || !strings.HasPrefix(e.Error(), "SECRET_NOT_FOUND") {
		t.Fatalf("missing entry: %v", e)
	}
	list, _ := List()
	if len(list) != 1 || list[0].Secret != "" || len(list[0].Sites) != 2 {
		t.Fatalf("list: %+v", list)
	}
	if m := Match("https://nzlinfox-identity.login.pageuppeople.com/"); len(m) != 1 || m[0].Secret != "" {
		t.Fatalf("match: %+v", m)
	}
	// A new password keeps the sites already allowed.
	if e := Put("jenny-pageup", []string{"https://careers.pageuppeople.com"}, "", "n3w", "runner", now.Add(time.Hour)); e != nil {
		t.Fatal(e)
	}
	if _, p, _ := Reveal("jenny-pageup", "https://nzlinfox-identity.login.pageuppeople.com/x"); p != "n3w" {
		t.Fatalf("updated password: %q", p)
	}
	if ok, e := Remove("jenny-pageup"); !ok || e != nil {
		t.Fatalf("remove: %v %v", ok, e)
	}
	if m := Match("https://careers.pageuppeople.com/"); len(m) != 0 {
		t.Fatalf("removed entry still matches: %+v", m)
	}
	if Mask("cenniferchen@gmail.com") != "ce**********@gmail.com" || Mask("sam") != "s**" {
		t.Fatalf("mask: %s %s", Mask("cenniferchen@gmail.com"), Mask("sam"))
	}
	if e := Put("bad name", []string{"https://x.test"}, "", "p", "cli", now); e == nil {
		t.Fatal("invalid name accepted")
	}
}

func TestVaultCommand(t *testing.T) {
	useTestStore(t)
	in, w, _ := os.Pipe()
	_, _ = w.WriteString("cli-pass\n")
	w.Close()
	var out strings.Builder
	if e := Command([]string{"add", "sam-lever", "--site", "https://jobs.lever.co", "--username=sam@example.test"}, in, &out); e != nil {
		t.Fatal(e, out.String())
	}
	if strings.Contains(out.String(), "cli-pass") {
		t.Fatal("password echoed")
	}
	if _, p, e := Reveal("sam-lever", "https://jobs.lever.co/acme/1/apply"); e != nil || p != "cli-pass" {
		t.Fatalf("saved: %q %v", p, e)
	}
	out.Reset()
	if e := Command([]string{"list"}, os.Stdin, &out); e != nil || !strings.Contains(out.String(), "sam-lever\thttps://jobs.lever.co\ts**@example.test") || strings.Contains(out.String(), "cli-pass") {
		t.Fatalf("list: %v %q", e, out.String())
	}
	if e := Command([]string{"add", "nosite"}, os.Stdin, &out); e == nil {
		t.Fatal("add without a site accepted")
	}
	if e := Command([]string{"remove", "sam-lever"}, os.Stdin, &out); e != nil {
		t.Fatal(e)
	}
	if e := Command([]string{"remove", "sam-lever"}, os.Stdin, &out); e == nil {
		t.Fatal("removing a missing entry succeeded")
	}
}
