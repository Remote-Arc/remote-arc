package journal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMalformedHistoryIsPreservedAndColorDoesNotAlterPersistentLog(t *testing.T) {
	for _, line := range []string{"", "short", "[99:99:99] info     invalid timestamp", "[12:30:40] alien    unknown level", "[12:30:40]                  ", "[12:30:40] warn     message without newline"} {
		got := FormatHistory(line, true)
		if strings.Contains(line, "message without newline") {
			if strings.HasSuffix(got, "\n") || !strings.Contains(got, "\x1b[") {
				t.Fatalf("history terminator/color: %q", got)
			}
		} else if got != line {
			t.Fatalf("malformed line rewritten: %q -> %q", line, got)
		}
	}
	root := t.TempDir()
	log := &Journal{Dir: root}
	path := filepath.Join(root, "events.log")
	if err := os.WriteFile(path, []byte(strings.Repeat("long line\n", 20000)), 0600); err != nil {
		t.Fatal(err)
	}
	tail := log.Tail(10000)
	if tail["truncated"] != true || len(tail["lines"].([]string)) != 200 {
		t.Fatalf("tail bounds: %v", tail)
	}
	cursor := int64(9999999)
	next, text := log.Read(&cursor)
	if next != 65536 || len(text) != 65536 {
		t.Fatalf("rotated cursor did not reset/bound read: %d %d", next, len(text))
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if next, text = log.Read(&cursor); next != cursor || text != "" {
		t.Fatal("missing history lost cursor")
	}
	blocked := filepath.Join(root, "file")
	if err := os.WriteFile(blocked, nil, 0600); err != nil {
		t.Fatal(err)
	}
	(&Journal{Dir: blocked}).Log("info", "cannot persist")
}
