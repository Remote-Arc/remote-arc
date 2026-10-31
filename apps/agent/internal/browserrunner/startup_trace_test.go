package browserrunner

import (
	"bytes"
	"context"
	"errors"
	"log"
	"strings"
	"testing"
)

func TestStartupTraceKeepsTimeoutIdentityAndRedactsErrorContent(t *testing.T) {
	var output bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(previous) })
	s := &session{cp: &Checkpoint{SessionID: "trace-test"}}
	privateError := errors.New("https://user:password@example.test/login?otp=123456")
	if err := s.startupStep("setup", func() error { return privateError }); err != privateError {
		t.Fatal("ordinary error identity changed")
	}
	err := s.startupStep("launch", func() error { return context.DeadlineExceeded })
	if !errors.Is(err, context.DeadlineExceeded) || !strings.Contains(err.Error(), "launch") {
		t.Fatal("timeout lost its identity or phase", err)
	}
	text := output.String()
	for _, required := range []string{"phase=launch", "phase=setup", "elapsed_ms=", "outcome=timeout"} {
		if !strings.Contains(text, required) {
			t.Fatalf("startup timing lacks %s", required)
		}
	}
	for _, secret := range []string{"password", "example.test", "123456"} {
		if strings.Contains(text, secret) {
			t.Fatal("startup timing exposed error content")
		}
	}
}
