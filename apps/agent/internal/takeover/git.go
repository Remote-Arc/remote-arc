package takeover

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

const gitOutputBytes = 2 << 20

var errGitLimit = errors.New("Git output exceeded the inspection limit")

type cappedOutput struct {
	bytes.Buffer
	limit int
	full  bool
}

func (b *cappedOutput) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.Len() {
		b.full = true
		return 0, errGitLimit
	}
	return b.Buffer.Write(p)
}

// Do not inherit repository redirection, injected config, alternate indexes or
// object stores from a caller (e.g. another Git command or coding agent).
func inspectionEnv() []string {
	env := []string{}
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.HasPrefix(strings.ToUpper(key), "GIT_") {
			env = append(env, entry)
		}
	}
	// An empty protocol allowlist also blocks transports on Git versions that
	// predate GIT_NO_LAZY_FETCH (including partial-clone remote helpers).
	return append(env, "GIT_OPTIONAL_LOCKS=0", "GIT_TERMINAL_PROMPT=0", "GIT_NO_LAZY_FETCH=1", "GIT_ALLOW_PROTOCOL=", "GIT_NO_REPLACE_OBJECTS=1", "GIT_LITERAL_PATHSPECS=1", "LC_ALL=C")
}

type gitReader struct {
	binary string
	dir    string
	extra  []string
}

func (g gitReader) run(ctx context.Context, input []byte, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	base := []string{"--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.hooksPath=" + os.DevNull, "-c", "gc.auto=0", "-C", g.dir}
	base = append(base, g.extra...)
	cmd := exec.CommandContext(ctx, g.binary, append(base, args...)...)
	hideInspection(cmd)
	cmd.Env = inspectionEnv()
	cmd.Stdin = bytes.NewReader(input)
	out := &cappedOutput{limit: gitOutputBytes}
	cmd.Stdout = out
	// Git diagnostics may contain local configuration, paths or credentials.
	cmd.Stderr = io.Discard
	cmd.WaitDelay = time.Second
	err := cmd.Run()
	if out.full {
		return nil, errGitLimit
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return out.Bytes(), err
}

// Disable configured clean/process drivers before any worktree scan. A later
// attribute check declines filtered repositories instead of misreporting LFS
// working files as dirty. Reading config names never executes their values.
func (g *gitReader) disableFilters(ctx context.Context) ([]byte, error) {
	keys, err := g.run(ctx, nil, "config", "--null", "--name-only", "--get-regexp", `^filter\..*\.(clean|process|required)$`)
	var exit *exec.ExitError
	if err != nil && !(errors.As(err, &exit) && exit.ExitCode() == 1) {
		return nil, err
	}
	g.extra = nil
	for _, key := range bytes.Split(keys, []byte{0}) {
		if len(key) == 0 {
			continue
		}
		value := ""
		if strings.HasSuffix(string(key), ".required") {
			value = "false"
		}
		g.extra = append(g.extra, "-c", string(key)+"="+value)
	}
	return keys, nil
}
