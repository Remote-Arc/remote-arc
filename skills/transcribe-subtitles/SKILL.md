---
name: transcribe-subtitles
description: Transcribe authorized audio locally, timestamp captions and render with FFmpeg.
priority: P1
category: media
status: builtin-guidance
---

# Transcribe & Subtitles

**Scope:** whisper.cpp + FFmpeg. **Source:** https://github.com/ggml-org/whisper.cpp

## Workflow

For user-authorized audio/video, inspect container codec/duration then transcribe with installed whisper.cpp / approved whisper backend. Never upload personal recordings unless explicitly requested. Keep timestamps, speaker labels only when evidence supports them, correct obvious recognition errors without fabricating dialogue. Generate .srt/.vtt in the requested language, preview timing on a sample, optionally burn subtitles using installed FFmpeg with fonts available on device. Warn about long-running CPU usage and any model-weight download. Verify resulting tracks using ffprobe and save all output within permitted workspace. Do not claim transcription accuracy without reviewing the sample.

## Device and permission gates

Required authorization scopes: computer:read, computer:write. Scripts, OS/desktop actions, external service side effects, media generation and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Preflight

Call `remotelink skills doctor` on the selected device, or inspect dependencies using already authorized process/file tools. Missing executors must be installed explicitly on the correct user device. A Skill being built-in is NOT evidence an engine is present.

## Evidence of completion

Report input constraints, executed tools and device, verified output path/result, permissions used, cost (if known) and failures. Do not imply successful execution from merely writing a plan.
