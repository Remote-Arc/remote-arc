// Package localmcp uses the official MCP Go SDK for stdio negotiation,
// cancellation, framing and input validation. Stdout contains protocol only.
package localmcp

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func content(result protocol.Result) *mcp.CallToolResult {
	out := &mcp.CallToolResult{IsError: result.IsError}
	for _, c := range result.Content {
		out.Content = append(out.Content, &mcp.TextContent{Text: c.Text})
	}
	return out
}
func Server(core *execution.Core, version string) *mcp.Server {
	return server(core, version, protocol.Policy{}, nil)
}

func server(core *execution.Core, version string, policy protocol.Policy, scope *workspaceScope) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "remotearc-local-mcp", Version: version}, nil)
	mcp.AddTool(s, &mcp.Tool{Name: "remote_arc_status", Description: "Show the local permission mode and native execution backend.", InputSchema: map[string]any{"type": "object", "properties": map[string]any{}}, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, input map[string]any) (*mcp.CallToolResult, any, error) {
		status := map[string]any{"name": "remotearc-local-mcp", "version": version, "mode": core.Mode, "backend": "Remote Arc native execution core", "engine": "go", "desktop_commander": false}
		if scope != nil {
			status["workspace"] = scope.path
			status["scope"] = "workspace-read-only"
			status["root_available"] = scope.verify() == nil
		}
		return content(protocol.TextResult(status)), nil, nil
	})
	readOnly := map[string]bool{"list_directory": true, "browse_directories": true, "read_file": true, "read_binary_file": true, "get_file_info": true, "list_processes": true, "list_undo_actions": true, "process_status": true, "process_output": true, "list_managed_processes": true}
	for _, definition := range core.ListTools() {
		d := definition
		if scope != nil && !workspaceTools[d.Name] {
			continue
		}
		destructive := !readOnly[d.Name]
		open := d.Name == "start_process"
		// Copy the schema: the SDK may resolve defaults during registration.
		b, _ := json.Marshal(d.InputSchema)
		schema := map[string]any{}
		json.Unmarshal(b, &schema)
		mcp.AddTool(s, &mcp.Tool{Name: d.Name, Description: d.Description, InputSchema: schema, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: readOnly[d.Name], DestructiveHint: &destructive, OpenWorldHint: &open}}, func(ctx context.Context, req *mcp.CallToolRequest, input map[string]any) (*mcp.CallToolResult, any, error) {
			if scope != nil {
				if err := scope.verify(); err != nil {
					return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: err.Error()}}}, nil, nil
				}
			}
			result, e := core.Call(ctx, d.Name, input, policy)
			if e != nil {
				return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: e.Error()}}}, nil, nil
			}
			return content(result), nil, nil
		})
	}
	return s
}
func Run(ctx context.Context, core *execution.Core, version string) error {
	defer core.Close()
	// In CI stdin can already be at EOF. A pre-cancelled invocation must not
	// race that clean transport shutdown and accidentally report success.
	if err := ctx.Err(); err != nil {
		return err
	}
	err := Server(core, version).Run(ctx, &mcp.StdioTransport{MaxLineLength: 32 << 20})
	if err == nil && ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}
