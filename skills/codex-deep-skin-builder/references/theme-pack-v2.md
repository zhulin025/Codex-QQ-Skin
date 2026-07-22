# V2 theme package

A deep skin is a directory containing `theme.json` and declared raster assets. It uses `schemaVersion: 2` and `kind: "deep-custom"`.

Required asset keys are `background`, `foregroundRight`, `sidebarCharacter`, `watermark`, and `brandEmblem`. `avatar` is optional. File names must be flat, local names with PNG, JPEG, or WebP extensions. Prefer PNG for transparent layers.

Use a stable ID matching `custom-[a-z0-9-]+`. Recommended manifest shape:

```json
{
  "schemaVersion": 2,
  "kind": "deep-custom",
  "id": "custom-ironman",
  "name": "钢铁侠 · Arc Reactor",
  "appearance": "dark",
  "assets": {
    "background": "background.png",
    "foregroundRight": "foreground-right.png",
    "sidebarCharacter": "sidebar-character.png",
    "watermark": "watermark.png",
    "brandEmblem": "brand-emblem.png"
  },
  "brand": { "title": "CODEX", "subtitle": "MORE THAN CODE" },
  "colors": {
    "background": "#111318", "panel": "#191c22", "panelAlt": "#20242b",
    "accent": "#f0b323", "accentAlt": "#d44532", "secondary": "#8b98a9",
    "highlight": "#ffd66b", "text": "#edf0f1", "muted": "#a9b0ba",
    "line": "rgba(240, 179, 35, 0.30)"
  },
  "layout": {
    "foregroundRight": { "width": 520, "right": -24, "bottom": -120, "opacity": 1 },
    "sidebarCharacter": { "size": 138, "positionY": 22, "opacity": 0.075 },
    "watermark": { "width": 170, "positionX": 56, "positionY": 8, "opacity": 0.1 }
  }
}
```

Always let `deep-theme.mjs validate` enforce the exact bounds. `.codexskin` is the engine’s safe ZIP container; create it only through `export`.
