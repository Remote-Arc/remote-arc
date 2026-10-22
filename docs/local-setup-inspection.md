# Local setup inspection (0.6.2-rc.3)

First implementation slice for [#254](https://github.com/Remote-Arc/remote-arc/issues/254),
following the accepted [compatibility matrix](agent-takeover-compatibility-v1.md)
and [consent ADR](agent-takeover-consent-adr.md). This does not complete #254 or
install an integration. Use native **0.6.2-rc.3** or later, or
`npx remotelink@0.6.2-rc.3 setup inspect`; stable and older RC installations may
not have this command. Check `remotelink --version` and `remotelink setup --help`.

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

The separate [local Codex integration](codex-local-integration.md) commands now
provide capability-qualified installation, status, doctor, repair and owned-entry
uninstall in the development candidate. `inspect` itself retains the limited,
non-executing behavior described above. Automatic first-run dispatch, Claude
integration and full distribution/real macOS/WSL acceptance remain in #254.
Hook trust and cloud pairing remain separate provider/account requirements.
Routine local setup does not add preview or approval gates. No production or
package promotion is implied by these candidate commands.
