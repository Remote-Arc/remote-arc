package codexsetup

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The installed-client substitute is this test executable, not a shell script.
// It exercises framing, schema qualification and redacted errors on all OSes.
func TestMain(m *testing.M) {
	if os.Getenv("REMOTEARC_CODEX_TEST_HELPER") == "1" {
		fakeCodex()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func fakeCodex() {
	mode := os.Getenv("REMOTEARC_CODEX_TEST_MODE")
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		if mode == "bad_version" {
			fmt.Println("PRIVATE_VENDOR_DIAGNOSTIC")
		} else {
			fmt.Println("codex-cli 0.163.0-alpha.11")
		}
		return
	}
	if len(os.Args) > 4 && os.Args[2] == "generate-json-schema" {
		if mode == "schema_failure" {
			os.Exit(1)
		}
		writeSchemas(os.Args[len(os.Args)-1], mode == "old_schema")
		return
	}
	var replies map[string][]map[string]json.RawMessage
	b, _ := os.ReadFile(filepath.Join(os.Getenv("CODEX_HOME"), "responses.json"))
	_ = json.Unmarshal(b, &replies)
	writer := json.NewEncoder(os.Stdout)
	scanner := bufio.NewScanner(os.Stdin)
	threadRoot := ""
	for scanner.Scan() {
		var request struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if json.Unmarshal(scanner.Bytes(), &request) != nil {
			continue
		}
		if len(request.ID) == 0 {
			continue
		}
		if request.Method == "initialize" {
			writer.Encode(map[string]any{"id": request.ID, "result": map[string]any{}})
			continue
		}
		if mode == "disconnect" {
			return
		}
		if mode == "integration" {
			var params map[string]json.RawMessage
			_ = json.Unmarshal(request.Params, &params)
			result, code := integrationReply(request.Method, params, &threadRoot)
			if code != 0 {
				writer.Encode(map[string]any{"id": request.ID, "error": map[string]any{"code": code, "message": "synthetic rejection"}})
			} else {
				writer.Encode(map[string]any{"id": request.ID, "result": result})
			}
			continue
		}
		if mode == "invalid" {
			fmt.Println("not JSON PRIVATE_VENDOR_DIAGNOSTIC")
			return
		}
		if mode == "oversize" {
			fmt.Println(strings.Repeat("x", 9<<20))
			return
		}
		if mode == "provider_request" {
			writer.Encode(map[string]any{"id": 900, "method": "tool/requestUserInput", "params": map[string]any{"message": "PRIVATE_VENDOR_DIAGNOSTIC"}})
			scanner.Scan()
			return
		}
		if mode == "notification" {
			writer.Encode(map[string]any{"method": "fixture/changed", "params": map[string]any{}})
		}
		if log := os.Getenv("REMOTEARC_CODEX_TEST_LOG"); log != "" {
			f, err := os.OpenFile(log, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
			if err == nil {
				_ = json.NewEncoder(f).Encode(map[string]any{"method": request.Method, "params": request.Params})
				f.Close()
			}
		}
		response := map[string]any{"id": request.ID, "result": map[string]any{}}
		if sequence := replies[request.Method]; len(sequence) > 0 {
			for key, value := range sequence[0] {
				response[key] = value
			}
			replies[request.Method] = sequence[1:]
		}
		writer.Encode(response)
	}
}

func integrationReply(method string, params map[string]json.RawMessage, threadRoot *string) (any, int) {
	profile := os.Getenv("CODEX_HOME")
	statePath := filepath.Join(profile, "synthetic-state.json")
	var state struct {
		Revision int                        `json:"revision"`
		Servers  map[string]json.RawMessage `json:"servers"`
		Managed  bool                       `json:"managed"`
	}
	b, _ := os.ReadFile(statePath)
	_ = json.Unmarshal(b, &state)
	if state.Servers == nil {
		state.Servers = map[string]json.RawMessage{}
	}
	switch method {
	case "configRequirements/read":
		if state.Managed {
			return map[string]any{"requirements": map[string]any{"allowedSandboxModes": []string{"readOnly"}}}, 0
		}
		return map[string]any{"requirements": nil}, 0
	case "config/read":
		return map[string]any{"layers": []any{map[string]any{"name": map[string]any{"type": "user", "file": filepath.Join(profile, "config.toml")}, "version": fmt.Sprint(state.Revision), "config": map[string]any{"mcp_servers": state.Servers}}}}, 0
	case "config/batchWrite":
		var expected string
		_ = json.Unmarshal(params["expectedVersion"], &expected)
		if expected != fmt.Sprint(state.Revision) {
			return nil, -32600
		}
		var edits []struct {
			Key   string          `json:"keyPath"`
			Value json.RawMessage `json:"value"`
		}
		_ = json.Unmarshal(params["edits"], &edits)
		for _, edit := range edits {
			key := strings.TrimPrefix(edit.Key, "mcp_servers.")
			if emptyJSON(edit.Value) {
				delete(state.Servers, key)
			} else {
				state.Servers[key] = edit.Value
			}
		}
		state.Revision++
		b, _ = json.Marshal(state)
		_ = os.WriteFile(statePath, b, 0600)
		return map[string]any{"status": "ok", "version": fmt.Sprint(state.Revision)}, 0
	case "thread/start":
		_ = json.Unmarshal(params["cwd"], threadRoot)
		return map[string]any{"thread": map[string]any{"id": "synthetic-thread"}}, 0
	case "mcpServerStatus/list":
		var name string
		_ = json.Unmarshal(params["serverName"], &name)
		tools := map[string]any{}
		for _, tool := range []string{"remote_arc_status", "list_directory", "read_file", "read_binary_file", "get_file_info"} {
			tools[tool] = map[string]any{"name": tool}
		}
		return map[string]any{"data": []any{map[string]any{"name": name, "tools": tools}}}, 0
	case "mcpServer/tool/call":
		status, _ := json.Marshal(map[string]any{"mode": "safe", "scope": "workspace-read-only", "workspace": *threadRoot, "root_available": true})
		return map[string]any{"content": []any{map[string]any{"type": "text", "text": string(status)}}}, 0
	}
	return nil, -32601
}

func writeSchemas(dir string, old bool) {
	_ = os.MkdirAll(filepath.Join(dir, "v2"), 0700)
	methods := []string{"config/read", "config/batchWrite", "configRequirements/read", "thread/start", "mcpServerStatus/list", "mcpServer/tool/call"}
	oneOf := []any{}
	for _, method := range methods {
		oneOf = append(oneOf, map[string]any{"properties": map[string]any{"method": map[string]any{"enum": []string{method}}}})
	}
	b, _ := json.Marshal(map[string]any{"oneOf": oneOf})
	_ = os.WriteFile(filepath.Join(dir, "ClientRequest.json"), b, 0600)
	for file, fields := range map[string][]string{"ConfigBatchWriteParams": {"expectedVersion", "filePath", "edits"}, "ConfigReadParams": {"includeLayers", "cwd"}, "ListMcpServerStatusParams": {"serverName", "threadId"}, "ThreadStartParams": {"ephemeral", "config"}} {
		properties := map[string]any{}
		for _, field := range fields {
			if old && field == "expectedVersion" {
				continue
			}
			properties[field] = map[string]any{"type": "string"}
		}
		b, _ = json.Marshal(map[string]any{"properties": properties})
		_ = os.WriteFile(filepath.Join(dir, "v2", file+".json"), b, 0600)
	}
}

func fixtureRPC(t *testing.T, replies map[string][]map[string]any) (*rpcClient, string) {
	t.Helper()
	profile := t.TempDir()
	return fixtureRPCProfile(t, profile, replies), profile
}

func fixtureRPCProfile(t *testing.T, profile string, replies map[string][]map[string]any) *rpcClient {
	t.Helper()
	b, err := json.Marshal(replies)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(profile, "responses.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTEARC_CODEX_TEST_HELPER", "1")
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	rpc, err := startRPC(ctx, binary, profile)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(rpc.close)
	return rpc
}

func ok(value any) map[string]any { return map[string]any{"result": value} }

func TestRPCFramingNotificationsAndPrivateErrors(t *testing.T) {
	t.Setenv("REMOTEARC_CODEX_TEST_MODE", "notification")
	rpc, _ := fixtureRPC(t, map[string][]map[string]any{"fixture/read": {ok(map[string]any{"observed": true})}, "fixture/error": {{"error": map[string]any{"code": -32000, "message": "PRIVATE_VENDOR_DIAGNOSTIC"}}}})
	var result map[string]any
	if err := rpc.call("fixture/read", map[string]any{}, &result); err != nil || result["observed"] != true {
		t.Fatal(result, err)
	}
	err := rpc.call("fixture/error", map[string]any{}, &result)
	expectCode(t, err, "codex_request_rejected")
	if strings.Contains(err.Error(), "PRIVATE_VENDOR_DIAGNOSTIC") {
		t.Fatal("provider diagnostics exposed")
	}
}

func TestRPCRejectsProviderPromptsMalformedOversizeAndEOF(t *testing.T) {
	for mode, code := range map[string]string{"provider_request": "provider_action_required", "invalid": "client_protocol_invalid", "oversize": "client_disconnected", "disconnect": "client_disconnected"} {
		t.Run(mode, func(t *testing.T) {
			t.Setenv("REMOTEARC_CODEX_TEST_MODE", mode)
			rpc, _ := fixtureRPC(t, nil)
			var result json.RawMessage
			err := rpc.call("fixture/read", map[string]any{}, &result)
			expectCode(t, err, code)
			if strings.Contains(err.Error(), "PRIVATE_VENDOR_DIAGNOSTIC") {
				t.Fatal("private diagnostic exposed")
			}
		})
	}
}

func TestRPCRejectsWrongResponseShape(t *testing.T) {
	rpc, _ := fixtureRPC(t, map[string][]map[string]any{"fixture/read": {ok("not-an-object")}})
	var result map[string]any
	expectCode(t, rpc.call("fixture/read", nil, &result), "client_protocol_invalid")
}

func TestVersionAndSchemaQualification(t *testing.T) {
	t.Setenv("REMOTEARC_CODEX_TEST_HELPER", "1")
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	profile := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	version, err := qualify(ctx, binary, profile)
	if err != nil || version != "0.163.0-alpha.11" {
		t.Fatal(version, err)
	}
	for mode, code := range map[string]string{"bad_version": "codex_version_unsupported", "old_schema": "codex_capability_unsupported", "schema_failure": "codex_capability_unsupported"} {
		t.Setenv("REMOTEARC_CODEX_TEST_MODE", mode)
		_, err = qualify(ctx, binary, profile)
		expectCode(t, err, code)
		if strings.Contains(err.Error(), "PRIVATE_VENDOR_DIAGNOSTIC") {
			t.Fatal("version diagnostic exposed")
		}
	}
	_, err = qualify(ctx, filepath.Join(profile, "missing"), profile)
	expectCode(t, err, "codex_not_found")
	var output cappedOutput
	if _, err = output.Write(make([]byte, 4097)); err != io.ErrShortBuffer {
		t.Fatal("version output unbounded")
	}
	if _, err = output.Write([]byte("bounded")); err != nil {
		t.Fatal(err)
	}
}

func TestSchemaBoundsMissingAndMissingConditionalMethod(t *testing.T) {
	dir := t.TempDir()
	writeSchemas(dir, false)
	if err := checkSchemas(dir); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "ClientRequest.json")
	if err := os.WriteFile(path, []byte(`{"oneOf":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	expectCode(t, checkSchemas(dir), "codex_capability_unsupported")
	if err := os.WriteFile(path, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	expectCode(t, checkSchemas(dir), "codex_capability_unsupported")
	if err := os.WriteFile(path, make([]byte, 4<<20), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := schemaFile(path); err == nil {
		t.Fatal("oversized schema read")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	expectCode(t, checkSchemas(dir), "codex_capability_unsupported")
}
