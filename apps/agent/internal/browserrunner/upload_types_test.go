package browserrunner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUploadTypesIncludeMediaWithPerClassLimits(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"clip.mp4", "Clip.MOV", "voice.m4a", "resume.pdf", "sheet.xlsx", "photo.webp"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("data"), 0o600); err != nil {
			t.Fatal(err)
		}
		if size, digest, err := fileDigest(path); err != nil || size != 4 || len(digest) != 64 {
			t.Fatal(name, size, digest, err)
		}
	}
	exe := filepath.Join(dir, "tool.exe")
	_ = os.WriteFile(exe, []byte("data"), 0o600)
	if _, _, err := fileDigest(exe); err == nil || !strings.Contains(err.Error(), "UNSUPPORTED_UPLOAD_TYPE") || !strings.Contains(err.Error(), "mp4") {
		t.Fatal(err)
	}
	if uploadLimits[".mp4"] != maxVideoUpload || uploadLimits[".pdf"] != maxDocumentUpload || uploadLimits[".mp3"] != maxAudioUpload {
		t.Fatal("unexpected upload limits")
	}
	big := filepath.Join(dir, "big.png")
	f, _ := os.Create(big)
	_ = f.Truncate(maxDocumentUpload + 1)
	f.Close()
	if _, _, err := fileDigest(big); err == nil || !strings.Contains(err.Error(), "UPLOAD_SIZE_LIMIT") {
		t.Fatal(err)
	}
}
