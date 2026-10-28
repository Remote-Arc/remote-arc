# ReArc Studio

ReArc Studio is Remote Arc's bilingual, versioned video workspace. It shares the
Remote Arc blue symbol, Space Grotesk wordmark styling, Inter interface type,
workspace light/dark tokens, language preferences, login and metered model gateway.

## Product workflow

Create a blank project, start from a product/explainer/data template, or ask Arc
Auto to generate a storyboard from a brief. Edit and reorder scenes, preview the
result, add private images/video/voice/music, save versions and export MP4. The
workspace and templates support English and Simplified Chinese. Changing language
or theme preserves current edits; existing video content is not translated.

The editor supports six composable scene types, frame-driven entrances, typography,
visual media, narration text and captions. Narration audio comes from an uploaded
recording. Captions are distributed by scene duration rather than word alignment.
Imported video plays muted; a voice track starts at the beginning and background
music loops with an entrance and ending fade. Music is ducked under the uploaded
voice track. A summed mix above full scale is reduced to leave encoding headroom.

## Video quality boundary

The first release targets typography-led product stories, explainers and data
narratives. It does not claim cinematic neural footage generation or synthesized
speech. Quality must be reviewed from an actual exported film, not an editor
screenshot or a successful codec test alone.

Six scene compositions use responsive layouts, balanced headlines, word-aware
English/CJK wrapping, staggered frame-driven entrances, private media cards and
subtitle safe areas. Preview and 720p/1080p share the same logical layout.
Product screenshots use contain fitting so text is not cropped. A media scene
without on-screen copy becomes a full-width product showcase.

The export panel measures the actual loaded fonts. Text overflow, missing or
wrong-type asset references, very low headline contrast and caption overflow
block MP4 export, including direct encoder calls. Reading speed, very brief
captions, missing voice recordings and silent tracks are advisory. Each scene
issue links back to its editor. These checks do not certify creative quality or
force alignment between an uploaded recording and duration-based captions.

Outputs are H.264 MP4 at 30 fps, with AAC when audio is present. Quality choices:

| Format    | 1080p     | 720p     |
| --------- | --------- | -------- |
| Landscape | 1920×1080 | 1280×720 |
| Portrait  | 1080×1920 | 720×1280 |
| Square    | 1080×1080 | 720×720  |

Export runs in the browser through Mediabunny/WebCodecs and uses the same frame
function as preview. Chrome or Edge with H.264/AAC encoding is recommended. An
unsupported codec produces an explicit error. Keep the page open during export.
The MP4 itself is downloaded, rather than only returning a render job or manifest.

## Run locally

Requires Node 24+ and pnpm 10.17.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:studio
```

Open `http://127.0.0.1:4331/studio`. Use `?lang=zh` or the language control for
Chinese. Both servers bind only to loopback. The development adapter uses a real
SQLite database, the real SQL migrations, encrypted document storage and private
local media files. Its local identity and disabled AI configuration are development
facilities; the production Worker never imports this adapter.

Development data defaults to `work/studio-local`. `STUDIO_DATA_DIR`,
`STUDIO_UI_PORT` and `STUDIO_API_PORT` can select another task-owned directory and
ports. The local vault key stays with that data directory and is not committed.

Local generation is explicitly disabled. Hosted generation uses the existing Arc
model configuration and account entitlement, rather than asking visitors for API
keys or inventing an AI result. Auto is the default; existing configured models
remain selectable. Generation errors retain the original project.

## Architecture

- `packages/protocol/src/studio.ts`: dependency-free document validation, stable
  scene IDs, timing, formats and shared types. Its dedicated protocol subpath keeps
  native Node type-stripping consumers of the main protocol compatible.
- `apps/ui/src/studio`: project gallery, editor, bilingual strings, templates,
  playback, deterministic frame renderer, portable archives and MP4/SRT export.
  Media encoding and ZIP code load on demand.
- `apps/relay/src/studio.ts`: authenticated same-origin API, project ownership,
  encrypted snapshots, optimistic revisions, private media, skills and AI jobs.
- `apps/relay/src/studio-runtime.ts`: persisted Durable Object wakeups. A unique
  database claim owns model dispatch. A minute sweep recovers lost queue wakeups.
  Interrupted or unknown paid outcomes are not dispatched again automatically.
- Migration `0067_studio.sql`: projects, immutable versions, private asset metadata
  and idempotent jobs. Model authorization uses an account-owned Arc session and
  the existing allowance, reservation and settlement ledger.

The model returns validated scene data. Skills provide creative guidance, with
their content hashes recorded per job. Skills grant no filesystem or command
permissions. The current render path executes vetted scene components.

Saving is a compare-and-swap transaction: update the expected revision and append
its immutable snapshot together. AI commits also require the job to remain active.
A selected-scene request cannot change adjacent scenes. Version restoration saves
current edits first and creates another revision.

## Private files and portable projects

Studio uses the separate `remote-arc-studio-private` R2 bucket through the
`STUDIO_MEDIA` binding. Files are served only through authenticated, owner-checked
API requests with private/no-store headers. The public demo bucket is not used for
user projects. Document contents, brief, asset names and version labels use the
existing AES-GCM account vault.

A `.arcvideo` backup is a ZIP containing a validated manifest and all referenced
original media bytes. Import validates paths and unpacked size, creates a project,
uploads private files and remaps asset IDs. A failed import attempts to remove its
newly created project. A plain JSON document without asset references can also be
imported.

Current bounded limits: 100 active projects, 12 scenes and 180 seconds per project,
1–30 seconds per scene, 25 MB per file, 100 assets per project and 250 MB per
account. The newest 100 versions are retained. Deleting a project removes its
versions, jobs and uploaded media; deletion can be retried after a storage failure.

## Verification

```sh
pnpm typecheck
pnpm test:studio
pnpm test:studio:browser
pnpm build:ui
pnpm --filter @remotearc/relay exec wrangler deploy --dry-run
```

API tests execute real migrations and SQLite transactions. AI tests execute real
entitlement, reservation and settlement SQL with a deterministic provider adapter;
they spend no paid API credits. They cover scoped edits, skill hashes, idempotency,
cancellation, unknown non-replay, stale revisions and invalid output.

Browser acceptance uses real local API/storage, downloads an MP4, checks streams
with ffprobe and fully decodes it with FFmpeg. It also restores a portable backup,
exports portrait/square videos from an uploaded clip, switches both languages and
themes, and verifies that an unsaved draft survives language switching. Windows CI
retains the video, project backup, screenshots and verification receipt. FFmpeg
must be on PATH for this acceptance command.

## Production promotion

Studio uses the existing Remote Arc release workflow. Review and merge the feature,
wait for exact-master CI, then explicitly dispatch **Production Release - D1 +
Relay + Website**. It verifies the D1 backup, applies migrations, verifies the Apps
vault, provisions the private R2 bucket and deploys the Worker/website together.
The existing deploy policy and exact-SHA/stale-master guards are preserved.

The deployment credential needs R2 Storage Edit in the existing Cloudflare account
to create/verify the private bucket. Provisioning fails closed on denied access and
verifies that both r2.dev and custom-domain public access are disabled. It never
changes public-access settings. The configured custom domain is
`studio.remotearc.app`; `/studio` on the existing Agent host also opens the editor.

The public UI-only PR preview does not provide Studio's authenticated persistence
or hosted AI backend. Use the local acceptance environment to review those flows.
Live provider access and a production authenticated session are verified after
promotion, not inferred from fixtures or a successful build.
