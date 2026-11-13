//go:build !windows

package execution

import (
	"strings"
	"unicode/utf8"
)

// decodeOutput returns process output as UTF-8 text.
func decodeOutput(b []byte) string {
	if trimmed := utf8Prefix(b); utf8.Valid(trimmed) {
		return string(trimmed)
	}
	return strings.ToValidUTF8(string(b), "�")
}
