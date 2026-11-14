<div align="center">

<img src="./assets/plugin-logo.svg" alt="Remote Arc" width="92" />

# Remote Arc

<!-- product-intro:start -->

**Agent infrastructure for real work across your apps and computers.**

Arc is your hosted AI agent. Connect brings the same authorized Apps and device execution to the AI client you already use. Remote Arc manages the context, permissions, persistent work, device placement and usage around model decisions so work can proceed from a request to an inspectable result.
<!-- product-intro:end -->

[Website](https://remotearc.app) · [Connect your AI](https://remotearc.app/connect-ai) · [Downloads](https://remotearc.app/downloads) · [User guide](https://remotearc.app/docs/start-here) · [Security](./SECURITY.md)

This repository holds the parts of Remote Arc that run on your computer and in your browser: the native device Agent, its Execution Core, the `remotelink` installer, the Chrome Companion, the website and Dashboard front end, the first-party Skills, and the plugin manifests for AI clients.

<sub>Source available for transparency and security review under a [proprietary license](./LICENSE). Not open-source licensed.</sub>

[![CI](https://github.com/Remote-Arc/remote-arc/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Remote-Arc/remote-arc/actions/workflows/ci.yml) [![Listed on MCP Market](https://mcpmarket.com/badge/server/remote-arc.svg?theme=dark)](https://mcpmarket.com/server/remote-arc?utm_source=readme&utm_medium=badge)

<p>
  <sub><b>Measured test coverage</b></sub><br />
  <a href="https://github.com/Remote-Arc/remote-arc/tree/coverage-badges"><img src="https://raw.githubusercontent.com/Remote-Arc/remote-arc/coverage-badges/coverage.svg" alt="Go statement coverage" /></a>
  <a href="https://github.com/Remote-Arc/remote-arc/tree/coverage-badges"><img src="https://raw.githubusercontent.com/Remote-Arc/remote-arc/coverage-badges/agent.svg" alt="Go Agent statement coverage" /></a>
  <a href="https://github.com/Remote-Arc/remote-arc/tree/coverage-badges"><img src="https://raw.githubusercontent.com/Remote-Arc/remote-arc/coverage-badges/core.svg" alt="Go Execution Core statement coverage" /></a>
</p>

<sub>Latest measured statement coverage of the device Agent and Execution Core on Linux; target ≥90%.</sub>

</div>

## What Remote Arc does

Remote Arc lets ChatGPT, Claude, Codex, Cursor and other MCP clients work on Windows, macOS and Linux computers you pair, under permissions you set per computer. Each computer connects outward to Remote Arc, so it needs no open inbound port or VPN. The MCP endpoint is `https://mcp.remotearc.app/mcp`.

<!-- product-overview:start -->

## Two ways to work

| Product     | Start here                                                           | What it does                                                                                                                        |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Arc**     | [Hosted workspace](https://agent.remotearc.app/dashboard/agent/chat) | Chat with a personal agent, use connected Apps/computers, reuse Skills, and create one-off Tasks or recurring routines.             |
| **Connect** | [Connect your AI](https://remotearc.app/connect-ai)                  | Use authorized cloud accounts, paired devices and your browser from compatible ChatGPT, Claude, Codex, Cursor or other MCP clients. |

Arc keeps a delegated responsibility together: its sources, instructions, conversation and run history, with fresh bounded judgment when scheduled and checks against actual results. Start with a daily work brief, project check-in, delivery verification or change follow-up. The [use-case catalog](https://remotearc.app/use-cases) also keeps Arc and Connect paths for all 15 concrete workflows.

Every plan includes every Connect tool. **Free** has monthly Connect call and file-transfer allowances and up to 2 computers. **Pro**, formerly Connect Unlimited, removes the monthly Connect call cap. **Pro** and **Max** include the computers, Arc-hosted AI and monthly Credits shown at checkout and in billing settings. Existing subscriptions retain their purchased terms until explicitly changed. Every account can activate a one-time 14-day Arc trial. Users never supply a model API key. Current prices and allowances are on the [pricing page](https://remotearc.app/pricing); third-party App charges are separate. Preview environments use simulated data.
<!-- product-overview:end -->

## Add Remote Arc to your AI client

The [setup guide](https://remotearc.app/connect-ai) has the current steps for each client. Remote Arc signs you in with OAuth; you never paste an API key.

| File                          | Used by                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `plugin.json`                 | Agent plugin manifest, including the OpenAI extension      |
| `.codex-plugin/plugin.json`   | Codex plugin                                               |
| `.mcp.json`, `mcp.json`       | MCP server definition for clients that read one            |
| `chatgpt-app-submission.json` | ChatGPT app submission                                     |
| `skills/`                     | First-party Skills, including the `setup` onboarding Skill |

## Install the Agent

Install the Agent only on computers the AI should work on. With npm (Node.js 20+), which also upgrades an existing install:

```bash
npx remotelink@latest
```

A background Agent from 0.7.1 on can also be updated from Dashboard → Devices with **Update now**; it refuses while work is running.

<!-- prettier-ignore-start -->

<!-- native-install:start -->
### Native downloads and Homebrew

Standalone 0.7.2 needs no Node.js or Go compiler. [Installation and upgrade guide](https://remotearc.app/downloads).

On macOS or Linux (including WSL), install without Node.js:

```sh
curl -fsSL https://remotearc.app/install.sh | sh
```

The script verifies SHA256 and installs to ~/.local/bin without sudo. On a first install from a terminal it then starts the Agent, so you can pair the computer and choose its permissions. Upgrades, runs without a terminal and `REMOTEARC_NO_START=1` only install; start the Agent with `remotelink`. Set REMOTEARC_INSTALL_DIR to an absolute path to choose another directory. Rerun the installer to upgrade after stopping the Agent.

| Platform | Download |
| --- | --- |
| macOS Apple Silicon | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-darwin-arm64) |
| macOS Intel | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-darwin-amd64) |
| Windows x64 | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-windows-amd64.exe) |
| Windows ARM64 | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-windows-arm64.exe) |
| Linux x64 | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-linux-amd64) |
| Linux ARM64 | [remotelink](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-linux-arm64) |

[SHA256SUMS](https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/SHA256SUMS) · [Release notes](https://github.com/Remote-Arc/remote-arc/releases/tag/remotelink-v0.7.2)

```bash
brew tap remote-arc/remote-arc https://github.com/Remote-Arc/remote-arc
if brew command trust >/dev/null 2>&1; then brew trust --formula remote-arc/remote-arc/remotelink remote-arc/remote-arc/remotelink-go; fi
brew install remote-arc/remote-arc/remotelink
remotelink
```

The existing `remotelink-go` formula remains available for upgrades; install one formula at a time.
<!-- native-install:end -->

<!-- prettier-ignore-end -->

Every installer checks SHA256 before it runs anything. Standalone binaries for each platform, `SHA256SUMS` and release notes are on the [latest release](https://github.com/Remote-Arc/remote-arc/releases/latest). Starting the Agent opens browser pairing; approve it with the same Remote Arc account, then choose the computer's permissions in the [Dashboard](https://agent.remotearc.app/devices).

If you tapped `yaohuangguan/remote-arc` before 0.7.1, re-tap once: `brew untap yaohuangguan/remote-arc`, then run the Homebrew commands above.

## Safety on your computer

New computers start read-only. Each computer's owner decides what the AI may do there, and the Agent checks every call again locally, whatever the cloud sent.

| Preset    | Adds                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Safe      | Read files, list folders and processes                                      |
| Developer | Write and edit files, with Local Undo for supported changes                 |
| Full      | Run commands and manage background processes, checked by Safety Guard first |

- **Trusted Write Locations** limit where writes may land; anything outside asks for approval.
- **Sensitive Path Policy** hides credential and profile folders such as `~/.ssh`, `~/.aws` and `.env` files by default.
- **Safety Guard** resolves what a terminal command would delete before it runs.
- **Local Undo** keeps a snapshot for supported file edits on the computer itself.

Presets are shortcuts: each tool can be switched on or off per computer. See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Repository layout

```text
apps/
  agent/              Native Go device Agent: pairing, outbound session, recovery, journals
  browser-extension/  Chrome Companion: shared tabs and allowed sites
  ui/                 Website and Dashboard front end (React)
  mcp/                MCP integration tests against the Agent
packages/
  execution-core/     Go module: files, processes, policy, Safety Guard and Local Undo
  cli/                remotelink: npm installer and launcher for the Agent
  protocol/           Wire types shared by the Agent, Dashboard and cloud service
  skills/             Generated Skill catalog
  docs/               Generated documentation and tool index
skills/               First-party Skill sources
Formula/              Homebrew formulas (this repository is the tap)
```

The Agent and Execution Core compile into one executable. The cloud service that handles sign-in, routing and billing is not in this repository.

More detail: [agent compatibility](./docs/agent-compatibility.md), [execution isolation](./docs/execution-isolation.en.md), [background recovery](./docs/background-recovery.md), [persistence validation](./docs/go-persistence-validation.md) and the [feature map](./docs/feature-map/README.md).

## Releases

Every `remotelink` release is built and published from this repository by the Publish remotelink workflow: the native binaries, `SHA256SUMS` and Homebrew formulas on [GitHub Releases](https://github.com/Remote-Arc/remote-arc/releases), and the [npm package](https://www.npmjs.com/package/remotelink). From 0.7.2, each npm version's provenance names the commit here that it was built from. Release notes are in [CHANGELOG.md](./CHANGELOG.md).

## Build and test

Requirements: Node.js 24+, pnpm 10.17 and Go 1.25 (toolchain 1.25.5).

```bash
git clone https://github.com/Remote-Arc/remote-arc.git
cd remote-arc
pnpm install --frozen-lockfile
pnpm run ci
```

| Need                         | Command                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Go tests                     | `go -C apps/agent test ./...` and `go -C packages/execution-core test ./...` |
| Build the Agent for every OS | `pnpm build:device`                                                          |
| Device integration tests     | `pnpm test:device`                                                           |
| Website tests                | `pnpm test:site`                                                             |
| Format and lint              | `pnpm format` and `pnpm check`                                               |

CI runs the Agent and MCP integration tests on Ubuntu, Windows and macOS.

This repository is published from Remote Arc's main repository. Issues are welcome; a pull request may be applied there rather than merged here.

## License

Remote Arc is **source-available, not open source** for current releases.

The current source is licensed under the
[Remote Arc Proprietary Source License](./LICENSE). Viewing and security review
are permitted, but modification, redistribution, white-labeling, and commercial
exploitation require written permission.

Historical revisions previously released under MIT remain governed by the MIT
terms that applied to those revisions.

Third-party components continue to use their own licenses.
