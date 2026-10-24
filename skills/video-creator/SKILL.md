---
name: video-creator
description: Storyboard, compose, caption and export predictable videos using local render engines.
priority: P0
category: media
status: builtin-guidance
---

# Video Creator

**Scope:** Remotion skills + FFmpeg. **Source:** https://github.com/remotion-dev/skills

## Workflow

Clarify desired duration, aspect ratio, language, captions, asset ownership and output directory. Favor low-cost reproducible assembly: HTML/CSS/React/Remotion animation where appropriately licensed, FFmpeg for transitions, cropping, overlays, aspect conversion and muxing, and approved local images/audio. Inspect FFmpeg availability before quoting rendering capability. Use the open Remotion skill guidance only when the user has the correct Remotion licensing rights. Avoid automatic downloads of media/model weights; ask for licensed assets and explicit model/API costs. Render a 3–5 second low-resolution proof first, verify video/audio streams with ffprobe, then do a full render after approval. Video generation APIs and paid models are optional, not bundled or free.

## Delivering the video

Keep the final file inside a Trusted Write Location and report its path, duration, resolution and size from ffprobe. To give the person a download, use `create_file_resource` on that path. To post it to a website the person has authorized (for example a video platform's upload page), use Browser Runner: `browser_runner_snapshot`, then `browser_runner_act` with `upload` on the file input. Browser Runner accepts mp4, mov, m4v and webm up to 2 GB from Remote Arc 0.6.4; older devices reject video, so check the device's Agent version first and otherwise hand the file over for the person to upload. Uploading is a step inside the site's own flow; publishing, scheduling or making the video public still needs the person's confirmation.

## Device and permission gates

Required authorization scopes: computer:read, computer:write. Scripts, OS/desktop actions, external service side effects, media generation and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Preflight

Call `remotelink skills doctor` on the selected device, or inspect dependencies using already authorized process/file tools. Missing executors must be installed explicitly on the correct user device. A Skill being built-in is NOT evidence an engine is present.

## Evidence of completion

Report input constraints, executed tools and device, verified output path/result, permissions used, cost (if known) and failures. Do not imply successful execution from merely writing a plan.
