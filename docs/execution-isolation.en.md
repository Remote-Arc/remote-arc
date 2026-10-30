# Execution isolation: current state and next decisions

Status: design proposal. No isolated executor or Dashboard sandbox switch exists yet.
Updated 2026-10-30.

## Decision

Keep local execution as the default, and do not call the existing path checks a sandbox. Build optional isolated execution as a separate feature, starting with running untrusted repositories, installing dependencies and unattended high-privilege commands. It is not a prerequisite for durable long-running tasks.

Remote Arc's main value is access to the computers, repositories, dependencies and toolchains a user already has. Forcing all work into an isolated environment would change paths, runtimes, credentials, development-server ports and hardware access. Local execution is useful for trusted projects of your own. Work on untrusted code, or work that needs stricter limits on side effects, needs a separate OS execution boundary.

## What a sandbox is

A sandbox is enforced at the point of execution by the OS or an independent virtual environment. It limits visible and writable folders, processes and devices, user identity, credentials, outbound network access and resource use. Absolute paths, symbolic links, child processes and network requests inside a command cannot bypass that boundary. Asking a model to "only change the project", checking the working directory, or matching dangerous command strings is not this kind of isolation.

An AI host's own sandbox does not automatically cover remote MCP actions. When a host calls `start_process` on a target computer through Remote Arc, the real OS operation happens on that computer, not inside the host's sandbox.

## Current protections

| Boundary | What it guarantees | What it does not guarantee |
| --- | --- | --- |
| OAuth, ownership and revocation | An authorized client reaches only its own account and unrevoked devices | Isolation of the OS user once execution is allowed |
| Allowed tools and `--safe` | Control over read, edit and terminal tools | Isolation of arbitrary commands once the terminal is allowed |
| Trusted Write Locations and Approval Broker | Ordinary non-sensitive files can be read. Supported persistent writes stay in trusted locations, out-of-scope writes ask for narrow approval first, and terminal calls need an in-scope working directory | A shell can still reference outside paths, credentials, child processes or the network, so this is not an OS sandbox |
| Sensitive Path Policy | File tools protect sensitive locations, with narrow exceptions | Interception of file access inside a shell |
| Safety Guard | Resolves where terminal deletes would land and refuses catastrophic commands, as defense in depth | Analysis of arbitrary scripts, or a complete command sandbox |
| Task contract and policy snapshot | Freezes the goal, tools and limits. A policy change stops the old task | Every OS side effect, or rollback |
| Local Undo | Conflict-safe recovery of edits made by supported file tools | Rollback of shell commands, databases, deployments or publishing |

Go process execution uses `os/exec` to start a local shell, which inherits the local user's permissions. There is no namespace, container, VM or AppContainer execution path today.

## How to use it today

- Keep the terminal off on devices that only need reading and file editing. Ordinary non-sensitive reads can stay flexible. Use Trusted Write Locations for long-term changes and the Approval Broker for occasional out-of-scope writes. Sensitive paths stay separately protected.
- If you need commands but want less to be reachable, use a dedicated restricted OS user with minimal credentials. A restricted user is an OS permission boundary, not a general command sandbox.
- To run untrusted code in isolation, pair an isolated VM, machine or environment that you manage, and configure its file, credential and network boundaries correctly. Do not expose the whole host file system or privileged control interfaces to it.

Containers are not an automatic safety switch. Docker's own documentation explains that daemon control, permission settings and mounts affect isolation, and that writable bind mounts can change host content. See [Docker Engine security](https://docs.docker.com/engine/security/) and [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/).

## Possible future form

Configure the execution environment under Dashboard → Devices, rather than adding a switch with no executor behind it:

| Setting | What it means | Status |
| --- | --- | --- |
| Local execution | Uses this computer's tools and OS user permissions | Implemented |
| Isolated execution | Uses a verified isolated environment that exposes only explicit folders and capabilities | Future proposal |

A device would report its executor type, version, actual isolation boundaries and limits. Isolation could be selected only when that detection succeeds. A task contract would freeze the execution setting, mapped folders, network and credential grants, and resource limits. It could not silently fall back to local execution. If the isolated executor is unavailable, changes or is lost in a restart, the task stops or waits and records why.

File tools and the terminal in a future isolated executor must see the same isolated mapping, so the Agent never reads a local file while changing another copy in a container. `process_id`, logs, stop, verification and recovery must all belong to the selected executor. Output sync needs an explicit confirmation policy, and automatic copying of sensitive host files must not be offered as a convenience.

A first phase could adapt user-provided Linux containers or isolated devices, verifying folders, a non-privileged user, no host control socket, an explicit network policy, resource limits and process-tree cleanup. Windows and macOS need their own verification of the executor and runtime compatibility. There is no promise of one command working on every OS. Containers and VMs differ in strength, so documentation must describe the actual boundary rather than claim absolute safety.

## Verification before release

1. Adversarial tests for reads and writes outside the folder, symbolic-link escapes, host credentials, child processes and network bypass.
2. Real workflows: restricted file editing, test runs, reading output, stopping processes and development servers.
3. Recovery after pause, cancel, expiry, device reconnect and executor restart, with no repeat of unknown side effects.
4. A changed execution setting invalidates old contracts, and an isolation failure never falls back to local execution.
5. Actual permission and compatibility checks on each supported OS, not only mock tests.

This should be its own feature. This document explains the current state and direction only: the UI does not present isolation as available, and device execution behaviour is unchanged.
