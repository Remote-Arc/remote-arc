# Workspace read-only local MCP (development candidate)

A prerequisite for opt-in integrations in
[#254](https://github.com/Remote-Arc/remote-arc/issues/254). This does not install
an integration or change client configuration. Use a binary built from this PR;
this option is not in a published package yet.

```sh
remotelink --mcp --safe --mcp-workspace=/absolute/project
```

For a path containing spaces, pass `--mcp-workspace=/absolute/my project` as one
argument using the shell's normal quoting. It must be an existing absolute
directory. Starting this endpoint explicitly permits workspace file reads.

The endpoint exposes `remote_arc_status`, `list_directory`, `read_file`,
`read_binary_file` and `get_file_info`. It always uses safe mode, including when
the environment requests a broader mode. Process access, mutation, Undo and
device-wide directory navigation are excluded. No pairing, account, network
connection, hook or configuration edit is needed.

The existing execution-core policy checks canonical paths and sensitive files
on every call. Out-of-scope paths and symlink targets are denied, and directory
listing omits protected entries. Known private Codex/Claude roots (including
absolute environment overrides) and Remote Arc pairing storage remain blocked;
workspace consent is separate from session import. Status reports the resolved
root and whether it remains available. Replacing the root directory requires a
review and server restart.

This restricts tools offered by this MCP endpoint. It is not an OS sandbox or
interception of other tools/processes on the computer; a client may have its own
filesystem tools with different permissions. The path policy is not protection
against a hostile local actor racing filesystem changes. Automatic local setup,
managed configuration checks, conditional updates and rollback/uninstall
and real Windows/macOS/WSL onboarding acceptance remain in #254. The ordinary
`--mcp` endpoint keeps its existing device-level behavior.
