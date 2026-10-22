package localmcp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspaceidentity"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// A fixed allowlist prevents future safe-mode tools from silently widening
// workspace integration to device processes, Undo journals or other resources.
var workspaceTools = map[string]bool{
	"list_directory": true, "read_file": true,
	"read_binary_file": true, "get_file_info": true,
}

type workspaceScope struct {
	path string
	info os.FileInfo
}

func (s *workspaceScope) verify() error {
	current, err := os.Stat(s.path)
	if err != nil || !current.IsDir() || !os.SameFile(s.info, current) {
		return errors.New("Local MCP workspace changed or became unavailable; review the directory and restart the server.")
	}
	return nil
}

func WorkspaceServer(core *execution.Core, version, workspace string) (*mcp.Server, error) {
	return workspaceServer(core, version, workspace, "")
}

func workspaceServer(core *execution.Core, version, workspace, expectedIdentity string) (*mcp.Server, error) {
	if core.Mode != "safe" {
		return nil, errors.New("Workspace MCP requires safe mode.")
	}
	if strings.TrimSpace(workspace) == "" || !filepath.IsAbs(workspace) {
		return nil, errors.New("--mcp-workspace must name an absolute local directory.")
	}
	// Workspace consent must not double as private-session or pairing access.
	private := []string{config.Dir()}
	if home, err := os.UserHomeDir(); err == nil && filepath.IsAbs(home) {
		private = append(private, filepath.Join(home, ".codex"), filepath.Join(home, ".claude"))
	}
	for _, name := range []string{"CODEX_HOME", "CLAUDE_CONFIG_DIR"} {
		if path := os.Getenv(name); filepath.IsAbs(path) {
			private = append(private, path)
		}
	}
	p := protocol.Policy{TaskWorkspaceRoot: workspace, SensitivePaths: private}
	root, err := policy.Enforce(workspace, p, false)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, errors.New("--mcp-workspace must be a directory.")
	}
	// Windows Stat may defer loading its file ID until SameFile is called.
	// Resolve that ID now, before a rename/replacement can reuse this path.
	if !os.SameFile(info, info) {
		return nil, errors.New("Could not verify local MCP workspace identity.")
	}
	if expectedIdentity != "" {
		identity, err := workspaceidentity.Read(root)
		if err != nil || identity != expectedIdentity {
			return nil, errors.New("Local MCP workspace was replaced since installation; reinstall the integration for the intended project.")
		}
	}
	// Pin the resolved root, not an alias that can later point elsewhere.
	p.TaskWorkspaceRoot = root
	return server(core, version, p, &workspaceScope{root, info}), nil
}

func RunWorkspace(ctx context.Context, core *execution.Core, version, workspace string) error {
	return RunWorkspaceWithIdentity(ctx, core, version, workspace, "")
}

func RunWorkspaceWithIdentity(ctx context.Context, core *execution.Core, version, workspace, expectedIdentity string) error {
	defer core.Close()
	s, err := workspaceServer(core, version, workspace, expectedIdentity)
	if err != nil {
		return err
	}
	return s.Run(ctx, &mcp.StdioTransport{MaxLineLength: 32 << 20})
}
