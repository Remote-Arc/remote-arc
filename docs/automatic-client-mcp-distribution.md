# Client MCP distribution qualification — 22 October 2026

Scope: [#254](https://github.com/Remote-Arc/remote-arc/issues/254). All cases use
fresh temporary Codex/Claude/Remote Arc profiles, synthetic loopback device
credentials and an actual device file read. No account credentials or model
turns are used. Codex verifies tools through its app-server; Claude verifies a
connection with `mcp get`, not a tool call through a Claude model session.

| Runtime and entry point | Evidence | Result |
| --- | --- | --- |
| Windows x64, public rc.4 npm launcher, native client executables discoverable | [JSON](validation/automatic-client-mcp-windows-rc4-npm.json) | Passed; public binary SHA256 `6b52d0fc89646fd6213109caff15a5bb505c1a6fa6a3d0e95adb8bda5ed075ca` |
| Ubuntu on actual WSL2, public rc.4 npm launcher, Linux clients | [JSON](validation/automatic-client-mcp-wsl-rc4-npm.json) | Passed; public binary SHA256 `44bab23a870afe96ed15885f3424f63d72bde1d59cf116b46b5b7966254205ee` |
| Windows x64, source fix, PATH has only npm client shims plus OS/Git tools | [JSON](validation/automatic-client-mcp-windows-npm-source.json) | Passed; source build, not the published rc.4 binary |
| Public rc.4, Windows x64, only npm client shims | [Baseline](validation/automatic-client-mcp-windows-npm-baseline.json) | Reproduced failure: inspection finds both shims but setup reports both clients as `not_found` |

Successful cases cover ordinary background registration, a simultaneous device
read, safe MCP catalog/status, repeated config hashes, custom/disabled entries,
owned uninstall and normal device operation with both client configs invalid.
Versions: Codex `0.163.0-alpha.11`, Claude Code `2.1.118`, Node `24.11.1`.
The public npm cases download and execute the manifest-pinned release asset;
`REMOTEARC_GO_BINARY` is removed from the test environment.

The Windows fix resolves the official native npm package without executing the
`.cmd` wrapper. Both global npm prefixes and local `.bin` layouts have regression
tests; real npm packages qualify x64 here. ARM64 paths have synthetic coverage
and still need real Windows ARM64 qualification. Unknown JS-only/pnpm-specific
layouts are not claimed as supported.

The accompanying three-OS `Real client MCP qualification` workflow uses actual
pinned provider binaries, the source Agent, a public native Agent and its public
npm launcher. Its results are distinct from the repository's fake device tests.
macOS real-client receipts and a candidate containing the Windows fix must be
verified before marking the remaining distribution work complete. The stable
curl installer still targets 0.6.1; it must not be described as shipping this RC
feature. rc.5 publication is being handled separately.
