---
name: image-studio
description: Generate, retouch and upscale images using a user-hosted ComfyUI backend.
priority: P1
category: media
status: builtin-guidance
---

# Image Studio

**Scope:** ComfyUI. **Source:** https://github.com/Comfy-Org/ComfyUI

## Workflow

Determine user intent (generate/edit/upscale) and whether their authorized device has a functioning ComfyUI install, compatible accelerator and model license. ComfyUI and its model weights are NOT bundled by Remote Arc; no default GPU/cloud/API spending. Prefer an explicit local HTTP endpoint restricted to loopback, never expose ComfyUI to the internet without authentication. Validate prompt and image sources, request user permission to download third-party weights, run a small trial, inspect output dimensions and safety, write artifacts within approved workspace and report files plus model/provenance. Provide a clear no-backend error instead of claiming an image was made.

## Device and permission gates

Required authorization scopes: computer:read, computer:write. Scripts, OS/desktop actions, external service side effects, media generation and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Preflight

Call `remotelink skills doctor` on the selected device, or inspect dependencies using already authorized process/file tools. Missing executors must be installed explicitly on the correct user device. A Skill being built-in is NOT evidence an engine is present.

## Evidence of completion

Report input constraints, executed tools and device, verified output path/result, permissions used, cost (if known) and failures. Do not imply successful execution from merely writing a plan.
