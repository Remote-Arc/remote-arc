---
name: blender-mcp
description: Create and inspect local Blender scenes through a real MCP server: 3D modeling, materials, lighting, product visualization and camera animation, with editable blend files.
priority: P1
category: media
status: builtin-guidance
---

# Blender MCP

Choose Blender when the output needs modeled objects, realistic materials, shadows/reflections, a three-dimensional set, a product render or camera motion around geometry. Deliver .blend plus requested renders, images or model exports. Use Manim for exact mathematical transformations and Remotion/HyperFrames for composed films and explanatory overlays.

## Device and permission gates

Run Blender, its addon and the MCP server on the user's authorized computer. Use an allowed task directory. Ordinary portable Blender/Python/MCP preparation is part of the requested task; disclose approximately 400 MB for the Blender download and over 1 GB of extracted storage, plus Python dependencies. Reuse a compatible installed Blender when available. Keep rendering and inference local. Large Qwen TTS/ACE-Step downloads retain their existing approval requirement.

The helper creates a fresh owned Blender instance with factory settings and task-local configuration. It does not modify other AI-client MCP settings, save user preferences or overwrite an already-open project. For an existing live project, inspect/save it and use the user's intended scope rather than clearing the scene. The upstream addon requires a GUI event loop; blender --background alone is not a working MCP host. A missing desktop/display is a concrete blocker for live MCP, though batch rendering of an existing scene can work separately.

## Prepare a real local connection

Arc prepare_skill stages the entry and four scripts. Connect read_skill retrieves the hashed resources by path/offset. Keep local-creative.mjs, local-media.mjs, blender-host.py and blender-session.py together in scripts/.

    node "<skill>/scripts/local-creative.mjs" ensure --workspace "<workspace>" --engine blender

This prepares pinned mcp-for-blender 2.2.4 / MCP SDK 1.26.0 and a SHA-256-verified addon revision. It reuses Blender 4+ or downloads portable Blender 4.5.15 LTS from download.blender.org with a pinned checksum. Windows/Linux archives and a read-only macOS application-image extraction stay in the task folder; no administrator installer runs.

Start the owned host with the device process manager:

    node "<skill>/scripts/local-creative.mjs" serve-blender --workspace "<workspace>"

Read the emitted ready record for the selected loopback port and session directory. The host process stays running; an addon listener alone is not proof of an MCP connection.

    node "<skill>/scripts/local-creative.mjs" blender-mcp --workspace "<workspace>" --port "<observed port>"

This performs an actual MCP initialize and list_tools through stdio. Then write a request JSON and call it with --request "<request.json>". Begin with {"tool":"get_scene_info","arguments":{}} to verify the Blender addon and inspect the scene. For construction use execute_blender_code with code and user_prompt containing the user's actual request. Read the returned observation and inspect the resulting scene; save the requested .blend before reporting completion.

The bridge exposes scene inspection and Blender Python only. Telemetry is disabled, the socket is bound to 127.0.0.1, and upstream code safe mode stays enabled. Paid asset-generation providers are outside this local workflow. Do not disable safe mode to make a script pass; use supported bpy operators or an authorized batch script for the work.

## Make and verify the scene

- Inspect named objects, transforms, scene scale and the intended camera. Work in small steps with named collections and reusable materials. Preserve existing work.
- Model real geometry and use actual lights/materials instead of baked imitation screenshots. Preview a low-sample still before committing to a long animation.
- Save the editable .blend and inspect it via MCP readback. Render through Blender's actual engine. For long animation renders, use a separate background process with --disable-autoexec, bounded samples and a new image-sequence directory; assemble frames with local FFmpeg. This batch render is separate from the GUI MCP host.
- Check frame ranges, aspect ratio, camera clipping, shadows, material response, seams and the longest label. Decode the MP4 and inspect representative frames; an object count or successful save does not establish visual quality.

Save the scene, then request shutdown of this owned instance:

    node "<skill>/scripts/local-creative.mjs" stop-blender --workspace "<workspace>" --session "<observed session directory>"

Wait for the managed host process to exit. This does not shut down the user's other Blender instances. Deliver absolute artifact paths, editable sources and actual checks. Keep render binaries out of Git and upload only when requested.

Upstream integration (community-maintained, not Blender Foundation): https://github.com/ahujasid/mcp-for-blender
