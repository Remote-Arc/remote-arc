# Remote Arc built-in Skill Packs

Remote Arc includes **9 original, curated Skill instructions** (`SKILL.md`) organized by profession-like capability. A Skill is a procedure, not an executable MCP tool or a user permission. Existing authorized Tools do the actual work. The same version-controlled catalog can be consumed by **Arc Connect via read-only MCP Resources**, by the hosted Agent API and future Arc Agent code.

## Built-in catalog

- P0: browser-operator (agent-browser + Microsoft Playwright MCP workflow)
- P0: autonomous-browser (browser-use planning, opt-in model budgets)
- P0: desktop-operator (PyAutoGUI/native accessibility, opt-in OS privileges)
- P0: video-creator (Remotion / HyperFrames / OpenFilm + FFmpeg; renders on the user's computer, no keys for text, graphics and own footage)
- P0: research-reports (existing read/browser/file operations)
- P0: scheduled-routines (existing automation/goal runtime)
- P1: image-studio (ComfyUI, optional GPU/model weights)
- P1: ui-inspector (OmniParser, optional vision weights)
- P1: transcribe-subtitles (whisper.cpp + FFmpeg, optional model weights)

**Packaged means the instructions are available, NOT that an external executable/model is installed on a user's device.** A successful Skill run requires (1) a deployed Connect or Arc integration, (2) authorized devices and existing tools, (3) verified required engine(s) and licenses on the selected device, and (4) validation of actual output. No third-party binaries or model weights are vendored in this PR, and no executable tools are registered merely by adding a Skill. For media tasks, the calling AI automatically prepares missing Remotion, OpenFilm, HyperFrames, FFmpeg/Chromium, map packages/data and base Whisper inside authorized device/workspace permissions, with source/size/destination disclosed. The packaged local helper performs setup and actual rendering/transcription; no system-level package install is needed. Qwen3-TTS (multi-GB), ACE-Step (10 GB+) and Whisper models beyond the small default require explicit download approval. No unattended paid API spend or GCP GPU service.

## One cloud catalog, all devices

The catalog is compiled into the Cloudflare Relay Worker only. Neither the device CLI, Windows/macOS application, nor local STDIO MCP receives a Skill copy. A user can switch Mac/Windows/Linux and get the same cloud-managed version through their existing Connect session. A future Arc Agent will read the same HTTPS API. Device runtimes perform approved tool actions; they have no standalone Skill installer, database or cache that can go stale.

## HTTP API (after a cloud release)

- `GET https://mcp.remotearc.app/api/skills` — authenticated, versioned JSON index.
- `GET https://mcp.remotearc.app/api/skills/<id>` — authenticated Skill definition.

Both accept existing account session or OAuth bearer identity. Read-only, no device connection required, no public directory indexing.

## Automatic Skill routing and restricted execution (after Relay deployment)

- `POST https://mcp.remotearc.app/api/skills/plan` (JSON: `{"objective":"..."}`) finds up to three matching cloud Skills in English or Chinese, returns their full versioned SKILL.md execution instructions, status, limitations and needed device/engine; does not execute anything or spend model tokens.
- `POST https://mcp.remotearc.app/api/skills/run` (JSON: `{"objective":"读取我分享的网页","device_id":"...","tab_id":123}`) dispatches a **read-only shared browser snapshot** through existing authorized Remote Arc Tool `browser_read_page`. It checks account scope, quota, MCP pause, selected device permissions and tool evidence. If anything is missing or the requested workflow includes video/image/desktop, it returns a blocked/needs-engine result without pretending success.
- These are **cloud API endpoints**, not additional MCP tools. Same-origin browser sessions and resource-bound OAuth are required. CORS or cross-site cookie automation is not silently enabled.
- No current code performs cloud video/image generation, controlled desktop motion, fully autonomous research or agent-driven multi-step browser interactions; follow-on executor adapters require secure environment, permissions, task-specific spending caps and verification. The result status `observed` means page retrieval was verified, not that the user's whole job was completed.

## MCP Resources (after Relay deployment)

- `remotearc://skills/catalog`: read-only JSON index.
- `remotearc://skills/<id>`: full original Markdown Skill.

An existing source-owned Agent Goal also receives up to two relevant cloud Skill instructions in its authenticated get_goal_context response; no new Tools or device installations are required. Some ChatGPT/Claude clients do not expose MCP Resources to models automatically. The HTTP endpoint is intended for first-party Arc and authenticated integrations; future clients may surface selected instructions as an onboarding context hint without creating execution tools. Device-level execution policy, approval, filesystem roots, quotas and audit events remain in force. The resources are descriptive and not a privilege or execution interface.

## Packaging, versioning and trust

- Source of truth: `skills/registry.json` and each `skills/<id>/SKILL.md`.
- Generated runtime data: `packages/skills/src/catalog.generated.ts`. Generate via `node scripts/generate-builtin-skills.mjs`; CI checks with `--check`. Both the hosted MCP and hosted API consume it.
- Originating projects are listed per manifest, but **their source code and licenses are not copied**; their names point to separately installable engines. Review license/model weight terms before distributing native binaries or enabling any hosted operation.
- Never silently install arbitrary Skill scripts from GitHub. Future third-party packs need allowlists/signature/lockfile, privilege display, sandboxing and rollback. A Skill cannot expand connected Tools or cross device/organization boundaries.
- This change does not create a subscription, change the current 28 MCP tools, or enable paid image/video/model APIs. The current read-only adapter may consume an ordinary Remote Arc tool-call quota unit.

## Local media execution

The video/subtitle packages expose the same SHA-256-versioned scripts/local-media.mjs through Arc prepare_skill/read_skill_resource, Connect read_skill with path/offset, and read-only MCP Resources. The cloud stores instructions/helper bytes; downloads, preparation, rendering and inference run on the user's device. The read-only /api/skills/run adapter remains a browser observation adapter and never claims that it rendered a video.

- Automatically prepare only the needed ordinary components: Remotion 4.0.538 / React / Three.js, OpenFilm 0.2.5, HyperFrames 0.8.193, portable FFmpeg/ffprobe, Chromium, d3/Natural Earth maps, whisper.cpp v1.9.2 and the multilingual base model.
- Ask before installing Qwen TTS or ACE-Step, disclosing multi-GB / 10 GB+ downloads, disk use, destination and hardware expectations. The ordinary bootstrap rejects these requests before any download. After approval, the AI follows the separately documented local isolated-environment recipes; these large-model paths are not claimed as hardware-tested.
- Reuse task-local caches and npm lockfiles. Verify published binary/model hashes. No global installs, administrator elevation, cloud inference or media uploads are part of setup.
- Render/transcribe/map actions create actual outputs and artifact receipts. Metadata and decoder/timing checks support completion evidence; visual and language quality still require inspection.
- Disk shortage, unsupported hardware, missing OS compiler tools and download failures are truthful blockers. Existing outputs are preserved.

Run node --test scripts/local-media-test.mjs and the relay local-media-resources-test.ts for executable consent, path, integrity, cache, resource delivery and preparation checks. Real-device acceptance results must identify the OS and engine actually exercised.

## Core video and skill-library additions

Remotion is a core P0 local video workflow, alongside dedicated HyperFrames and OpenFilm workflows and Map Creator. The dashboard and preview use the same unified library as built-in and pinned package discovery. Requested Vibe Knowledge Film, A Stock Data and Nuwa plus fifteen ready-made Nuwa perspectives have pinned source and license manifests. Their presence does not imply installed runtimes or completed user work.

## Mathematical animation and Blender MCP

Manim renders precise explanatory scenes in a task-local Python environment. Blender MCP uses a real stdio MCP handshake and a loopback addon in a fresh Blender GUI instance, with task-local configuration, disabled telemetry and upstream code safe mode. Its local bridge exposes only scene reads and Blender code; paid asset services and global AI-client configuration are outside this workflow. A GUI/display is required for the addon, while saved .blend files can render in a separate background process. Both workflows preserve editable sources and verify actual artifacts.
