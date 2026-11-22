package codexsetup

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func profileEnv(profile string) []string {
	env := []string{}
	for _, value := range os.Environ() {
		if !strings.EqualFold(strings.SplitN(value, "=", 2)[0], "CODEX_HOME") {
			env = append(env, value)
		}
	}
	return append(env, "CODEX_HOME="+profile)
}

type cappedOutput struct{ bytes.Buffer }

func (w *cappedOutput) Write(b []byte) (int, error) {
	if w.Len()+len(b) > 4096 {
		return 0, io.ErrShortBuffer
	}
	return w.Buffer.Write(b)
}

func qualify(ctx context.Context, binary, profile string) (string, error) {
	info, err := os.Stat(binary)
	if err != nil || !info.Mode().IsRegular() || !filepath.IsAbs(binary) {
		return "", fail("codex_not_found", "Select an installed native Codex executable or install Codex first.")
	}
	var out cappedOutput
	c := command(ctx, binary, "--version")
	c.Env = profileEnv(profile)
	c.Stderr = io.Discard
	c.Stdout = &out
	if c.Run() != nil {
		return "", fail("codex_version_unavailable", "Could not identify this Codex executable; update or select a native client.")
	}
	match := regexp.MustCompile(`^codex(?:-cli)?\s+([0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?)\s*$`).FindStringSubmatch(out.String())
	if len(match) != 2 {
		return "", fail("codex_version_unsupported", "The selected executable did not report a recognized Codex version.")
	}
	dir, err := os.MkdirTemp("", "remote-arc-codex-schema-")
	if err != nil {
		return "", fail("capability_probe_failed", "Could not create the temporary protocol diagnostic directory.")
	}
	// Only remove this generated diagnostic directory inside the resolved temp root.
	defer func() {
		root, e1 := filepath.EvalSymlinks(os.TempDir())
		target, e2 := filepath.EvalSymlinks(dir)
		if e1 != nil || e2 != nil || !filepath.IsAbs(target) {
			return
		}
		rel, e := filepath.Rel(root, target)
		if e == nil && filepath.Dir(rel) == "." && strings.HasPrefix(filepath.Base(rel), "remote-arc-codex-schema-") {
			_ = os.RemoveAll(target)
		}
	}()
	c = command(ctx, binary, "app-server", "generate-json-schema", "--out", dir)
	c.Env = profileEnv(profile)
	c.Stderr = io.Discard
	c.Stdout = io.Discard
	if c.Run() != nil {
		return "", fail("codex_capability_unsupported", "This Codex build cannot expose its protocol contract; update Codex.")
	}
	if err = checkSchemas(dir); err != nil {
		return "", err
	}
	return match[1], nil
}

func schemaFile(path string) (map[string]json.RawMessage, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 4<<20))
	if err != nil || len(b) >= 4<<20 {
		return nil, io.ErrShortBuffer
	}
	var schema map[string]json.RawMessage
	err = json.Unmarshal(b, &schema)
	return schema, err
}

func checkSchemas(dir string) error {
	unsupported := func() error {
		return fail("codex_capability_unsupported", "This Codex version lacks conditional configuration or scoped tool verification; update Codex.")
	}
	schema, err := schemaFile(filepath.Join(dir, "ClientRequest.json"))
	if err != nil {
		return unsupported()
	}
	var alternatives []struct {
		Properties map[string]struct {
			Enum []string `json:"enum"`
		} `json:"properties"`
	}
	if json.Unmarshal(schema["oneOf"], &alternatives) != nil {
		return unsupported()
	}
	methods := map[string]bool{}
	for _, entry := range alternatives {
		for _, method := range entry.Properties["method"].Enum {
			methods[method] = true
		}
	}
	for _, method := range []string{"config/read", "config/batchWrite", "configRequirements/read", "thread/start", "mcpServerStatus/list", "mcpServer/tool/call"} {
		if !methods[method] {
			return unsupported()
		}
	}
	for file, fields := range map[string][]string{"ConfigBatchWriteParams": {"expectedVersion", "filePath", "edits"}, "ConfigReadParams": {"includeLayers", "cwd"}, "ListMcpServerStatusParams": {"serverName", "threadId"}, "ThreadStartParams": {"ephemeral", "config"}} {
		schema, err = schemaFile(filepath.Join(dir, "v2", file+".json"))
		if err != nil {
			return unsupported()
		}
		var properties map[string]json.RawMessage
		if json.Unmarshal(schema["properties"], &properties) != nil {
			return unsupported()
		}
		for _, field := range fields {
			if len(properties[field]) == 0 {
				return unsupported()
			}
		}
	}
	return nil
}
