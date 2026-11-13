package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestBenchmarkProtocolCorrelatesConcurrentResultsAndDrainsEOF(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	file := filepath.Join(home, "fixture.txt")
	if err := os.WriteFile(file, []byte("fixture contents"), 0600); err != nil {
		t.Fatal(err)
	}
	input, err := os.CreateTemp(home, "input")
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	if _, err = io.WriteString(input, "invalid-json\n"); err != nil {
		t.Fatal(err)
	}
	enc := json.NewEncoder(input)
	for _, req := range []request{
		{ID: 1, Tool: "read_file", Args: map[string]any{"path": file}},
		{ID: 2, Tool: "unknown_tool", Args: map[string]any{}},
		{ID: 3, Tool: "read_file", Args: map[string]any{"path": filepath.Join(home, "missing.txt")}, Policy: protocol.Policy{WorkspaceRoots: []string{home}}},
	} {
		if err = enc.Encode(req); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = input.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	output, err := os.CreateTemp(home, "output")
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	previousIn, previousOut := os.Stdin, os.Stdout
	os.Stdin, os.Stdout = input, output
	defer func() { os.Stdin, os.Stdout = previousIn, previousOut }()
	main()
	if _, err = output.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(output)
	responses := map[int]map[string]any{}
	for {
		var response map[string]any
		err = decoder.Decode(&response)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal("interleaved or malformed protocol output", err)
		}
		id := int(response["id"].(float64))
		if _, ok := responses[id]; ok {
			t.Fatalf("duplicate response for %d", id)
		}
		responses[id] = response
	}
	if len(responses) != 3 {
		t.Fatalf("EOF lost work or invalid input produced a response: %v", responses)
	}
	if responses[1]["ok"] != true || !strings.Contains(string(mustJSON(t, responses[1]["value"])), "fixture contents") {
		t.Fatalf("real file read failed: %v", responses[1])
	}
	for _, id := range []int{2, 3} {
		if responses[id]["ok"] != false || responses[id]["error"] == "" {
			t.Fatalf("failure lost for request %d: %v", id, responses[id])
		}
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
