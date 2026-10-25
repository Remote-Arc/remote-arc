# The Return / 回弹

An original 60-second, 1920×1080/30fps knowledge-film pilot. There is no voiceover. The separate English and Chinese versions share the same object animation, cutaways, comparisons and return to the opening.

Read storyboard.md and facts.md before running. The still/transition review found and corrected small props, delayed impact, the soft ball's floor collision radius, hand contact, and a local browser canvas capture problem. Basketball grooves are front-facing sphere-projected curves.

The film uses the MIT methods/runtime from [vibe-knowledge-film](https://github.com/HeyChengC/vibe-knowledge-film/tree/62d51508aad00003dc6209afa80c4b5dc540de59). Initialize a project with its scripts/new_film.py --world C, copy film.js and ball.js here into that project, load ball.js before film.js, and set the HTML lang to zh or en. Install its ordinary local Python/browser/FFmpeg dependencies and open fonts, then review with --sheet, --motion and --det before rendering.

The Windows session used a local bundled Chromium with GPU canvas acceleration disabled after the system Chrome path intermittently omitted canvas layers. The main/content canvas contexts were software-backed; direct CDP PNG capture passed deterministic review. The editable project delivered to the user records this adaptation. Do not assume every user's local browser matches that environment.

Mix the recording supplied by the user as BGM, with small event sounds. The recording and font binaries are runtime assets and are not included here. Video/poster bytes are in R2, outside Git. Sources and a record of the requested music are in facts.md; no royalty-free music license is asserted.

This is a sample for reviewing the revised direction. Earlier short gallery records are archived while their full-minute replacements await that review.
