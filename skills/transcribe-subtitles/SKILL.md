---
name: transcribe-subtitles
description: Transcribe audio or video to timed subtitles (SRT/VTT) locally with whisper.cpp — auto-installed on first use, no API key, works for Chinese and English.
priority: P1
category: media
status: builtin-guidance
---

# Transcribe & Subtitles

**Engine:** whisper.cpp (MIT) + FFmpeg, run locally. **Source:** https://github.com/ggml-org/whisper.cpp

Transcription has **no paid API requirement** and keeps recordings on the selected computer. Downloads, device compute, electricity and storage still have costs; the calling AI can consume its plan allowance. For the user's own audio/video, deliver the finished `.srt`/`.vtt` (and burned-in subtitles if asked); do not stop at a plan.

## Preflight and bounded local install

Need FFmpeg (`ffmpeg -version`) and a whisper.cpp build with a model. Use an existing verified installation first. If absent, the calling AI may provision a **small, pinned** whisper.cpp executable and `ggml-base.bin` (~142 MB) into a Trusted Write Location without another approval *only if* the user already authorized local dependency installation and sufficient space/network are available. Tell them the source, total size and destination before starting. Do not silently install system-level FFmpeg, request administrator rights, execute arbitrary downloaded scripts or exceed the small default. If the download fails, report it instead of claiming subtitles are ready.

Windows (cmd/PowerShell), GPU build + a model (~272 MB binary, model 142 MB–1.6 GB):
- Binary (NVIDIA): download `https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cuda-11.8.0-x64.zip` and extract with `tar -xf`. No NVIDIA GPU: use `whisper-bin-x64.zip` from the same release (CPU).
- **Default model:** `ggml-base.bin` (~142 MB), fetched from `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`. `ggml-small.bin` (~466 MB) or `ggml-large-v3-turbo.bin` (~1.6 GB) require explicit size-aware consent before downloading. Never fetch the largest model by default.
- macOS/Linux: use an existing whisper.cpp binary, or explain an approved local `brew install whisper-cpp` / source build; do not silently change system packages. Use the same bounded model policy.

Check release integrity (official source and published checksum when available), verify the archive contents before extraction, and preserve the Windows DLLs beside `whisper-cli.exe`. Confirm the executable actually launches. A downloaded file is not proof that transcription works.

## Workflow

1. Inspect the input: `ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 <file>`. Warn if very long (CPU transcription is slow).
2. Extract 16 kHz mono WAV: `ffmpeg -y -i <input> -ar 16000 -ac 1 -c:a pcm_s16le audio16k.wav`.
3. Transcribe. Chinese: `whisper-cli -m <model>.bin -f audio16k.wav -l zh -osrt -ovtt -of out`. Auto language: `-l auto`. Add `-ml 1` for word-level timing only if the user wants karaoke/animated captions.
4. Read `out.srt`, fix obvious recognition errors against the audio; never invent dialogue or speaker labels that evidence does not support.
5. Optional burn-in: `ffmpeg -y -i <video> -vf "subtitles=out.srt:force_style='FontName=Noto Sans SC,FontSize=18'" -c:a copy subbed.mp4` (use a CJK font that exists on the device for Chinese).
6. Verify with ffprobe; deliver the `.srt`/`.vtt` (and `subbed.mp4` if burned). For OpenFilm videos, put the matching `.vtt` next to its clip so Studio shows subtitles.

## Rules

- Never upload personal recordings to any service; this runs entirely on the device.
- Do not claim accuracy without reviewing a sample against the audio.

## Device and permission gates

Required authorization scopes: computer:read, computer:write. Running whisper needs the device's `start_process` skill and a Trusted Write Location. Scripts, OS/desktop actions, external service side effects and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Evidence of completion

Report the device, input, model used, output file paths, duration covered, and anything you could not verify. Do not claim subtitles exist until you have read the generated file.
