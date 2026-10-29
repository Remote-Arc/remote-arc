//go:build windows

package execution

import "testing"

func TestDecodeOutputUsesOEMCodePage(t *testing.T) {
	// "中文" in code page 936 (GBK).
	gbk := []byte{0xd6, 0xd0, 0xce, 0xc4}
	if text, ok := decodeCodePage(gbk, 936); !ok || text != "中文" {
		t.Fatalf("%q %v", text, ok)
	}
	if oemCodePage() == 936 {
		if got := decodeOutput(gbk); got != "中文" {
			t.Fatalf("%q", got)
		}
	}
}
