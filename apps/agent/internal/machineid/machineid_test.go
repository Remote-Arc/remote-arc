package machineid

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHashOfNormalisesAndHidesTheIdentifier(t *testing.T) {
	guid := "{6F9619FF-8B86-D011-B42D-00C04FC964FF}"
	got := hashOf(guid)
	if len(got) != 64 {
		t.Fatalf("hash length = %d, want 64 hex characters", len(got))
	}
	for _, same := range []string{"6f9619ff-8b86-d011-b42d-00c04fc964ff", " 6F9619FF8B86D011B42D00C04FC964FF\n"} {
		if hashOf(same) != got {
			t.Fatalf("hashOf(%q) differs from the braced, upper-case form", same)
		}
	}
	if hashOf("6f9619ff-8b86-d011-b42d-00c04fc964fe") == got {
		t.Fatal("different identifiers must not share a hash")
	}
	if got == "6f9619ff8b86d011b42d00c04fc964ff" {
		t.Fatal("the raw identifier must not be reported")
	}
}

func TestHashOfRejectsPlaceholders(t *testing.T) {
	for _, raw := range []string{"", "   ", "short", "00000000-0000-0000-0000-000000000000", "ffffffffffffffff", "\n"} {
		if got := hashOf(raw); got != "" {
			t.Fatalf("hashOf(%q) = %q, want no hash", raw, got)
		}
	}
}

func TestParseIOReg(t *testing.T) {
	output := `+-o J314sAP  <class IOPlatformExpertDevice, id 0x100000215, registered>
    {
      "IOPlatformSerialNumber" = "C02XXXXXXX"
      "IOPlatformUUID" = "564D8E2A-1B3C-4D5E-8F90-ABCDEF123456"
    }`
	if got := parseIOReg(output); got != "564D8E2A-1B3C-4D5E-8F90-ABCDEF123456" {
		t.Fatalf("parseIOReg = %q", got)
	}
	if got := parseIOReg("no uuid here"); got != "" {
		t.Fatalf("parseIOReg without a UUID = %q", got)
	}
}

func TestFirstReadableSkipsMissingAndBlankFiles(t *testing.T) {
	dir := t.TempDir()
	blank := filepath.Join(dir, "blank")
	real := filepath.Join(dir, "real")
	if err := os.WriteFile(blank, []byte("\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(real, []byte("4c4c4544004b5a1080524ac04f585a32\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := firstReadable([]string{filepath.Join(dir, "missing"), blank, real}); got != "4c4c4544004b5a1080524ac04f585a32\n" {
		t.Fatalf("firstReadable = %q", got)
	}
	if got := firstReadable([]string{filepath.Join(dir, "missing"), blank}); got != "" {
		t.Fatalf("firstReadable with nothing usable = %q", got)
	}
}
