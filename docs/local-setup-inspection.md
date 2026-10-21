# Local setup inspection (development candidate)

First implementation slice for [#254](https://github.com/Remote-Arc/remote-arc/issues/254),
following the accepted [compatibility matrix](agent-takeover-compatibility-v1.md)
and [consent ADR](agent-takeover-consent-adr.md). This does not complete #254 or
install an integration. Use a binary built from this PR; an older installed CLI
may not have this command. Check `remotelink --version` and `remotelink setup --help`.

```sh
remotelink setup inspect
remotelink setup inspect --agent codex
```

The JSON report lists executable candidates found through PATH and fixed install
locations. On Windows these include npm launchers, the per-user native bin and
at most 32 Codex Desktop build directories. macOS additionally checks named
Codex/ChatGPT application bundles. Linux/WSL inspects its own environment, not
Windows installations or an assumed cross-OS path mapping.

`candidate_found` means an executable-looking file exists at a candidate path;
it does not establish vendor identity, installed version or compatibility. The
report leaves version `not_checked`, compatibility `unqualified` and integration
`not_inspected`. `not_found` means no candidate was found within this limited
search, not that the software is absent. Custom installations outside PATH and
these locations require a later explicit selection.

This inspection does not run any executable, read private sessions or client
configuration, pair a device, access a backend, create an account or change
files. No administrative permission is needed. Output contains local executable
paths; treat it as local information when sharing diagnostics. It is not saved
automatically.

The next separately reviewed slices of #254 must provide explicit version and
capability diagnostics, automatic supported integration, conditional updates with
backups, repair/rollback/uninstall, managed-config checks and real
Windows/macOS/WSL acceptance. Hook trust and cloud pairing remain separate
provider/account requirements. Routine local setup must not add preview or
approval gates; dry-run remains optional. No production or package promotion is
implied by this PR.
