<div align="center">

<img src="./assets/plugin-logo.svg" alt="Remote Arc" width="92" />

# Remote Arc

**Controlled access to your computers for the AI you already use.**

This repository holds the parts of Remote Arc that run on your computer and in your browser: the native device Agent, its Execution Core, the `remotelink` installer, the Chrome Companion, the website and Dashboard front end, the first-party Skills, and the plugin manifests for AI clients.

[Website](https://remotearc.app) · [Connect your AI](https://remotearc.app/connect-ai) · [Downloads](https://remotearc.app/downloads) · [User guide](https://remotearc.app/docs/start-here) · [Security](./SECURITY.md)

<sub>Source available for transparency and security review under a [proprietary license](./LICENSE). Not open-source licensed.</sub>

[![CI](https://github.com/Remote-Arc/remote-arc/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Remote-Arc/remote-arc/actions/workflows/ci.yml) [![Listed on MCP Market](https://mcpmarket.com/badge/server/remote-arc.svg?theme=dark)](https://mcpmarket.com/server/remote-arc?utm_source=readme&utm_medium=badge)

</div>

## What Remote Arc does

Remote Arc lets ChatGPT, Claude, Codex, Cursor and other MCP clients work on Windows, macOS and Linux computers you pair, under permissions you set per computer. Each computer connects outward to Remote Arc, so it needs no open inbound port or VPN.

- **Connect** brings your paired computers, shared browser tabs and authorized cloud Apps to the AI client you already use, through one MCP endpoint: `https://mcp.remotearc.app/mcp`.
- **Arc** is the hosted agent at [agent.remotearc.app](https://agent.remotearc.app), with the same Apps and computers.

Plans and current allowances are on the [pricing page](https://remotearc.app/pricing).

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

Install the Agent only on computers the AI should work on. On macOS or Linux (including WSL), without Node.js:

```sh
curl -fsSL https://remotearc.app/install.sh | sh
```

With Homebrew:

```bash
brew tap remote-arc/remote-arc https://github.com/Remote-Arc/remote-arc
brew install remote-arc/remote-arc/remotelink
remotelink
```

With npm (Node.js 20+), which also upgrades an existing install:

```bash
npx remotelink@latest
```

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
