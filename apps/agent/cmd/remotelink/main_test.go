package main

import (
	"io"
	"os"
	"strings"
	"testing"
)

func TestNativeEntrypointVersionNeedsNoPairing(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	previousArgs, previousOut := os.Args, os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Args = previousArgs; os.Stdout = previousOut; r.Close(); w.Close() })
	os.Args = []string{"remotelink", "--version"}
	os.Stdout = w
	main()
	w.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(data)) != version {
		t.Fatalf("native version output: %q", data)
	}
}
