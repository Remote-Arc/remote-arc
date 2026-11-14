// Package machineid derives a stable, one-way identifier for the computer the
// Agent runs on. Remote Arc uses it to grant the Free unlimited trial once per
// computer. The operating system's own identifier never leaves the machine:
// only a namespaced SHA-256 of it is reported.
package machineid

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"regexp"
	"strings"
	"sync"
)

const namespace = "remotearc-machine-v1\x00"

var (
	once   sync.Once
	cached string
)

// Hash returns the hex SHA-256 of this computer's identifier, or "" when the
// operating system does not provide a usable one.
func Hash() string {
	once.Do(func() { cached = hashOf(readRaw()) })
	return cached
}

func hashOf(raw string) string {
	id := strings.ToLower(strings.TrimSpace(raw))
	id = strings.NewReplacer("-", "", "{", "", "}", "").Replace(id)
	if len(id) < 8 || isPlaceholder(id) {
		return ""
	}
	sum := sha256.Sum256([]byte(namespace + id))
	return hex.EncodeToString(sum[:])
}

// isPlaceholder reports an identifier made of one repeated character, which
// some images and virtual machines ship instead of a real ID.
func isPlaceholder(id string) bool {
	return strings.Trim(id, id[:1]) == ""
}

var ioregUUID = regexp.MustCompile(`"IOPlatformUUID"\s*=\s*"([^"]+)"`)

// parseIOReg extracts IOPlatformUUID from `ioreg -rd1 -c IOPlatformExpertDevice`.
func parseIOReg(output string) string {
	if match := ioregUUID.FindStringSubmatch(output); match != nil {
		return match[1]
	}
	return ""
}

// firstReadable returns the first file among paths that holds a usable
// identifier. Shared by every platform so its test compiles everywhere.
func firstReadable(paths []string) string {
	for _, path := range paths {
		if data, err := os.ReadFile(path); err == nil && hashOf(string(data)) != "" {
			return string(data)
		}
	}
	return ""
}
