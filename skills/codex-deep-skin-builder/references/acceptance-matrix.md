# Acceptance matrix

The result is complete only when the package passes deterministic checks and the live UI remains usable.

## Package

- V2 schema validates and every declared asset is present.
- Export and re-import succeed into a temporary state root.
- No external paths, symlinks, executable files, arbitrary CSS, or JavaScript.

## Visual

- Home screen and task screen retain readable text and obvious focus.
- Sidebar navigation, selected project, top toolbar, composer, send button, and permission controls remain visible.
- Right foreground subject is recognizable and does not cover the composer or main text.
- Sidebar ghost and watermark are intentionally subtle.
- Brand title is crisp native text; generated images contain no corrupted lettering.
- Wide, narrow, and compact-height layouts have no severe clipping or blocked controls.

## Runtime

- Applying the theme changes the actual Codex renderer, not only a static preview.
- A hot apply and a fresh restart produce the same theme ID.
- Switching to native, QQ, classic custom, and back leaves no deep-theme residue.
- Engine doctor/verify passes.

If real app control is unavailable, say which runtime checks were not executed. Do not represent package validation as visual acceptance.
