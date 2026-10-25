# Local image reference gallery

The image studio use case at /use-cases/image-studio#image-gallery (and /zh/use-cases/image-studio#image-gallery) shows four original local code graphics: Court Energy, Quiet Objects, Tidal Lines and Common Ground. They demonstrate Canvas Design and Algorithmic Art rather than photographic synthesis.

Full PNG images and WebP thumbnails live in the remote-arc-public-media R2 bucket. The shared image manifest records dimensions, measured bytes, SHA-256 hashes, bilingual descriptions and reusable briefs. No raster asset bytes are committed. The same approved media route serves videos and images; unknown names never read arbitrary bucket objects.

Canvas Design and Algorithmic Art are pinned Anthropic community snapshots. Their upstream instructions, license and text resources are retained. Optional font binaries stay outside text resources: the canvas-fonts manifest gives pinned download URLs, sizes and SHA-256 hashes, while the upstream font licenses remain packaged. Materialize chosen resources in the local project and verify any selected font download.

Code graphics run locally with Canvas/Python or p5.js and do not require an image model. The image studio skill routes posters and generative graphics through these workflows. Photographic synthesis, model-based editing and upscaling still require a configured local ComfyUI backend; check its models and obtain authorization before weight downloads.

The demonstrations retain editable local source and design notes. The two p5.js viewers embed their library and fonts for offline use, provide seed/parameter controls and PNG export, and were checked for same-seed reproduction. A packaged skill is guidance and resources, not evidence that every user's device already has a renderer installed.

Verify or publish the exact manifest assets using scripts/media-gallery-publish.mjs. The publisher checks every local hash before uploading. Browser coverage checks the dedicated detail placement, delayed full-image loading, focus restoration, responsive layout and reusable Arc drafts. Live review checks actual R2 image decoding and hashes.
