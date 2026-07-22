# Layout rules

The deep renderer maps only validated manifest values to CSS variables.

- Keep the primary subject on the right so the task column remains readable.
- Start foreground width near 500 px on a 1600 px window. Use negative bottom offsets for bust portraits, but never hide the face.
- Keep sidebar character opacity between 0.04 and 0.12; it is atmosphere, not navigation content.
- Keep watermark opacity between 0.05 and 0.14.
- Ensure accent colors meet readable contrast for selected rows and buttons. Use dark text on bright yellow themes; light text on dark red/blue themes.
- Avoid putting essential artwork in the top toolbar, composer controls, or right-panel action areas.
- On narrow windows the renderer reduces or hides decorative foreground layers. Do not compensate by baking the character into the background.

Tune manifest layout values, not arbitrary CSS. Revalidate after every change.
