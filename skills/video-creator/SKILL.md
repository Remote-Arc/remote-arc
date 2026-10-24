---
name: video-creator
description: Make finished videos (promos, explainers, launch clips, social cuts) on the user's own computer with OpenFilm, no API keys needed.
priority: P0
category: media
status: builtin-guidance
---

# Video Creator

**Engine:** OpenFilm 0.2.5 (MIT, `npx -y openfilm@0.2.5`) + FFmpeg. **Source:** https://github.com/openfilm/openfilm

You write the film; the user's computer renders it. Text, graphics, animation, charts, screenshots and the user's own footage need **no API key and no extra cost**: your own model usage (the user's AI plan, or Arc Credits) is the only cost. Only *generated* voice-over, music, images and AI video need a service the user connects with their own key.

## Preflight (once per computer)

Use a computer whose tools include `start_process`, `write_file` and `read_file`, inside one of its Trusted Write Locations.
- Windows (cmd.exe): `node -v & ffmpeg -version | findstr /b "ffmpeg version" & git --version`
- macOS / Linux: `node -v; ffmpeg -version | head -1; git --version`
Need Node 22.2+, ffmpeg and git. If one is missing, tell the user exactly what to install (nodejs.org, ffmpeg.org) and stop; never install system software silently. The first OpenFilm run downloads a headless Chromium (~115 MB) once: tell the user it can take a minute.

**Every OpenFilm command must run unattended:** set `OPENFILM_NO_BROWSER=1` and `OPENFILM_NO_UPDATE_CHECK=1`. Without them a non-interactive run opens Studio in the user's browser after 15 s.
- Windows: `set OPENFILM_NO_BROWSER=1& set OPENFILM_NO_UPDATE_CHECK=1& npx -y openfilm@0.2.5 <command>`
- macOS / Linux: `OPENFILM_NO_BROWSER=1 OPENFILM_NO_UPDATE_CHECK=1 npx -y openfilm@0.2.5 <command>`
Run `npx -y openfilm@0.2.5` once (no command) and read its printed manual whole: it is the format reference.

## What makes it look good

OpenFilm composes and renders; it does not invent footage. A film of only text and shapes looks like animated slides. Quality comes from **real material**, so gather it before writing pages:
- the user's own footage, photos, logo and screen recordings (ask for them, or find them in the folders they point to);
- product screenshots or recordings of the user's own site or app, made with the tools you already have;
- charts and diagrams drawn in code from real data.
Then direct it like an editor: camera moves on stills (slow push-in/pan), cuts on the beat, big type on few words, depth with layered tracks, consistent palette. Generated images, AI video and AI voice look most "cinematic" but need the user's keys and cost money (see below): offer them, never assume them. Say plainly what is achievable with the material available.

## Workflow

1. **Brief.** Settle length (default 30 s), frame (1920×1080 landscape; 1080×1920 for Reels/Shorts/TikTok), language, message, brand colours and any assets the user owns. Ask only what you cannot infer.
2. **Project.** Make a new folder named after the film inside a Trusted Write Location (e.g. `<root>\films\launch-30s`). Never write into the user's existing projects.
3. **Pages.** One shot per page (`title.html`, `steps.html`, …), plus a background page for the whole length. Each page sets `window.film = { duration, frame(t) }` and **draws only from t**: no timers, `requestAnimationFrame`, CSS transitions, `Math.random()` or `Date`. Shared colours/helpers go in one `shared.js` the pages import. Keep text inside its box (long strings overflow cards).
4. **film.html.** `<meta name="viewport" content="width=1920, height=1080">`; one `<section>` per track, top track first (titles over footage, background last); each clip has `at` (start second); pictures and pages without a `duration` need `#t=0,length`; sound is only `<audio>` clips in film.html, never in pages.
5. **Sound without keys.** Generate a bed with ffmpeg into `assets/`, normalised so it is audible, e.g. a soft A-major pad:
   `ffmpeg -y -f lavfi -i "sine=f=220:d=30" -f lavfi -i "sine=f=277.18:d=30" -f lavfi -i "sine=f=329.63:d=30" -f lavfi -i "sine=f=110:d=30" -filter_complex "[0][1][2][3]amix=inputs=4:normalize=1,tremolo=f=0.5:d=0.35,loudnorm=I=-18:TP=-2,afade=t=in:d=2,afade=t=out:st=27:d=3" -ar 48000 assets/bed.wav`
   Use the user's own music only if they provide it.
6. **Check with `look`** (run in the film folder, `background:true`, then wait on the process). It must report "same t, same picture"; fix every warning (too-quiet sound, nondeterministic page). Read the contact sheet PNG it prints (`.film/cache/look/0-30s.png`) and fix overflow, collisions and empty frames before rendering.
7. **Render** with `render` (`background:true`; add `--4k` or `--fps 60` only when asked). A 30 s 1080p film rendered in ~25 s on a desktop with 4 parallel browsers; expect longer on laptops. Wait for the process to exit; do not sleep-and-poll in short loops.
8. **Verify** the actual file: `ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,nb_frames -of json <film>.mp4`. Duration, size and frame count must match the brief; check loudness with `ffmpeg -i <film>.mp4 -af volumedetect -vn -f null -` (mean around -20 dB, not below -35).
9. **Deliver the video itself.** The MP4 is `<folder>/<folder name>.mp4` beside film.html. Give the user its exact path; if they are away from that computer, use `create_file_resource` for a short-lived download link, or upload it where they asked (video uploads require a compatible Runner release; published Agent 0.6.3 does not support MP4. Check the installed version and advertised upload contract first; if unsupported, deliver the file/link or update with approval, and do not bypass Runner with custom browser scripts). Never open Studio or a browser on the user's screen; mention only that `npx -y openfilm@0.2.5 open <folder>` opens the film in Studio if they want to edit it by hand.

## Generated media (optional, user's keys)

`npx -y openfilm@0.2.5 get` lists what is connected. Voice-over, music, images and AI video work only after the user connects a provider (ElevenLabs, OpenAI, Google, fal, …) in Studio → Settings → Providers with **their own key**. Never ask for or handle keys in chat. AI video clips cost real money: get the user's explicit go-ahead with the expected cost first.

## Rules

- Make the film; do not stop at a plan or storyboard unless the user asked for one.
- Use only assets the user owns or code/ffmpeg you generate. Never download other people's media.
- OpenFilm starts a local Studio server on first `look`/`render`; it may keep running so the user can edit. Say so; stop it only if the user asks.
- Remotion is an alternative only when the user confirms they hold the right Remotion licence.

## Device and permission gates

Required authorization scopes: computer:read, computer:write. Running OpenFilm needs the device's `start_process` skill and a Trusted Write Location. Scripts, OS/desktop actions, external service side effects, media generation and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Evidence of completion

Report the device, film folder, rendered file path, duration, resolution, frame count, size, render time and anything you could not verify. Do not claim a video exists until ffprobe has read it.
