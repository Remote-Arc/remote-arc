# Remote Arc

`remotelink` pairs your Windows, macOS or Linux computer with Remote Arc, so the AI you already use (ChatGPT, Claude, Codex, Cursor or any MCP client) can work on it: read and edit files, run commands, use a browser, see the screen and use the mouse and keyboard, with your permission.

[Website](https://remotearc.app) · [User guide](https://remotearc.app/docs/start-here) · [Downloads](https://remotearc.app/downloads) · [GitHub](https://github.com/Remote-Arc/remote-arc)

The source of this package and of the native Agent it installs is public at
[Remote-Arc/remote-arc](https://github.com/Remote-Arc/remote-arc). Every release
is built there, and its npm provenance names the commit it was built from.

<!-- prettier-ignore-start -->

<!-- github-overview:start -->
**Agent infrastructure for real work across your apps and computers.**

Arc is your hosted AI agent. Connect brings the same authorized Apps and device execution to the AI client you already use. Remote Arc manages the context, permissions, persistent work, device placement and usage around model decisions so work can proceed from a request to an inspectable result.

## Two ways to work

| Product     | Start here                                                           | What it does                                                                                                                        |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Arc**     | [Hosted workspace](https://agent.remotearc.app/dashboard/agent/chat) | Chat with a personal agent, use connected Apps/computers, reuse Skills, and create one-off Tasks or recurring routines.             |
| **Connect** | [Connect your AI](https://remotearc.app/connect-ai)                  | Use authorized cloud accounts, paired devices and your browser from compatible ChatGPT, Claude, Codex, Cursor or other MCP clients. |

Arc keeps a delegated responsibility together: its sources, instructions, conversation and run history, with fresh bounded judgment when scheduled and checks against actual results. Start with a daily work brief, project check-in, delivery verification or change follow-up. The [use-case catalog](https://remotearc.app/use-cases) also keeps Arc and Connect paths for all 15 concrete workflows.

**Free** has monthly Connect call and data-transfer allowances and up to 2 computers. **Pro** and **Max** add computer use, more computers, Arc-hosted AI and monthly Arc Credits, and either can be tried for 7 days. Existing subscriptions keep their purchased terms until changed. Users never supply a model API key. Current prices and allowances are on the [pricing page](https://remotearc.app/pricing); third-party App charges are separate. Preview environments use simulated data.
<!-- github-overview:end -->

<!-- prettier-ignore-end -->

## Quick start

```bash
npx remotelink@latest
```

The first run:

1. opens the Remote Arc pairing page in your browser;
2. asks you to sign in and approve this computer;
3. stores this computer's own credential in `~/.remotearc/config.json`;
4. connects, and turns on the background connection by default, so the computer
   stays online after you close the terminal. Turn it off in Dashboard → Devices
   or with `--no-background`; that choice is kept. `--foreground` never turns it on.

No public IP, VPN, port forwarding or copied token is needed: the computer
connects out to Remote Arc. Then [connect your AI client](#connect-your-ai-client).

To install the command instead of using `npx`:

```bash
npm install -g remotelink@latest
remotelink
```

This needs Node.js 20 or later. The launcher downloads the native Agent for your
platform and checks it against the SHA-256 manifest pinned to this npm release
before running it. To install without Node.js (the curl installer, Homebrew or a
download), see [Downloads](https://remotearc.app/downloads).

<!-- prettier-ignore-start -->

<!-- latest-release:start -->
## Latest release

**remotelink 0.8.1 — Agent**

Published 2026-11-25

- On a Mac, the Agent's background service runs as Remote Arc.app, signed with Remote Arc's Developer ID and notarized by Apple. System Settings (Screen Recording, Accessibility, Login Items) shows it as Remote Arc with its icon instead of `remotelink`, and permissions given to one release carry over to the next.
- Agents installed with Homebrew, npm or the curl installer fetch the signed Remote Arc.app of their own version on a Mac and run their background service and updates from it. The app is used only when its archive matches the checksum published on GitHub, its signature is Remote Arc's and it reports the same version; otherwise the Agent runs as before.
- The Agent records why it stopped (the operating system, a Dashboard stop, pause or update, a local stop, or another process taking over), so a computer that went offline can be explained without the system log.
- Remote Arc for Mac: the desktop app, now for macOS, signed and notarized. `Remote-Arc-macos-universal.dmg` is attached to this release and runs on Apple silicon and Intel Macs. The Agent inside it is the signed Remote Arc.app.
- Agent Orchestration (Beta): choose the model and reasoning effort for Claude Code, Codex and Gemini CLI. Before an agent starts, each computer and folder is checked (Git repository and branch, agent installed, version, signed in), with what to fix.
- The desktop and mobile apps report their version when they sign in, and Admin shows them beside each person's Agent version.

See the [full Remote Arc release history](https://remotearc.app/releases) or the [GitHub changelog](https://github.com/Remote-Arc/remote-arc/blob/master/CHANGELOG.md).
<!-- latest-release:end -->

<!-- prettier-ignore-end -->

## Connect your AI client

Add Remote Arc as a connector or MCP server in your AI client:

```text
https://mcp.remotearc.app/mcp
```

Sign-in uses OAuth, and you choose which computers and tools it may use in the
[Dashboard](https://agent.remotearc.app). AI clients remember a connector's tool
list: after a Remote Arc update adds tools, refresh or reconnect the connector.

## What your AI can do on this computer

Each computer starts **read-only**: list folders, read files and see running
processes. You turn on more per computer in Dashboard → Devices:

| Access              | What it adds                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Safe**            | Reading only.                                                                                                                                                         |
| **Developer**       | Writing and editing files in your trusted folders, with Local Undo.                                                                                                   |
| **Full**            | Terminal commands, including background commands such as builds and dev servers.                                                                                      |
| **Browser Runner**  | Task browser windows (Chrome, Edge or Chromium) kept out of your way, with saved sign-ins filled only from this computer's protected vault. CAPTCHAs are left to you. |
| **Computer use**    | Screenshots, mouse and keyboard on Windows, macOS and Linux (X11). Pro and Max.                                                                                       |
| **Coding sessions** | Claude Code, Codex and Gemini CLI conversations run from Agent Orchestration in the Dashboard.                                                                        |

The Dashboard keeps these settings, and the Agent enforces them again before
each call. `--safe` adds a local read-only cap that the Dashboard cannot lift.

### Computer use

With the computer's **Computer use** switch on, your AI can see the screen and
use the mouse and keyboard:

- **You always win.** Moving the mouse or typing stops the AI's action, and
  new actions are refused while you are using the computer. A locked screen or
  a running screen saver is refused.
- An **"AI is using this computer"** notice stays on screen while it works. It
  is left out of the AI's screenshots.
- **Password managers and system sign-in prompts** (Keychain Access,
  Passwords, 1Password, the Windows credential prompt and others) are masked in
  screenshots and never receive input.
- **macOS:** turn on Screen Recording and Accessibility for the Agent in System
  Settings → Privacy & Security. The first call asks macOS to list it there.
  Text is pasted and your clipboard put back, so Chinese, emoji and line breaks
  type correctly with any input method.
- **Linux:** needs an X11 (Xorg) session; Wayland is refused.
- Routines and Arc runs cannot use computer use, because nobody is there to take
  over.

## Your files stay protected

- **Trusted folders.** Writes and edits stay inside the folders you trust for
  this computer. A write anywhere else asks you first: allow once, allow the
  same file for a while, trust its folder, or deny, in the Dashboard or this
  terminal.
- **Sensitive paths.** Credential folders and `.env` files are hidden from file
  tools by default. You can add exceptions, or turn this off after a warning.
- **Local Undo.** Before a supported write or edit, the previous version is kept
  in `~/.remotearc/undo` on this computer, never uploaded. You can undo from the
  Dashboard for 7 days (up to 200 MB in all; files over 20 MB are not kept).
  Undo cannot reverse side effects elsewhere, such as a deploy or an email.
- **Safety Guard.** Before a command runs, the Agent works out where each
  delete would land and refuses drive roots, your home and personal folders,
  system and credential folders and the Undo store, as well as disk formatting,
  fork bombs and shutdown. It is a guard, not a sandbox: terminal commands can
  reach anything your user account can.

## Commands

```text
remotelink                  Pair or reconnect, and keep this terminal showing activity
remotelink --safe           Add a local read-only cap
remotelink --foreground     Stay in this terminal; do not install background recovery
remotelink --background     Turn on background recovery and stay attached
remotelink --no-background  Turn off background recovery; keep the current Agent
remotelink --status         Show the running Agent and background recovery
remotelink --stop           Turn off recovery and stop the Agent
remotelink --logs           Print the last 100 operations
remotelink --reset          Stop the Agent and remove this computer's pairing
remotelink --force-update   Replace the running Agent even if it is busy or not older
remotelink vault --help     Save sign-ins for Browser Runner
remotelink --version        Show the version
remotelink --help           Show every option
```

The package also installs the commands `remote-link` and `remote-arc`.

### Updating

From Agent 0.7.1 on, update from Dashboard → Devices with **Update now**; it
waits until no work is running. Or run `npx remotelink@latest`: an older, idle
Agent is replaced and keeps its pairing, permissions and pause state. If it is
busy, the terminal asks first; `--force-update` replaces it anyway.

### Background connection

The background connection is a user service on macOS (launchd) and Linux (systemd),
and a hidden login supervisor on Windows. It starts the Agent again after it
ends or the computer restarts. On Linux it keeps running after you log out
only while systemd linger is on; the Agent turns linger on when it may, and
otherwise tells you to run `sudo loginctl enable-linger <user>`. A sleeping or
switched-off computer is offline.

## Security

- Each computer has its own credential, which you can revoke in the Dashboard.
  Raw device credentials are not stored in Remote Arc's database.
- The computer connects out to Remote Arc; nothing listens for incoming
  connections.
- AI clients sign in with OAuth 2.1 and PKCE. Each one is listed separately and
  can be revoked without touching your computers or other clients.
- File policies are checked again on this computer immediately before each
  operation, on the real path.

Remote access can change files and run commands. Turn on only what you want
your AI to use, and use Full terminal access only on computers you control.

## Product and package name

**Remote Arc** is the product. `remotelink` is this npm package and its command.
The Agent is Remote Arc's own native program, with its own execution core for
files, processes, Undo and the Safety Guard; MCP is only how AI clients reach it.

## Support

- Website: https://remotearc.app
- Support: https://remotearc.app/support
- GitHub: https://github.com/Remote-Arc/remote-arc

## License

**Remote Arc Proprietary Source License — commercial exploitation requires
written permission from Remote Arc.**

You may use the official software under its applicable terms. Selling,
redistributing, sublicensing, white-labeling, modifying it, or offering a
competing service requires written authorization. The full terms are in the
[LICENSE](https://github.com/Remote-Arc/remote-arc/blob/master/LICENSE),
which is included in this npm package and synchronized with the GitHub repository.

Historical revisions previously released under MIT retain the MIT terms that
applied to those revisions. Third-party components retain their own licenses.
