package execution

import (
	"runtime"
	"testing"
)

func TestDecodeOutputKeepsUTF8AndTrimsSplitRune(t *testing.T) {
	if got := decodeOutput([]byte("日志 ok")); got != "日志 ok" {
		t.Fatal(got)
	}
	split := []byte("日志")[:5] // second rune cut after its first two bytes
	if got := decodeOutput(split); got != "日" {
		t.Fatalf("%q", got)
	}
	if got := decodeOutput([]byte{'a', 0xff, 'b'}); runtime.GOOS != "windows" && got != "a\uFFFDb" {
		t.Fatalf("%q", got)
	}
}
