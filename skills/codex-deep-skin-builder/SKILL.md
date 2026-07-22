---
name: codex-deep-skin-builder
description: Create, package, install, apply, and visually verify a deeply customized Codex desktop skin from a short theme keyword or optional reference images. Use when the user asks for a themed Codex skin, deep UI customization, a .codexskin package, or refinement of foreground, sidebar, watermark, branding, colors, and layout beyond a background swap.
---

# Codex 深度皮肤助手

Turn a one-line theme such as “钢铁侠主题” into a complete, locally installed Codex skin. Reference images are optional. Default to completing the entire workflow without asking the user to supply intermediate assets.

## Resolve the engine

Find the first directory containing `scripts/deep-theme.mjs`:

1. The current project directory.
2. macOS: `~/.codex/codex-qq-skin-studio`.
3. Windows: `%LOCALAPPDATA%\CodexQQSkin\engine`.

Stop and explain how to install Codex QQ Skin only if no engine exists. Never download or execute an untrusted replacement engine.

## Run the workflow

1. Read [asset-generation.md](references/asset-generation.md), [theme-pack-v2.md](references/theme-pack-v2.md), [layout-rules.md](references/layout-rules.md), and [acceptance-matrix.md](references/acceptance-matrix.md).
2. Extract the theme subject, mood, palette, desired brand text, and any explicit “preview only” or “do not apply” constraint.
3. If the user supplied reference images, inspect them. Otherwise use the available image-generation capability to create two internal UI references: a Codex home screen and a task/conversation screen. Generate them without pausing for approval.
4. Generate the required isolated layers from the chosen direction: background, right foreground subject, sidebar ghost subject, watermark, and brand emblem. Generate avatar only when it materially improves the theme.
5. Inspect every output. Remove backgrounds from isolated assets, crop transparent padding, and regenerate rather than accepting obvious clipping, text corruption, opaque boxes, or weak subject recognition.
6. Create a V2 `theme.json` and a self-contained theme directory. Do not inject arbitrary CSS or JavaScript.
7. Run the engine’s `validate`, `export`, and `install` commands. Unless the user asked for preview-only or no-apply, run `apply` and `verify` too.
8. Validate the real Codex result using the acceptance matrix. Capture a real screenshot when local app control or CDP is available. Fix material failures and repeat validation.
9. Return the installed theme ID, `.codexskin` path, verification result, screenshot path when available, and the restore command.

## Use deterministic engine commands

Run commands with the engine’s Node runtime when bundled; otherwise use a trusted local Node.js:

```bash
node scripts/deep-theme.mjs create --manifest <manifest.json> --assets-dir <assets> --out <theme-dir>
node scripts/deep-theme.mjs validate --theme-dir <theme-dir>
node scripts/deep-theme.mjs export --theme-dir <theme-dir> --out <theme.codexskin>
node scripts/deep-theme.mjs install --theme-dir <theme-dir>
node scripts/deep-theme.mjs apply --id <theme-id>
node scripts/deep-theme.mjs verify
```

For an existing package, use `import --package <theme.codexskin>`. Do not manually copy unvalidated packages into the live theme directory.

## Preserve user intent

- “先看方案” means stop after the two UI references and summarize the visual direction.
- “不要应用” means still validate and export, but do not install or switch the live skin.
- “保留但不要切换” means install the package but skip `apply`.
- A refinement request should reuse the existing theme ID unless the user asks for a variant.
- Ask a question only when a required capability is unavailable, inputs are contradictory, or repeated generation attempts still cannot meet the acceptance matrix.

## Safety

Keep all outputs local unless the user explicitly asks to publish or upload. Do not alter the official Codex application bundle. Do not accept executable content, external asset paths, symlinks, arbitrary CSS, or JavaScript in a theme package.
