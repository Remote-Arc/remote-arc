# Local film gallery

The video gallery lives in /use-cases/video-creation#video-gallery and its Chinese counterpart. It follows the website language automatically; there are no category or language filter controls inside the gallery. The main use-cases directory remains a flat illustrated task catalog.

The featured addition is The Return / 回弹, a 60-second original basketball knowledge film in separate English and Chinese versions. It uses the vibe-knowledge-film method: a factual brief and storyboard, visible object actions, close-ups, cutaway compression, comparison, a return to the opening, iterative still/transition review and deterministic local rendering. There is no voiceover. The requested recording and small event sounds form its soundtrack; the recording is identified in the local facts sheet without a royalty-free claim.

Existing demonstrations stay visible alongside the new pilot: eight Chinese films and four English films, selected automatically by website language. New full-minute editions can be added progressively; producing a pilot does not unpublish earlier examples. Existing entries keep their actual duration and soundtrack metadata until remade.

Video/poster bytes live in the remote-arc-public-media R2 bucket under demo-gallery/. Git contains metadata, file sizes and SHA-256 hashes. Original image PNGs and WebP previews use the same approved route and publisher. Raster and video bytes remain outside Git.

The Relay and preview Worker expose only approved filenames. GET/HEAD, ETags, immutable caching and single byte ranges support native playback and seeking. Unknown keys cannot expose other bucket objects. A missing binding returns an unavailable response rather than an HTML fallback.

Verify prepared files:
    node scripts/media-gallery-publish.mjs --directory <local media folder>

Publish verified files through the existing account:
    node scripts/media-gallery-publish.mjs --directory <local media folder> --upload

The publisher checks every local SHA-256 before upload. Use content-hashed filenames and upload before publishing a referencing UI. Keep language, duration, soundtrack, sources and synthetic/schematic claims accurate. Videos are fetched only after a viewer chooses one; closing the native dialog removes the player and restores focus.
