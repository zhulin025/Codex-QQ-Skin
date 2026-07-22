# Asset generation

## Internal references

When no reference is supplied, generate two 16:9 product mockups:

- Home: full Codex window, left sidebar, centered welcome area, composer, and optional right foreground subject.
- Task: active conversation, cards/code content, composer, optional right panel, and the same visual system.

Treat these as direction boards, not assets to paste over the application UI. Preserve native Codex readability and controls.

## Isolated layers

- `background`: 16:9, at least 1600×900. Low contrast behind content; reserve the central reading area.
- `foreground-right`: transparent PNG, portrait composition, complete head/shoulders, no frame, no text, no glow cut off at edges.
- `sidebar-character`: transparent PNG, recognizable at small size, no opaque background.
- `watermark`: transparent monochrome or low-detail emblem, centered composition.
- `brand-emblem`: transparent compact logo or symbol. Avoid generated spelling; render brand title from the theme config.
- `avatar`: optional transparent square mark.

Inspect generated images at full resolution. Reject opaque checkerboards, fake transparency, clipped silhouettes, unwanted text, illegible logos, duplicate limbs, severe anatomy defects, and strong content under the center reading column. Use the image editing/generation capability to remove backgrounds; do not implement image editing ad hoc when that capability is available.
