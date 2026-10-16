# Remote Arc built-in Skill Packs

Remote Arc includes **9 original, curated Skill instructions** (`SKILL.md`) organized by profession-like capability. A Skill is a procedure, not an executable MCP tool or a user permission. Existing authorized Tools do the actual work. The same version-controlled catalog can be consumed by **Arc Connect via read-only MCP Resources**, by the hosted Agent API and future Arc Agent code.

## Built-in catalog

- P0: browser-operator (agent-browser + Microsoft Playwright MCP workflow)
- P0: autonomous-browser (browser-use planning, opt-in model budgets)
- P0: desktop-operator (PyAutoGUI/native accessibility, opt-in OS privileges)
- P0: video-creator (Remotion Skills + FFmpeg, license-aware)
- P0: research-reports (existing read/browser/file operations)
- P0: scheduled-routines (existing automation/goal runtime)
- P1: image-studio (ComfyUI, optional GPU/model weights)
- P1: ui-inspector (OmniParser, optional vision weights)
- P1: transcribe-subtitles (whisper.cpp + FFmpeg, optional model weights)

**Packaged means the instructions are available, NOT that an external executable/model is installed on a user's device.** A successful Skill run requires (1) a deployed Connect or Arc integration, (2) authorized devices and existing tools, (3) verified required engine(s) and licenses on the selected device, and (4) validation of actual output. No third-party binaries or model weights are vendored in this PR. No tools are registered or silently installed. No automatic API spend.

## One cloud catalog, all devices

The catalog is compiled into the Cloudflare Relay Worker only. Neither the device CLI, Windows/macOS application, nor local STDIO MCP receives a Skill copy. A user can switch Mac/Windows/Linux and get the same cloud-managed version through their existing Connect session. A future Arc Agent will read the same HTTPS API. Device runtimes perform approved tool actions; they have no standalone Skill installer, database or cache that can go stale.

## HTTP API (after a cloud release)

- `GET https://mcp.remotearc.app/api/skills` — authenticated, versioned JSON index.
- `GET https://mcp.remotearc.app/api/skills/<id>` — authenticated Skill definition.

Both accept existing account session or OAuth bearer identity. Read-only, no device connection required, no public directory indexing.

## MCP Resources (after Relay deployment)

- `remotearc://skills/catalog`: read-only JSON index.
- `remotearc://skills/<id>`: full original Markdown Skill.

Some ChatGPT/Claude clients do not expose MCP Resources to models automatically. The HTTP endpoint is intended for first-party Arc and authenticated integrations; future clients may surface selected instructions as an onboarding context hint without creating execution tools. Device-level execution policy, approval, filesystem roots, quotas and audit events remain in force. The resources are descriptive and not a privilege or execution interface.

## Packaging, versioning and trust

- Source of truth: `skills/registry.json` and each `skills/<id>/SKILL.md`.
- Generated runtime data: `packages/skills/src/catalog.generated.ts`. Generate via `node scripts/generate-builtin-skills.mjs`; CI checks with `--check`. Both the hosted MCP and hosted API consume it.
- Originating projects are listed per manifest, but **their source code and licenses are not copied**; their names point to separately installable engines. Review license/model weight terms before distributing native binaries or enabling any hosted operation.
- Never silently install arbitrary Skill scripts from GitHub. Future third-party packs need allowlists/signature/lockfile, privilege display, sandboxing and rollback. A Skill cannot expand connected Tools or cross device/organization boundaries.
- This change does not create a subscription, change the current 28 MCP tools, or enable paid image/video/model APIs.
