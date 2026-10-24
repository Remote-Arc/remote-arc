# Local video demo gallery

The bilingual gallery is part of /use-cases#video-gallery and /zh/use-cases#video-gallery. It includes the basketball film, the HyperFrames 24-hour explainer, the Venus and Pluto episodes, and three new product/data/map examples.

Video and poster bytes are stored in the remote-arc-public-media R2 bucket under demo-gallery/. Git contains presentation metadata, file sizes and SHA-256 hashes in packages/docs/src/media-gallery.ts. Media files remain outside the repository; prepare them in an ignored workspace or another local directory. No API tokens or signed URLs belong in the manifest.

The production Relay and UI preview Worker expose only the manifest's approved filenames through /media/demo-gallery/. GET/HEAD, ETags, immutable cache headers and single byte ranges support playback and seeking. Unknown keys cannot expose other bucket objects. A missing binding returns a clear unavailable response rather than an HTML fallback.

To verify prepared files without uploading:
    node scripts/media-gallery-publish.mjs --directory <local media folder>

To publish those exact verified bytes using the existing Cloudflare account:
    node scripts/media-gallery-publish.mjs --directory <local media folder> --upload

The publisher verifies every local SHA-256 before its first upload, uses the project's Wrangler account/bucket configuration and never records credentials. The R2 binding is required in both production and preview configurations.

For a new demo, render and review the actual film locally, check audio/frames and metadata, create a web version with H.264/AAC and fast-start metadata, and generate a WebP poster. Use content-hashed filenames; update the shared manifest with measured dimensions/duration, bilingual copy, audio status and a reusable human-language brief. Upload before publishing the referencing site version. Keep synthetic data and fictional products labeled.

Verification includes the media route tests, desktop/mobile gallery interaction tests, local file checksums and a live R2 playback/seek check. Videos are fetched only after a viewer chooses one; closing the native dialog removes the player and returns keyboard focus.
