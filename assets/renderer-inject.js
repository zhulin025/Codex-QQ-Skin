((cssText, customCssText, artDataUrl, qqArtDataUrl, petDataUrl, retroFrameDataUrl, qqAvatarDataUrl, coughAudioDataUrl, deepThemeAssets, themeConfig, qqThemeConfig, libraryThemes) => {
  const STATE_KEY = "__CODEX_QQ_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_QQ_SKIN_DISABLED__";
  const STYLE_ID = "codex-qq-skin-style";
  const CHROME_ID = "codex-qq-skin-chrome";
  const COMPANION_ID = "codex-qq-skin-companion";
  const USAGE_PANEL_ID = "codex-qq-skin-usage-panel";
  const USAGE_TOGGLE_ID = "codex-qq-skin-usage-toggle";
  const HOME_PET_ID = "codex-qq-skin-home-pet";
  const RIGHT_TRAY_ID = "codex-qq-skin-right-tray";
  const RETRO_SHELL_ID = "codex-qq-skin-retro-shell";
  const RETRO_PROFILE_ID = "codex-qq-skin-retro-profile";
  const TOGGLE_ID = "codex-qq-skin-toggle";
  const LIBRARY_MENU_ID = "codex-qq-skin-library-menu";
  const ENABLED_STORAGE_KEY = "codex-qq-skin-enabled";
  const MODE_STORAGE_KEY = "codex-qq-skin-mode";
  const LIBRARY_SWITCH_KEY = "codex-qq-skin-library-switch";
  const USAGE_MODE_KEY = "codex-qq-skin-usage-mode";
  const USAGE_NET_MODE_KEY = "codex-qq-skin-usage-net-mode";
  const USAGE_REFRESH_KEY = "codex-qq-skin-usage-refresh";
  const NATIVE_APPEARANCE_STATE_KEY = "__CODEX_QQ_SKIN_NATIVE_APPEARANCE__";
  const LIBRARY_THEMES = Array.isArray(libraryThemes)
    ? libraryThemes.filter((item) => item && typeof item.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(item.id))
    : [];
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready", "data-dream-art-fit", "data-dream-three-pane", "data-dream-summary-state", "data-dream-left-sidebar",
    "data-qq-usage-mode", "data-qq-usage-state",
  ];
  const VERSION = __QQ_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __QQ_SKIN_STYLE_REVISION_JSON__;
  const CUSTOM_THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const QQ_THEME = qqThemeConfig && typeof qqThemeConfig === "object" ? qqThemeConfig : {};
  const DEEP_THEME_ASSETS = deepThemeAssets && typeof deepThemeAssets === "object" ? deepThemeAssets : {};
  const CUSTOM_THEME_KINDS = new Set(["custom-native", "deep-custom"]);
  let skinMode = "qq";
  try {
    const savedMode = window.localStorage?.getItem(MODE_STORAGE_KEY);
    const legacyEnabled = window.localStorage?.getItem(ENABLED_STORAGE_KEY);
    if (["native", "qq", "custom"].includes(savedMode)) skinMode = savedMode;
    else if (legacyEnabled === "false") skinMode = "native";
    else if (CUSTOM_THEME_KINDS.has(CUSTOM_THEME.kind)) skinMode = "custom";
  } catch {}
  if (skinMode === "custom" && !CUSTOM_THEME_KINDS.has(CUSTOM_THEME.kind)) skinMode = "qq";
  let THEME = skinMode === "qq" ? QQ_THEME : CUSTOM_THEME;
  let ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  let LAYOUT = THEME.layout && typeof THEME.layout === "object" ? THEME.layout : {};
  let SOUND = THEME.sound && typeof THEME.sound === "object" ? THEME.sound : {};
  const CUSTOM_ART_METADATA = CUSTOM_THEME.artMetadata && typeof CUSTOM_THEME.artMetadata === "object"
    ? CUSTOM_THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_QQ_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--qq-skin-focus-x", "--qq-skin-focus-y", "--qq-skin-art-position",
    "--qq-skin-name", "--qq-skin-tagline", "--qq-skin-project-prefix",
    "--qq-skin-project-label", "--dream-three-pane-min-width", "--dream-right-panel-width",
    "--dream-retro-frame", "--dream-summary-panel-width",
    "--dream-right-tray-inset", "--dream-right-panel-right",
    "--dream-deep-right", "--dream-deep-sidebar", "--dream-deep-watermark",
    "--dream-deep-brand", "--dream-deep-avatar", "--dream-deep-right-width",
    "--dream-deep-right-right", "--dream-deep-right-bottom", "--dream-deep-right-opacity",
    "--dream-deep-sidebar-size", "--dream-deep-sidebar-y", "--dream-deep-sidebar-opacity",
    "--dream-deep-watermark-width", "--dream-deep-watermark-x", "--dream-deep-watermark-y",
    "--dream-deep-watermark-opacity", "--dream-deep-brand-title", "--dream-deep-brand-subtitle",
  ];
  const installToken = {};
  const autoOpenedSummaryToggles = new WeakSet();
  const autoOpenedSidebarToggles = new WeakSet();
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = (skinMode === "custom" && typeof CUSTOM_THEME.artKey === "string")
    ? analysisCache.get(CUSTOM_THEME.artKey) ?? null
    : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  let routeSettleTimer = null;
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    startupPasses: 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  let skinEnabled = skinMode !== "native";
  window[DISABLED_KEY] = !skinEnabled;

  const previous = window[STATE_KEY];
  const dataUrlToObjectUrl = (dataUrl, fallbackMime) => {
    const comma = dataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || fallbackMime;
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  const artUrl = dataUrlToObjectUrl(artDataUrl, "image/png");
  const qqArtUrl = dataUrlToObjectUrl(qqArtDataUrl, "image/png");
  const petUrl = dataUrlToObjectUrl(petDataUrl, "image/png");
  const retroFrameUrl = dataUrlToObjectUrl(retroFrameDataUrl, "image/png");
  const qqAvatarUrl = dataUrlToObjectUrl(qqAvatarDataUrl, "image/png");
  const coughAudioUrl = dataUrlToObjectUrl(coughAudioDataUrl, "audio/mpeg");
  const deepThemeUrls = Object.fromEntries(Object.entries(DEEP_THEME_ASSETS)
    .filter(([, dataUrl]) => typeof dataUrl === "string" && dataUrl.startsWith("data:"))
    .map(([key, dataUrl]) => [key, dataUrlToObjectUrl(dataUrl, "image/png")]));

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.startupTimer) clearInterval(previous.startupTimer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.routeInteractionHandler && typeof document.removeEventListener === "function") {
    document.removeEventListener("click", previous.routeInteractionHandler, true);
  }
  previous?.soundMonitor?.cleanup?.();
  document.getElementById(TOGGLE_ID)?.remove();
  document.getElementById(LIBRARY_MENU_ID)?.remove();
  document.getElementById(COMPANION_ID)?.remove();
  // These controls own closures over the current renderer generation. Rebuild
  // them on every reinjection so their mode/refresh clicks never call stale code.
  document.getElementById(USAGE_PANEL_ID)?.remove();
  document.getElementById(USAGE_TOGGLE_ID)?.remove();
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  /**
   * QQ is a deliberately light, classic skin. Codex writes its active native
   * palette as inline --color-* variables, so merely declaring color-scheme
   * cannot prevent dark popovers and portals. Snapshot those native values,
   * let Codex's own electron-light stylesheet take over while QQ is active,
   * then restore the exact previous palette on exit.
   */
  const forceNativeLightForQQ = () => {
    const root = document.documentElement;
    let snapshot = window[NATIVE_APPEARANCE_STATE_KEY];
    if (!snapshot) {
      snapshot = {
        variant: root.classList.contains("electron-dark") ? "dark" : "light",
        properties: Array.from(root.style || [])
          .filter((name) => name.startsWith("--color-") || name.startsWith("--codex-base-"))
          .map((name) => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]),
      };
      window[NATIVE_APPEARANCE_STATE_KEY] = snapshot;
    }
    for (const name of Array.from(root.style || [])) {
      if (name.startsWith("--color-") || name.startsWith("--codex-base-")) {
        root.style.removeProperty(name);
      }
    }
    root.classList.remove("electron-dark");
    root.classList.add("electron-light");
  };

  const restoreNativeAppearance = () => {
    const root = document.documentElement;
    const snapshot = window[NATIVE_APPEARANCE_STATE_KEY];
    if (!snapshot) return;
    for (const name of Array.from(root.style || [])) {
      if (name.startsWith("--color-") || name.startsWith("--codex-base-")) {
        root.style.removeProperty(name);
      }
    }
    for (const [name, value, priority] of snapshot.properties || []) {
      root.style.setProperty(name, value, priority || "");
    }
    root.classList.remove("electron-dark", "electron-light");
    root.classList.add(snapshot.variant === "dark" ? "electron-dark" : "electron-light");
    delete window[NATIVE_APPEARANCE_STATE_KEY];
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadQQSkin = root.classList.contains("codex-qq-skin");
      const hadCustomSkin = root.classList.contains("codex-dream-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadQQSkin) root.classList.remove("codex-qq-skin");
      if (hadCustomSkin) root.classList.remove("codex-dream-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadQQSkin) root.classList.add("codex-qq-skin");
        if (hadCustomSkin) root.classList.add("codex-dream-skin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-qq-skin") && !root.classList.contains("codex-dream-skin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    // The bundled QQ preset is a fixed product palette, not an uploaded-image
    // palette. Never let the previous custom image analysis tint its icons,
    // sidebars, or panels after switching back to QQ mode.
    const explicit = new Set(skinMode === "qq"
      ? Object.keys(colors)
      : (Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []));
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = skinMode !== "qq" && !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--qq-skin-name", cssString(THEME.name || "Codex QQ Skin"));
    setStyleProperty(root, "--qq-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--qq-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--qq-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    // QQ is a closed product pack. Never inherit uploaded-image analysis/metadata,
    // or ambient/wide wallpaper rules will keep painting custom art after a switch.
    let safeArea;
    let taskMode;
    let wide;
    let aspect;
    let focusX;
    let focusY;
    let artReady;
    if (skinMode === "qq") {
      safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : "center";
      taskMode = ART.taskMode && ART.taskMode !== "auto" ? ART.taskMode : "off";
      wide = false;
      aspect = "landscape";
      focusX = typeof ART.focusX === "number" ? ART.focusX : 0.5;
      focusY = typeof ART.focusY === "number" ? ART.focusY : 0.5;
      artReady = true;
    } else {
      const profile = artAnalysis || CUSTOM_ART_METADATA;
      const inferredSafe = profile?.safeArea || "center";
      safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
      taskMode = ART.taskMode && ART.taskMode !== "auto"
        ? ART.taskMode : profile?.taskMode || "ambient";
      wide = profile?.wide || false;
      aspect = profile?.aspect || "unknown";
      focusX = typeof ART.focusX === "number" ? ART.focusX
        : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
      focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
      artReady = Boolean(artAnalysis);
    }
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    // A conventional photo is much taller than the panoramic home hero. Using
    // cover there can remove most of a portrait (including the head or body).
    // Reserve cropping for genuinely wide artwork; fit ordinary photo and
    // portrait compositions completely inside the new-task build panel.
    const artFit = ["portrait", "square", "landscape"].includes(aspect) ? "contain" : "cover";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-fit", artFit);
    setAttribute(root, "data-dream-art-ready", artReady ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--qq-skin-focus-x", focusXValue);
    setStyleProperty(root, "--qq-skin-focus-y", focusYValue);
    setStyleProperty(root, "--qq-skin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let companionParts = null;
  let usageParts = null;
  let usageSnapshot = window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__ && typeof window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__ === "object"
    ? window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__
    : { schemaVersion: 1, status: "loading", scope: "device" };
  let companionSnapshot = window.__CODEX_QQ_SKIN_COMPANION_SNAPSHOT__ &&
    typeof window.__CODEX_QQ_SKIN_COMPANION_SNAPSHOT__ === "object"
    ? window.__CODEX_QQ_SKIN_COMPANION_SNAPSHOT__
    : { schemaVersion: 1, status: "loading", github: [] };
  const BLIND_BOX_STORAGE_KEY = "codex-qq-skin-project-blind-box";
  const BLIND_BOX_DECOR = ["globe", "rocket", "trophy", "cat"];
  let companionBlindBox = {
    currentId: 0,
    history: [],
    favorites: [],
    avoidedIds: [],
    avoidedLanguages: [],
    discoveries: 0,
    unlocked: [],
  };
  try {
    const saved = JSON.parse(window.localStorage?.getItem(BLIND_BOX_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      companionBlindBox = {
        currentId: Number(saved.currentId) || 0,
        history: Array.isArray(saved.history) ? saved.history.map(Number).filter(Boolean).slice(-50) : [],
        favorites: Array.isArray(saved.favorites) ? saved.favorites.map(Number).filter(Boolean).slice(-100) : [],
        avoidedIds: Array.isArray(saved.avoidedIds) ? saved.avoidedIds.map(Number).filter(Boolean).slice(-100) : [],
        avoidedLanguages: Array.isArray(saved.avoidedLanguages)
          ? saved.avoidedLanguages.map((item) => String(item || "").slice(0, 24)).filter(Boolean).slice(-20) : [],
        discoveries: Math.max(0, Number(saved.discoveries) || 0),
        unlocked: Array.isArray(saved.unlocked)
          ? saved.unlocked.filter((item) => BLIND_BOX_DECOR.includes(item)) : [],
      };
    }
  } catch {}
  let companionRoomMode = "room";
  let companionBreakTimer = null;
  let blindBoxRevealTimer = null;
  let usageMode = "stats";
  let usageNetMode = false;
  try {
    usageMode = window.localStorage?.getItem(USAGE_MODE_KEY) === "native" ? "native" : "stats";
    usageNetMode = window.localStorage?.getItem(USAGE_NET_MODE_KEY) === "true";
  } catch {}
  let retroShellParts = null;
  let retroProfileParts = null;
  let observedShellMain = null;
  let resizeObserver = null;

  const pinnedSummaryLabel = /(toggle pinned summary|pinned summary|置顶摘要|固定摘要|釘選概要|釘選摘要|概要.*釘選|摘要.*固定)/i;
  const showSidebarLabel = /^(show sidebar|显示边栏|显示侧边栏|顯示邊欄|顯示側邊欄|サイドバーを表示|사이드바 표시)$/i;
  const hideSidebarLabel = /^(hide sidebar|隐藏边栏|隐藏侧边栏|隱藏邊欄|隱藏側邊欄|サイドバーを非表示|사이드바 숨기기)$/i;

  /* Original, synthesized notification sounds. No QQ audio is copied or
     bundled: completion is a short filtered-noise "cough", approval is an
     urgent IM-style alert, and startup/reconnection is a two-part knock. */
  const createSoundMonitor = () => {
    const storageKey = "codex-qq-skin-sound-enabled";
    const configuredVolume = typeof SOUND.volume === "number"
      ? clamp(SOUND.volume, 0, 1) : 0.48;
    const completionStyle = SOUND.completed === "didi" ? "didi" : "cough";
    const approvalStyle = SOUND.approval === "didi" ? "didi" : "alert";
    const onlineStyle = SOUND.online === "didi" ? "didi" : "knock";
    let enabled = SOUND.enabled !== false;
    try {
      const saved = window.localStorage?.getItem(storageKey);
      if (saved === "true" || saved === "false") enabled = saved === "true";
    } catch {}

    let audioContext = null;
    let initialized = false;
    let previousRunning = false;
    let activeApproval = null;
    let routeKey = "";
    let cancelledUntil = 0;
    let completionTimer = null;
    let statusTimer = null;
    let statusListener = null;
    let currentStatus = "idle";
    let boundButton = null;
    let activeCoughAudio = null;
    let startupCuePending = false;
    try {
      startupCuePending = window.sessionStorage?.getItem("codex-qq-skin-online-cue-played") !== "true";
    } catch { startupCuePending = true; }

    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const buttonLabel = (button) => normalize(
      button.getAttribute?.("aria-label") || button.getAttribute?.("title") || button.textContent,
    );
    const stopPattern = /^(stop|stop generating|stop task|cancel generation|停止|停止生成|停止任务|终止任务|中止任务)$/i;
    const approvalActionPattern = /^(allow once|approve)(\b.*)?$|^yes,? (allow|proceed)$|^run( command)?$|^continue$|^允许(一次|本次|此操作)?$|^批准(一次|本次)?$|^同意$|^授权$|^运行(命令)?$|^继续执行$/i;
    const approvalContextPattern = /(permission|approval|approve|authorize|authorization|command|权限|授权|批准|审批|命令|沙盒)/i;

    const setStatus = (next, { transient = false } = {}) => {
      if (statusTimer && !transient) {
        clearTimeout(statusTimer);
        statusTimer = null;
      }
      currentStatus = next;
      statusListener?.(currentStatus);
      if (transient) {
        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
          statusTimer = null;
          setStatus(window.navigator?.onLine === false ? "offline" : "idle");
        }, 4200);
      }
    };

    const visibleButtons = () => [...document.querySelectorAll('button, [role="button"]')]
      .filter((button) => !button.disabled && button.getAttribute?.("aria-disabled") !== "true" &&
        button.getAttribute?.("aria-hidden") !== "true");
    const isStopButton = (button) => stopPattern.test(buttonLabel(button));
    const findRunning = () => visibleButtons().some(isStopButton);
    const findApproval = () => {
      const action = visibleButtons().find((button) => {
        const label = buttonLabel(button);
        if (!approvalActionPattern.test(label)) return false;
        const turn = button.closest?.('[data-turn-key], [data-testid*="approval" i]');
        if (!turn) return false;
        if (!/^(run( command)?|continue|运行(命令)?|继续执行)$/i.test(label)) return true;
        return approvalContextPattern.test(normalize(turn.textContent));
      });
      if (!action) return null;
      const host = action.closest?.('[data-turn-key], [data-testid*="approval" i]') || action.parentElement;
      const hostText = normalize(host?.textContent).slice(0, 320);
      const turnKey = host?.getAttribute?.("data-turn-key") || "";
      return `${turnKey}|${buttonLabel(action)}|${hostText}`;
    };

    const ensureAudioContext = () => {
      if (audioContext && audioContext.state !== "closed") return audioContext;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextClass !== "function") return null;
      try { audioContext = new AudioContextClass(); } catch { audioContext = null; }
      return audioContext;
    };

    const playNotes = (notes) => {
      const context = ensureAudioContext();
      if (!context) return;
      const start = context.currentTime + 0.025;
      for (const [frequency, offset, duration] of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, configuredVolume * 0.24), start + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + duration + 0.02);
      }
    };

    const playSynthesizedCough = () => {
      const context = ensureAudioContext();
      if (!context) return;
      const sampleRate = context.sampleRate;
      for (const [offset, duration, frequency, strength] of [
        [0.02, 0.19, 620, 1],
        [0.28, 0.26, 470, 0.82],
      ]) {
        const frameCount = Math.max(1, Math.floor(sampleRate * duration));
        const buffer = context.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);
        let randomState = 0x51f15e + Math.floor(offset * 1000);
        for (let index = 0; index < frameCount; index += 1) {
          randomState = (randomState * 1664525 + 1013904223) >>> 0;
          const noise = randomState / 0xffffffff * 2 - 1;
          const phase = index / frameCount;
          const envelope = Math.sin(Math.PI * phase) * Math.exp(-phase * 2.1);
          data[index] = noise * envelope;
        }
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(frequency, context.currentTime + offset);
        filter.Q.value = 0.85;
        gain.gain.value = configuredVolume * 0.7 * strength;
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(context.currentTime + offset);
      }
    };

    const playCough = () => {
      if (typeof window.Audio !== "function") {
        playSynthesizedCough();
        return;
      }
      try {
        activeCoughAudio?.pause?.();
        const audio = new window.Audio(coughAudioUrl);
        activeCoughAudio = audio;
        audio.volume = configuredVolume;
        audio.onended = () => { if (activeCoughAudio === audio) activeCoughAudio = null; };
        const playback = audio.play();
        playback?.catch?.(() => {
          if (activeCoughAudio === audio) activeCoughAudio = null;
          playSynthesizedCough();
        });
      } catch {
        activeCoughAudio = null;
        playSynthesizedCough();
      }
    };

    const playKnock = () => {
      const context = ensureAudioContext();
      if (!context) return;
      const start = context.currentTime + 0.025;
      for (const [offset, frequency, strength] of [
        [0.00, 165, 1], [0.19, 138, 0.84],
      ]) {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, start + offset + 0.115);
        filter.type = "lowpass";
        filter.frequency.value = 720;
        gain.gain.setValueAtTime(Math.max(0.0002, configuredVolume * 0.52 * strength), start + offset);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.14);
        oscillator.connect(filter).connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.16);
      }
    };

    const synthesize = (style) => {
      if (style === "cough") playCough();
      else if (style === "knock") playKnock();
      else if (style === "didi") playNotes([
        [880, 0.00, 0.075], [1175, 0.105, 0.075], [1320, 0.21, 0.095],
      ]);
      else playNotes([
        [740, 0.00, 0.075], [1047, 0.11, 0.085], [740, 0.23, 0.075], [1319, 0.34, 0.13],
      ]);
    };

    const play = (eventName) => {
      if (!enabled || configuredVolume <= 0) return false;
      const context = ensureAudioContext();
      if (!context) return false;
      const style = eventName === "approval" ? approvalStyle
        : eventName === "online" ? onlineStyle : completionStyle;
      const perform = () => synthesize(style);
      if (context.state === "suspended" && typeof context.resume === "function") {
        context.resume().then(perform).catch(() => {});
      } else {
        perform();
      }
      return true;
    };

    const updateButton = () => {
      if (!boundButton) return;
      boundButton.textContent = enabled ? "🔊 提示音" : "🔇 已静音";
      boundButton.setAttribute?.("aria-label", enabled ? "关闭 Codex QQ 提示音" : "开启 Codex QQ 提示音");
      boundButton.setAttribute?.("aria-pressed", enabled ? "true" : "false");
    };
    const setEnabled = (next, { preview = false } = {}) => {
      enabled = Boolean(next);
      try { window.localStorage?.setItem(storageKey, String(enabled)); } catch {}
      updateButton();
      if (enabled && preview) play("approval");
      return enabled;
    };
    const bindButton = (button) => {
      if (boundButton === button) return;
      boundButton = button;
      if (button?.dataset && button.dataset.qqSoundBound !== "true" && typeof button.addEventListener === "function") {
        button.dataset.qqSoundBound = "true";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setEnabled(!enabled, { preview: !enabled });
        });
      }
      updateButton();
    };

    const scan = () => {
      const nextRoute = `${window.location?.pathname || ""}${window.location?.search || ""}`;
      const running = findRunning();
      const approval = findApproval();
      if (!initialized || nextRoute !== routeKey) {
        initialized = true;
        routeKey = nextRoute;
        previousRunning = running;
        activeApproval = approval;
        if (completionTimer) clearTimeout(completionTimer);
        completionTimer = null;
        setStatus(window.navigator?.onLine === false ? "offline" : approval ? "approval" : running ? "running" : "idle");
        return;
      }
      if (approval && approval !== activeApproval) play("approval");
      activeApproval = approval;
      if (running && completionTimer) {
        clearTimeout(completionTimer);
        completionTimer = null;
      }
      if (previousRunning && !running && !approval && Date.now() >= cancelledUntil) {
        if (completionTimer) clearTimeout(completionTimer);
        completionTimer = setTimeout(() => {
          completionTimer = null;
          if (!findRunning() && !findApproval() && Date.now() >= cancelledUntil) {
            play("completed");
            setStatus("completed", { transient: true });
          }
        }, 520);
      }
      previousRunning = running;
      if (window.navigator?.onLine === false) setStatus("offline");
      else if (approval) setStatus("approval");
      else if (running) setStatus("running");
      else if (!statusTimer) setStatus("idle");
    };

    const unlock = () => {
      if (!enabled) return;
      const context = ensureAudioContext();
      const playStartupCue = () => {
        if (!startupCuePending) return;
        startupCuePending = false;
        try { window.sessionStorage?.setItem("codex-qq-skin-online-cue-played", "true"); } catch {}
        play("online");
      };
      if (context?.state === "suspended") context.resume().then(playStartupCue).catch(() => {});
      else if (context) playStartupCue();
    };
    const handleOnline = () => {
      play("online");
      setStatus(findApproval() ? "approval" : findRunning() ? "running" : "idle");
    };
    const handleOffline = () => setStatus("offline");
    const clickGuard = (event) => {
      const button = event.target?.closest?.('button, [role="button"]');
      if (button && isStopButton(button)) cancelledUntil = Date.now() + 3000;
      unlock();
    };
    document.addEventListener?.("pointerdown", unlock, true);
    document.addEventListener?.("keydown", unlock, true);
    document.addEventListener?.("click", clickGuard, true);
    window.addEventListener?.("online", handleOnline);
    window.addEventListener?.("offline", handleOffline);

    return {
      bindButton,
      bindStatus(listener) {
        statusListener = typeof listener === "function" ? listener : null;
        statusListener?.(currentStatus);
      },
      cleanup() {
        if (completionTimer) clearTimeout(completionTimer);
        if (statusTimer) clearTimeout(statusTimer);
        document.removeEventListener?.("pointerdown", unlock, true);
        document.removeEventListener?.("keydown", unlock, true);
        document.removeEventListener?.("click", clickGuard, true);
        window.removeEventListener?.("online", handleOnline);
        window.removeEventListener?.("offline", handleOffline);
        try { activeCoughAudio?.pause?.(); } catch {}
        activeCoughAudio = null;
        try { audioContext?.close?.(); } catch {}
        audioContext = null;
      },
      get enabled() { return enabled; },
      get status() { return currentStatus; },
      play,
      preview: play,
      scan,
      setEnabled,
    };
  };
  const soundMonitor = createSoundMonitor();

  const findPinnedSummaryToggle = () => {
    for (const button of document.querySelectorAll('button[aria-label]')) {
      if (pinnedSummaryLabel.test(button.getAttribute("aria-label") || "")) return button;
    }
    // Newer Codex builds renamed the pinned-summary control to the generic
    // “显示/隐藏侧边栏”. Distinguish it from the left navigation toggle by its
    // real top-right viewport position and ignore our cloned retro control.
    const genericSummaryLabel = /^(show\/hide sidebar|toggle sidebar visibility|显示\/隐藏侧边栏|顯示\/隱藏側邊欄)$/i;
    const candidates = [...document.querySelectorAll('button[aria-label]')].filter((button) => {
      if (!genericSummaryLabel.test(button.getAttribute("aria-label") || "")) return false;
      if (button.closest?.(`#${RETRO_SHELL_ID}`)) return false;
      const box = button.getBoundingClientRect?.();
      return box && box.width >= 20 && box.height >= 20 &&
        box.left > window.innerWidth * .65 && box.top >= 0 && box.top < 48;
    });
    return candidates.sort((left, right) =>
      right.getBoundingClientRect().left - left.getBoundingClientRect().left)[0] || null;
  };

  const findLeftSidebarToggle = () => {
    for (const button of document.querySelectorAll('button[aria-label]')) {
      const label = button.getAttribute("aria-label") || "";
      if (showSidebarLabel.test(label) || hideSidebarLabel.test(label)) return button;
    }
    return null;
  };

  const statusLabels = {
    idle: "在线 · 随时待命",
    running: "正在工作…",
    approval: "需要你的确认",
    completed: "任务已完成",
    offline: "连接已断开",
  };
  const weeklyUsageStorageKey = "codex-qq-skin-weekly-remaining";
  const profileActionPattern = /^(open profile menu|open account menu|打开个人资料菜单|打开账户菜单|開啟個人資料選單|開啟帳戶選單|プロフィールメニューを開く|프로필 메뉴 열기)$/i;
  const weeklyPattern = /(本周|每周|每週|一周|一週|week|weekly)/i;
  const remainingPattern = /(?:剩余|剩餘)\s*(\d+(?:\.\d+)?)\s*%|(?:remaining|left)\s*:?\s*(\d+(?:\.\d+)?)\s*%/i;

  const findReactWeeklyUsage = () => {
    const firstFiber = window.__codexRoot?._internalRoot?.current;
    if (!firstFiber || typeof firstFiber !== "object") return null;
    const visited = new WeakSet();
    const pending = [firstFiber];
    let scanned = 0;
    while (pending.length && scanned < 20000) {
      const fiber = pending.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      for (const props of [fiber.memoizedProps, fiber.alternate?.memoizedProps]) {
        const rateLimit = props?.rateLimit;
        const windowData = rateLimit?.rate_limit?.primary_window;
        const windowSeconds = Number(windowData?.limit_window_seconds);
        const usedPercent = Number(windowData?.used_percent);
        if (
          Number.isFinite(windowSeconds) && windowSeconds >= 6 * 86400 && windowSeconds <= 8 * 86400 &&
          Number.isFinite(usedPercent)
        ) {
          const accountIdentity = String(rateLimit.account_id || rateLimit.user_id || "").trim();
          return {
            accountIdentity,
            remaining: clamp(Math.round(100 - usedPercent), 0, 100),
          };
        }
      }
      if (fiber.sibling) pending.push(fiber.sibling);
      if (fiber.child) pending.push(fiber.child);
    }
    return null;
  };

  const findWeeklyRemaining = () => {
    for (const node of document.querySelectorAll('[role="status"], [role="alert"]')) {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!weeklyPattern.test(text)) continue;
      const match = remainingPattern.exec(text);
      const value = Number(match?.[1] ?? match?.[2]);
      if (Number.isFinite(value)) return clamp(Math.round(value), 0, 100);
    }
    for (const progress of document.querySelectorAll("progress")) {
      let host = progress;
      let text = "";
      for (let depth = 0; host && depth < 6; depth += 1, host = host.parentElement) {
        text = String(host.textContent || "").replace(/\s+/g, " ").trim();
        if (weeklyPattern.test(text)) break;
      }
      if (!weeklyPattern.test(text)) continue;
      const match = remainingPattern.exec(text);
      const parsed = Number(match?.[1] ?? match?.[2]);
      if (Number.isFinite(parsed)) return clamp(Math.round(parsed), 0, 100);
      const maximum = Number(progress.max || progress.getAttribute?.("max") || 100);
      const used = Number(progress.value ?? progress.getAttribute?.("value"));
      if (Number.isFinite(maximum) && maximum > 0 && Number.isFinite(used)) {
        return clamp(Math.round(100 - used / maximum * 100), 0, 100);
      }
    }
    return null;
  };

  const findCurrentAccountIdentity = () => {
    const profileButton = [...document.querySelectorAll("button[aria-label]")].find((button) =>
      profileActionPattern.test(String(button.getAttribute?.("aria-label") || "").trim()) &&
      String(button.textContent || "").trim());
    const visibleName = String(profileButton?.textContent || retroProfileParts?.name?.textContent || "")
      .replace(/\s+/g, " ").trim();
    return visibleName.slice(0, 120);
  };

  const weeklyUsageCacheKey = (accountIdentity) => accountIdentity
    ? `${weeklyUsageStorageKey}:${encodeURIComponent(accountIdentity.toLocaleLowerCase())}`
    : "";

  const syncWeeklyUsage = (node) => {
    if (!node) return;
    const reactUsage = findReactWeeklyUsage();
    const accountIdentity = reactUsage?.accountIdentity || findCurrentAccountIdentity();
    const accountCacheKey = weeklyUsageCacheKey(accountIdentity);
    let remaining = reactUsage?.remaining ?? findWeeklyRemaining();
    if (remaining != null) {
      if (accountCacheKey) {
        try { window.localStorage?.setItem(accountCacheKey, String(remaining)); } catch {}
      }
    } else if (accountCacheKey) {
      try {
        const saved = window.localStorage?.getItem(accountCacheKey);
        const cached = Number(saved);
        if (saved != null && Number.isFinite(cached)) remaining = clamp(Math.round(cached), 0, 100);
      } catch {}
    }
    // Version 1.6.1 stored one global value. It cannot safely be associated
    // with the account currently signed in, so never use it after migration.
    try { window.localStorage?.removeItem(weeklyUsageStorageKey); } catch {}
    node.textContent = remaining == null ? "本周剩余 --" : `本周剩余 ${remaining}%`;
    if (node.dataset) {
      node.dataset.level = remaining == null ? "unknown" : remaining <= 5 ? "critical" : remaining <= 20 ? "low" : "normal";
      node.dataset.account = accountIdentity;
    }
  };

  const openAvatarOverlay = () => {
    try {
      const result = window.electronBridge?.sendMessageFromView?.({ type: "avatar-overlay-open" });
      result?.catch?.(() => {});
      return Boolean(result !== undefined || window.electronBridge?.sendMessageFromView);
    } catch { return false; }
  };

  const toggleNativeTerminal = () => {
    const labelPattern = /(toggle bottom panel visibility|切换底部面板显示|切換底部面板顯示|顯示\/隱藏底部面板)/i;
    const candidates = [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
      .filter((button) => !button.closest?.(`#${COMPANION_ID}`) && labelPattern.test(button.getAttribute?.("aria-label") || ""));
    const visible = candidates.find((button) => {
      const box = button.getBoundingClientRect?.();
      if (!box) return true;
      const style = window.getComputedStyle?.(button);
      return box.width > 0 && box.height > 0 && box.left > 0 && box.top >= 0 &&
        box.right <= window.innerWidth && box.bottom <= window.innerHeight &&
        style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
    });
    const target = visible || candidates[0];
    target?.click?.();
    return Boolean(target);
  };

  const syncCompanionStatus = (status) => {
    const companion = companionParts?.companion;
    if (!companion) return;
    if (companion.dataset) companion.dataset.status = status;
    setTextContent(companionParts.statusText, statusLabels[status] || statusLabels.idle);
  };

  const companionRoomPhase = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "day";
    if (hour >= 18 && hour < 22) return "evening";
    return "night";
  };

  const roomEscape = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  const safeRoomUrl = (value, githubOnly = false) => {
    try {
      const url = new URL(String(value || ""));
      if (!["http:", "https:"].includes(url.protocol)) return "";
      if (githubOnly && url.hostname !== "github.com") return "";
      return url.href;
    } catch { return ""; }
  };

  const roomToast = (message) => {
    const toast = companionParts?.toast;
    if (!toast) return;
    setTextContent(toast, message);
    toast.classList?.add("is-visible");
    setTimeout(() => toast.classList?.remove("is-visible"), 2200);
  };

  const openRoomExternal = (value, githubOnly = false) => {
    const url = safeRoomUrl(value, githubOnly);
    if (!url) {
      roomToast("这个链接暂时不可用。");
      return false;
    }
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      roomToast("已在浏览器中打开。");
      return true;
    } catch {
      roomToast("无法打开浏览器，请稍后重试。");
      return false;
    }
  };

  const bindBlindBoxButtons = (content) => {
    content?.querySelectorAll?.(".qq-skin-blind-box-actions [data-room-action]").forEach((button) => {
      if (button.dataset.qqBlindBoxBound === "true") return;
      button.dataset.qqBlindBoxBound = "true";
      let pointerHandledAt = 0;
      const run = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        handleCompanionRoomAction(button.dataset.roomAction);
      };
      button.addEventListener?.("pointerup", (event) => {
        if (typeof event.button === "number" && event.button !== 0) return;
        pointerHandledAt = Date.now();
        run(event);
      });
      button.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() - pointerHandledAt < 600) return;
        run(event);
      });
    });
  };

  const persistBlindBox = () => {
    try { window.localStorage?.setItem(BLIND_BOX_STORAGE_KEY, JSON.stringify(companionBlindBox)); } catch {}
  };

  const currentBlindBoxProject = () => (Array.isArray(companionSnapshot?.github) ? companionSnapshot.github : [])
    .find((repo) => Number(repo.id) === Number(companionBlindBox.currentId)) || null;

  const syncBlindBoxDecor = () => {
    const companion = companionParts?.companion;
    if (!companion) return;
    companion.dataset.roomUnlocks = String(companionBlindBox.unlocked.length);
    companion.querySelectorAll("[data-room-decor]").forEach((decor) => {
      decor.classList?.toggle("is-unlocked", companionBlindBox.unlocked.includes(decor.dataset.roomDecor));
    });
  };

  const discoverBlindBoxProject = () => {
    const repos = Array.isArray(companionSnapshot?.github) ? companionSnapshot.github : [];
    if (!repos.length) return null;
    const currentId = Number(companionBlindBox.currentId) || 0;
    const recent = new Set(companionBlindBox.history.slice(-Math.max(1, repos.length - 2)));
    const avoided = new Set(companionBlindBox.avoidedIds);
    const avoidedLanguages = new Set(companionBlindBox.avoidedLanguages);
    let candidates = repos.filter((repo) => Number(repo.id) !== currentId && !recent.has(Number(repo.id)) &&
      !avoided.has(Number(repo.id)) && !avoidedLanguages.has(String(repo.language || "")));
    if (!candidates.length) {
      candidates = repos.filter((repo) => Number(repo.id) !== currentId && !avoided.has(Number(repo.id)));
    }
    if (!candidates.length) candidates = repos.filter((repo) => Number(repo.id) !== currentId);
    if (!candidates.length) candidates = repos;
    const project = candidates[Math.floor(Math.random() * candidates.length)];
    companionBlindBox.currentId = Number(project.id);
    companionBlindBox.history.push(Number(project.id));
    companionBlindBox.history = companionBlindBox.history.slice(-50);
    companionBlindBox.discoveries += 1;
    if (companionBlindBox.discoveries % 5 === 0) {
      const nextDecor = BLIND_BOX_DECOR.find((item) => !companionBlindBox.unlocked.includes(item));
      if (nextDecor) {
        companionBlindBox.unlocked.push(nextDecor);
        roomToast("连续发现 5 个项目：新摆件已解锁！");
      }
    }
    persistBlindBox();
    syncBlindBoxDecor();
    const companion = companionParts?.companion;
    if (companion?.dataset) {
      companion.dataset.roomMood = "reading";
      companion.dataset.roomDrawing = "true";
      setTimeout(() => {
        if (companion.dataset) {
          companion.dataset.roomMood = "";
          companion.dataset.roomDrawing = "false";
        }
      }, 900);
    }
    return project;
  };

  const renderCompanionRoomPanel = () => {
    const panel = companionParts?.panel;
    const title = companionParts?.panelTitle;
    const content = companionParts?.panelContent;
    if (!panel || !title || !content) return;
    panel.classList?.toggle("is-visible", companionRoomMode !== "room");
    if (companionRoomMode === "room") return;
    const empty = (message) => `<div class="qq-skin-room-empty">${roomEscape(message)}</div>`;

    if (companionRoomMode === "blindbox") {
      setTextContent(title, `GitHub 热门项目盲盒 · 已发现 ${companionBlindBox.discoveries}`);
      const project = currentBlindBoxProject();
      if (!project) {
        content.innerHTML = empty("机器人正在找一本合适的项目书……");
        return;
      }
      const favorite = companionBlindBox.favorites.includes(Number(project.id));
      content.innerHTML = `<article class="qq-skin-blind-box-card">
        <div class="qq-skin-blind-box-project">
          <h3>${roomEscape(project.name)}</h3>
          <p>${roomEscape(project.descriptionZh || "这是一个近期受到关注的开源项目，帮助开发者改善开发流程与自动化体验。")}</p>
        </div>
        <div class="qq-skin-blind-box-actions">
          <button type="button" data-room-action="favorite">${favorite ? "★ 已收藏" : "☆ 收藏"}</button>
          <button type="button" data-room-action="open-project">打开 GitHub</button>
          <button type="button" data-room-action="next-project">换一本</button>
          <button type="button" data-room-action="less-like-this">以后少推荐这种</button>
        </div>
        <small>再发现 ${5 - (companionBlindBox.discoveries % 5)} 个项目解锁下一件房间摆件</small>
      </article>`;
      bindBlindBoxButtons(content);
      return;
    }

    setTextContent(title, "伙伴房间设置");
    const motion = companionParts.companion.dataset.roomMotion !== "off";
    content.innerHTML = `<div class="qq-skin-room-settings">
      <button type="button" data-room-action="motion"><b>房间动态效果</b><span>${motion ? "已开启" : "已关闭"}</span></button>
      <p>收藏、减少同类推荐和摆件解锁进度只保存在本机。</p>
    </div>`;
  };

  const setCompanionRoomMode = (mode) => {
    companionRoomMode = ["room", "blindbox", "settings"].includes(mode) ? mode : "room";
    if (companionParts?.companion?.dataset) companionParts.companion.dataset.roomMode = companionRoomMode;
    renderCompanionRoomPanel();
  };

  const drawAndRevealBlindBox = () => {
    if (blindBoxRevealTimer) clearTimeout(blindBoxRevealTimer);
    setCompanionRoomMode("room");
    discoverBlindBoxProject();
    blindBoxRevealTimer = setTimeout(() => {
      blindBoxRevealTimer = null;
      setCompanionRoomMode("blindbox");
    }, 720);
  };

  const handleCompanionRoomAction = (action) => {
    if (action === "blindbox") {
      drawAndRevealBlindBox();
      return;
    }
    if (action === "settings") return setCompanionRoomMode("settings");
    if (action === "back") return setCompanionRoomMode("room");
    const companion = companionParts?.companion;
    if (!companion?.dataset) return;
    if (action === "favorite") {
      const project = currentBlindBoxProject();
      if (!project) return;
      const id = Number(project.id);
      if (companionBlindBox.favorites.includes(id)) {
        companionBlindBox.favorites = companionBlindBox.favorites.filter((item) => item !== id);
        roomToast("已取消收藏。");
      } else {
        companionBlindBox.favorites.push(id);
        roomToast("已收藏到本机。");
      }
      persistBlindBox();
      renderCompanionRoomPanel();
    } else if (action === "open-project") {
      const project = currentBlindBoxProject();
      if (project) openRoomExternal(project.url, true);
    } else if (action === "next-project") {
      drawAndRevealBlindBox();
    } else if (action === "less-like-this") {
      const project = currentBlindBoxProject();
      if (!project) return;
      companionBlindBox.avoidedIds.push(Number(project.id));
      if (project.language && project.language !== "Other") companionBlindBox.avoidedLanguages.push(String(project.language));
      companionBlindBox.avoidedIds = [...new Set(companionBlindBox.avoidedIds)].slice(-100);
      companionBlindBox.avoidedLanguages = [...new Set(companionBlindBox.avoidedLanguages)].slice(-20);
      roomToast("记住了，以后会少推荐这一类。");
      drawAndRevealBlindBox();
    } else if (action === "motion") {
      companion.dataset.roomMotion = companion.dataset.roomMotion === "off" ? "on" : "off";
      try { window.localStorage?.setItem("codex-qq-skin-room-motion", companion.dataset.roomMotion); } catch {}
      renderCompanionRoomPanel();
    } else if (action === "robot") {
      const moods = ["happy", "curious", "sleepy", "excited"];
      const mood = moods[Math.floor(Math.random() * moods.length)];
      companion.dataset.roomMood = mood;
      roomToast({ happy: "今天也一起把 Bug 清空！", curious: "这个项目看起来很有意思。", sleepy: "唔……让我眯三秒。", excited: "出发！下一个任务！" }[mood]);
      setTimeout(() => { companion.dataset.roomMood = ""; }, 2600);
    } else if (action === "window") {
      const phases = ["morning", "day", "evening", "night"];
      companion.dataset.roomPhase = phases[(phases.indexOf(companion.dataset.roomPhase) + 1) % phases.length];
      roomToast("窗外的时间变了。");
    } else if (action === "break") {
      if (companionBreakTimer) clearTimeout(companionBreakTimer);
      companion.dataset.roomMood = "break";
      roomToast("咖啡休息开始：5 分钟。");
      companionBreakTimer = setTimeout(() => {
        companionBreakTimer = null;
        companion.dataset.roomMood = "";
        roomToast("休息结束，回来继续创造吧。");
      }, 5 * 60 * 1000);
    } else if (action === "terminal") toggleNativeTerminal();
  };

  const ensureCompanion = () => {
    let companion = document.getElementById(COMPANION_ID);
    if (!companion || companion.parentElement !== document.body) {
      companion?.remove();
      companion = document.createElement("section");
      companion.id = COMPANION_ID;
      companion.setAttribute("aria-label", "Codex 伙伴");
      companion.innerHTML = `
        <div class="qq-skin-companion-title">
          <span>Codex 伙伴</span><button type="button" data-room-action="settings" aria-label="伙伴房间设置">⚙</button><i></i>
        </div>
        <div class="qq-skin-companion-stage">
          <div class="qq-skin-room-window" data-room-action="window" role="button" tabindex="0" aria-label="切换窗外时间">
            <span class="qq-skin-room-sky"></span>
            <span class="qq-skin-room-moon"></span>
            <span class="qq-skin-room-cloud qq-skin-room-cloud-a"></span>
            <span class="qq-skin-room-cloud qq-skin-room-cloud-b"></span>
          </div>
          <div class="qq-skin-room-wall-note" aria-hidden="true"><b>CODEX</b><span>BUILD · TEST · SHIP</span></div>
          <div class="qq-skin-room-shelf" data-room-action="blindbox" role="button" tabindex="0" aria-label="抽一个项目盲盒">
            <i></i><i></i><i></i><b></b>
          </div>
          <div class="qq-skin-room-lamp" data-room-action="blindbox" role="button" tabindex="0" aria-label="抽一个项目盲盒"><i></i><b></b></div>
          <div class="qq-skin-room-character" data-room-action="robot" role="button" tabindex="0" aria-label="和 Codex 伙伴互动">
            <img class="qq-skin-pet-image" alt="" draggable="false">
            <span class="qq-skin-room-approval-sign">需要确认</span>
          </div>
          <div class="qq-skin-room-drawn-book" aria-hidden="true"><i></i><b>?</b></div>
          <div class="qq-skin-room-monitor" data-room-action="blindbox" role="button" tabindex="0" aria-label="抽一个项目盲盒">
            <i class="qq-skin-room-screen"><b>&gt;_</b><span></span></i>
            <i class="qq-skin-room-monitor-stand"></i>
          </div>
          <div class="qq-skin-room-desk" aria-hidden="true">
            <span class="qq-skin-room-keyboard" data-room-action="terminal" role="button" tabindex="0" aria-label="打开终端"></span>
            <span class="qq-skin-room-mug" data-room-action="break" role="button" tabindex="0" aria-label="开始五分钟休息"></span>
          </div>
          <div class="qq-skin-room-plant" data-room-action="blindbox" role="button" tabindex="0" aria-label="抽一个项目盲盒"><i></i><i></i><i></i><b></b></div>
          <div class="qq-skin-room-decor qq-skin-room-decor-globe" data-room-decor="globe" aria-hidden="true">◉</div>
          <div class="qq-skin-room-decor qq-skin-room-decor-rocket" data-room-decor="rocket" aria-hidden="true">▲</div>
          <div class="qq-skin-room-decor qq-skin-room-decor-trophy" data-room-decor="trophy" aria-hidden="true">★</div>
          <div class="qq-skin-room-decor qq-skin-room-decor-cat" data-room-decor="cat" aria-hidden="true">ฅ</div>
          <div class="qq-skin-room-confetti" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="qq-skin-room-offline" aria-hidden="true">Z z z</div>
          <div class="qq-skin-room-toast" aria-live="polite"></div>
          <div class="qq-skin-room-panel">
            <div class="qq-skin-room-panel-head"><button type="button" data-room-action="back">‹</button><b></b></div>
            <div class="qq-skin-room-panel-content"></div>
          </div>
        </div>
        <div class="qq-skin-companion-actions">
          <button type="button" data-companion-action="pet">🐾 打开宠物</button>
          <button type="button" data-companion-action="terminal">⌨ 终端</button>
          <button type="button" data-companion-action="sound"></button>
        </div>
        <div class="qq-skin-pet-status"><i></i><span>在线 · 随时待命</span><b class="qq-skin-weekly-usage">本周剩余 --</b></div>`;
      document.body.appendChild(companion);
      companionParts = null;
    }
    if (companion.dataset) {
      companion.dataset.roomPhase = companionRoomPhase();
      companion.dataset.roomMode = companionRoomMode;
      try { companion.dataset.roomMotion = window.localStorage?.getItem("codex-qq-skin-room-motion") === "off" ? "off" : "on"; }
      catch { companion.dataset.roomMotion = "on"; }
    }
    if (!companionParts || companionParts.companion !== companion) {
      companionParts = {
        companion,
        image: companion.querySelector(".qq-skin-pet-image"),
        petButton: companion.querySelector('[data-companion-action="pet"]'),
        terminalButton: companion.querySelector('[data-companion-action="terminal"]'),
        soundButton: companion.querySelector('[data-companion-action="sound"]'),
        statusText: companion.querySelector(".qq-skin-pet-status span"),
        weeklyUsage: companion.querySelector(".qq-skin-weekly-usage"),
        panel: companion.querySelector(".qq-skin-room-panel"),
        panelTitle: companion.querySelector(".qq-skin-room-panel-head b"),
        panelContent: companion.querySelector(".qq-skin-room-panel-content"),
        toast: companion.querySelector(".qq-skin-room-toast"),
      };
      const bindAction = (button, action, label) => {
        if (!button?.dataset || button.dataset.qqCompanionBound === "true" || typeof button.addEventListener !== "function") return;
        button.dataset.qqCompanionBound = "true";
        button.setAttribute?.("aria-label", label);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          action();
        });
      };
      bindAction(companionParts.petButton, openAvatarOverlay, "打开 Codex 宠物");
      bindAction(companionParts.terminalButton, toggleNativeTerminal, "显示或隐藏终端");
      if (companion.dataset.qqRoomBound !== "true" && typeof companion.addEventListener === "function") {
        companion.dataset.qqRoomBound = "true";
        companion.addEventListener("click", (event) => {
          const target = event.target?.closest?.("[data-room-action]");
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          handleCompanionRoomAction(target.dataset.roomAction);
        });
        companion.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          const target = event.target?.closest?.("[data-room-action]");
          if (!target) return;
          event.preventDefault();
          handleCompanionRoomAction(target.dataset.roomAction);
        });
      }
    }
    if (companionParts.image && companionParts.image.src !== petUrl) companionParts.image.src = petUrl;
    soundMonitor.bindButton(companionParts.soundButton);
    soundMonitor.bindStatus(syncCompanionStatus);
    syncCompanionStatus(soundMonitor.status);
    syncWeeklyUsage(companionParts.weeklyUsage);
    syncBlindBoxDecor();
    renderCompanionRoomPanel();
    return companion;
  };

  const ensureRightTray = () => {
    let tray = document.getElementById(RIGHT_TRAY_ID);
    if (!tray || tray.parentElement !== document.body) {
      tray?.remove();
      tray = document.createElement("div");
      tray.id = RIGHT_TRAY_ID;
      tray.setAttribute("aria-hidden", "true");
      document.body.appendChild(tray);
    }
    return tray;
  };

  const formatTokenCount = (value) => {
    const number = Math.max(0, Number(value) || 0);
    if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 0 : 1)}B`;
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 100_000_000 ? 0 : 1)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
    return String(Math.round(number));
  };

  const setUsageMode = (mode) => {
    usageMode = mode === "native" ? "native" : "stats";
    try { window.localStorage?.setItem(USAGE_MODE_KEY, usageMode); } catch {}
    const root = document.documentElement;
    setAttribute(root, "data-qq-usage-mode", usageMode);
    document.getElementById(USAGE_PANEL_ID)?.classList?.toggle("is-visible", usageMode === "stats");
    document.getElementById(USAGE_TOGGLE_ID)?.classList?.toggle("is-visible", usageMode === "native");
  };

  const visibleUsageTokens = (value) => {
    const effective = Math.max(0, Number(value?.effectiveTokens) || 0);
    if (usageNetMode) return effective;
    const total = Number(value?.totalTokens);
    return Number.isFinite(total) && total >= 0
      ? total
      : effective + Math.max(0, Number(value?.cachedInputTokens) || 0);
  };

  const setUsageNetMode = (enabled) => {
    usageNetMode = Boolean(enabled);
    try { window.localStorage?.setItem(USAGE_NET_MODE_KEY, String(usageNetMode)); } catch {}
    renderUsageSnapshot();
  };

  const renderUsageSnapshot = () => {
    const parts = usageParts;
    if (!parts?.panel) return;
    const snapshot = usageSnapshot && typeof usageSnapshot === "object" ? usageSnapshot : { status: "error" };
    const status = ["loading", "indexing", "empty", "ready", "error"].includes(snapshot.status)
      ? snapshot.status : "error";
    if (parts.panel.dataset) parts.panel.dataset.usageStatus = status;
    setAttribute(document.documentElement, "data-qq-usage-state", status);

    const totals = snapshot.totals || {};
    const lifetime = totals.lifetime || {};
    const growth = snapshot.growth || {};
    setTextContent(parts.today, formatTokenCount(visibleUsageTokens(totals.today)));
    setTextContent(parts.week, formatTokenCount(visibleUsageTokens(totals.week)));
    setTextContent(parts.lifetime, formatTokenCount(visibleUsageTokens(lifetime)));
    setTextContent(parts.level, `Lv.${Math.max(0, Math.round(Number(growth.level) || 0))}`);
    if (parts.icons) {
      const icons = Array.isArray(growth.icons) && growth.icons.length
        ? growth.icons.slice(0, 12)
        : [{ kind: "empty", symbol: "☆" }];
      parts.icons.innerHTML = icons.map((item) =>
        `<i data-kind="${["crown", "sun", "moon", "star"].includes(item.kind) ? item.kind : "empty"}">${item.symbol || "☆"}</i>`
      ).join("");
    }
    const remaining = Math.max(0, Number(growth.remaining) || 0);
    setTextContent(parts.progressText, growth.level == null
      ? "正在计算成长值"
      : `距离 Lv.${Math.max(0, Math.round(Number(growth.level) || 0)) + 1} 还差 ${remaining.toFixed(remaining % 1 ? 2 : 0)} 成长值`);
    parts.progressFill?.style?.setProperty?.("width", `${clamp(Math.round(Number(growth.percent) || 0), 0, 100)}%`);
    setTextContent(parts.activity,
      `活跃 ${Math.max(0, Number(snapshot.activity?.activeDays) || 0)} 天 · 连续 ${Math.max(0, Number(snapshot.activity?.streakDays) || 0)} 天`);
    setTextContent(parts.breakdown,
      `输入 ${formatTokenCount(lifetime.inputTokens)} · 输出 ${formatTokenCount(lifetime.outputTokens)} · 推理 ${formatTokenCount(lifetime.reasoningOutputTokens)} · 缓存 ${formatTokenCount(lifetime.cachedInputTokens)}`);
    if (parts.netToggle) {
      setAttribute(parts.netToggle, "aria-checked", usageNetMode ? "true" : "false");
      setAttribute(parts.netToggle, "title", usageNetMode
        ? "当前已排除缓存 Token，点击切换为总用量"
        : "当前包含缓存 Token，开启后只看净用量");
      parts.netToggle.classList?.toggle?.("is-on", usageNetMode);
    }

    if (parts.chart) {
      const chart = Array.isArray(snapshot.chart) ? snapshot.chart.slice(-7) : [];
      const maximum = Math.max(1, ...chart.map(visibleUsageTokens));
      parts.chart.innerHTML = chart.length
        ? chart.map((item) => {
          const value = visibleUsageTokens(item);
          const height = value > 0 ? Math.max(9, Math.round(value / maximum * 100)) : 4;
          const day = String(item?.date || "").slice(5);
          return `<i style="--usage-bar:${height}%" title="${day} · ${formatTokenCount(value)} token"><span></span></i>`;
        }).join("")
        : "<i style=\"--usage-bar:4%\"><span></span></i>".repeat(7);
    }

    let message = "";
    if (status === "loading") message = "正在读取本地 Codex 统计…";
    else if (status === "indexing") {
      const completed = Number(snapshot.indexing?.completed) || 0;
      const total = Number(snapshot.indexing?.total) || 0;
      message = total ? `正在建立本地索引 ${completed}/${total}…` : "正在建立本地统计索引…";
    } else if (status === "empty") message = "完成一次 Codex 任务后，这里会出现 token 统计。";
    else if (status === "error") message = snapshot.totals
      ? "本次更新失败，正在显示上次的本地数据。"
      : "暂时无法读取本地统计，皮肤其他功能不受影响。";
    setTextContent(parts.message, message);
    parts.message?.classList?.toggle?.("is-visible", Boolean(message));
    const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
    const timeText = generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "--:--";
    setTextContent(parts.updated, `本机统计 · 更新于 ${timeText}`);
    if (parts.refreshButton) {
      parts.refreshButton.disabled = status === "loading" || status === "indexing";
      parts.refreshButton.textContent = status === "indexing" ? "索引中" : "刷新";
    }
  };

  const setUsageSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object" || Number(snapshot.schemaVersion) !== 1) return false;
    usageSnapshot = snapshot;
    window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__ = snapshot;
    renderUsageSnapshot();
    return true;
  };

  const setCompanionSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object" || Number(snapshot.schemaVersion) !== 1) return false;
    companionSnapshot = snapshot;
    window.__CODEX_QQ_SKIN_COMPANION_SNAPSHOT__ = snapshot;
    renderCompanionRoomPanel();
    return true;
  };

  const ensureUsagePanel = () => {
    let panel = document.getElementById(USAGE_PANEL_ID);
    if (!panel || panel.parentElement !== document.body) {
      panel?.remove();
      panel = document.createElement("section");
      panel.id = USAGE_PANEL_ID;
      panel.setAttribute("aria-label", "Codex 成长中心");
      panel.innerHTML = `
        <div class="qq-skin-usage-title"><span>Codex 成长中心 <small>本机</small></span><button type="button" data-usage-action="native">资料</button></div>
        <div class="qq-skin-usage-level">
          <img alt="" draggable="false">
          <div class="qq-skin-usage-level-main"><b></b><span class="qq-skin-level-icons"></span><small></small></div>
          <button class="qq-skin-usage-net-toggle" type="button" role="switch" aria-checked="false" data-usage-action="net"><span>净用量</span><i></i></button>
        </div>
        <div class="qq-skin-level-progress"><i></i></div>
        <div class="qq-skin-usage-metrics">
          <div><b data-usage-metric="today">0</b><span>今日 Token</span></div>
          <div><b data-usage-metric="week">0</b><span>近 7 天</span></div>
          <div><b data-usage-metric="lifetime">0</b><span>历史累计</span></div>
        </div>
        <div class="qq-skin-usage-chart" aria-label="近七天 token 趋势"></div>
        <div class="qq-skin-usage-activity"></div>
        <div class="qq-skin-usage-breakdown"></div>
        <div class="qq-skin-usage-message"></div>
        <div class="qq-skin-usage-footer"><span></span><button type="button" data-usage-action="refresh">刷新</button></div>`;
      document.body.appendChild(panel);
      usageParts = null;
    }
    if (!usageParts || usageParts.panel !== panel) {
      usageParts = {
        panel,
        image: panel.querySelector(".qq-skin-usage-level img"),
        level: panel.querySelector(".qq-skin-usage-level-main b"),
        icons: panel.querySelector(".qq-skin-level-icons"),
        progressText: panel.querySelector(".qq-skin-usage-level-main small"),
        progressFill: panel.querySelector(".qq-skin-level-progress i"),
        today: panel.querySelector('[data-usage-metric="today"]'),
        week: panel.querySelector('[data-usage-metric="week"]'),
        lifetime: panel.querySelector('[data-usage-metric="lifetime"]'),
        chart: panel.querySelector(".qq-skin-usage-chart"),
        activity: panel.querySelector(".qq-skin-usage-activity"),
        breakdown: panel.querySelector(".qq-skin-usage-breakdown"),
        message: panel.querySelector(".qq-skin-usage-message"),
        updated: panel.querySelector(".qq-skin-usage-footer span"),
        nativeButton: panel.querySelector('[data-usage-action="native"]'),
        refreshButton: panel.querySelector('[data-usage-action="refresh"]'),
        netToggle: panel.querySelector('[data-usage-action="net"]'),
      };
      usageParts.nativeButton?.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setUsageMode("native");
      });
      usageParts.refreshButton?.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try { window.localStorage?.setItem(USAGE_REFRESH_KEY, String(Date.now())); } catch {}
        if (usageParts.refreshButton) {
          usageParts.refreshButton.disabled = true;
          usageParts.refreshButton.textContent = "刷新中";
        }
      });
      usageParts.netToggle?.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setUsageNetMode(!usageNetMode);
      });
    }
    if (usageParts.image && usageParts.image.src !== qqAvatarUrl) usageParts.image.src = qqAvatarUrl;
    renderUsageSnapshot();

    let toggle = document.getElementById(USAGE_TOGGLE_ID);
    if (!toggle || toggle.parentElement !== document.body) {
      toggle?.remove();
      toggle = document.createElement("button");
      toggle.id = USAGE_TOGGLE_ID;
      toggle.type = "button";
      toggle.textContent = "成长统计";
      toggle.setAttribute("aria-label", "返回 Codex 成长统计");
      toggle.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setUsageMode("stats");
      });
      document.body.appendChild(toggle);
    }
    setUsageMode(usageMode);
    return { panel, toggle };
  };

  const ensureHomePet = (home) => {
    let pet = document.getElementById(HOME_PET_ID);
    if (!home) {
      pet?.remove();
      return null;
    }
    // Matches the hero card targeted by `.qq-skin-home > div > div > div` styles.
    const hero = home.querySelector(":scope > div:first-child > div:first-child > div:first-child");
    if (!hero) {
      pet?.remove();
      return null;
    }
    if (!pet || pet.parentElement !== hero) {
      pet?.remove();
      pet = document.createElement("img");
      pet.id = HOME_PET_ID;
      pet.className = "qq-skin-home-pet";
      pet.alt = "";
      pet.draggable = false;
      pet.setAttribute("aria-hidden", "true");
      hero.appendChild(pet);
    }
    if (pet.src !== petUrl) pet.src = petUrl;
    return pet;
  };

  /* Mark the shared nav-section-title row (toggle + …/+) so 置顶/项目/任务 bars
     all paint at the same width. The toggle itself sits in a narrower flex-1. */
  const ensureSidebarSectionBars = () => {
    const aside = document.querySelector("aside.app-shell-left-panel");
    const live = new Set();
    if (!aside) {
      document.querySelectorAll(".qq-skin-section-bar").forEach((node) =>
        node.classList.remove("qq-skin-section-bar"));
      return;
    }
    const asideWidth = typeof aside.getBoundingClientRect === "function"
      ? aside.getBoundingClientRect().width : 0;
    for (const toggle of aside.querySelectorAll("[data-app-action-sidebar-section-toggle]")) {
      const titled = toggle.closest('[class*="nav-section-title"]');
      let row = titled || toggle.parentElement;
      let best = row;
      while (row && aside.contains(row) && row !== aside) {
        const width = typeof row.getBoundingClientRect === "function"
          ? row.getBoundingClientRect().width : 0;
        if (width >= Math.max(asideWidth - 2, 0)) {
          // Prefer the titled row over the outer px-row-x padding wrapper when
          // both are full-bleed; painting px-row-x would cover the list below.
          if (!titled || row === titled || width < asideWidth) best = row;
          else best = titled;
          break;
        }
        if (
          width > 0 &&
          width >= (typeof best?.getBoundingClientRect === "function"
            ? best.getBoundingClientRect().width : 0)
        ) {
          best = row;
        }
        row = row.parentElement;
      }
      best = titled || best;
      if (!best || best === aside) continue;
      best.classList.add("qq-skin-section-bar");
      live.add(best);
    }
    for (const node of aside.querySelectorAll(".qq-skin-section-bar")) {
      if (!live.has(node)) node.classList.remove("qq-skin-section-bar");
    }
  };

  const findRetroTitle = () => {
    const header = document.querySelector("main.main-surface > header.app-header-tint");
    const preferred = header
      ? [...header.querySelectorAll("h1, h2, [data-testid*='title'], [class*='truncate']")]
      : [];
    for (const node of preferred) {
      const value = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (value.length >= 2 && value.length <= 80) return value;
    }
    return THEME.name || "经典 Codex 三栏";
  };

  const ensureRetroShell = () => {
    let retroShell = document.getElementById(RETRO_SHELL_ID);
    if (
      !retroShell || retroShell.parentElement !== document.body ||
      !retroShell.querySelector(".dream-retro-toolbar") ||
      !retroShell.querySelector('.dream-retro-toolbar button[data-retro-action="new-task"]') ||
      !retroShell.querySelector(".dream-retro-native-controls")
    ) {
      retroShell?.remove();
      retroShell = document.createElement("div");
      retroShell.id = RETRO_SHELL_ID;
      retroShell.innerHTML = `
        <div class="dream-retro-titlebar">
          <img class="dream-retro-title-penguin" alt="" draggable="false">
          <strong></strong>
        </div>
        <div class="dream-retro-toolbar" role="toolbar" aria-label="Codex 快捷导航">
          <button type="button" data-retro-action="new-task">📝 新建任务</button>
          <button type="button" data-retro-action="scheduled">🗓 已安排</button><i></i>
          <button type="button" data-retro-action="plugins">🧩 插件</button>
          <button type="button" data-retro-action="skills">🛠 技能</button>
          <button type="button" data-retro-action="sites">🌐 站点</button>
          <button type="button" data-retro-action="pull-requests">↗ 拉取请求</button>
          <button type="button" data-retro-action="chat">💬 聊天</button>
          <span class="dream-retro-native-controls"></span>
        </div>
        <div class="dream-retro-body-frame"></div>`;
      document.body.appendChild(retroShell);
      retroShellParts = null;
    }
    if (!retroShellParts || retroShellParts.retroShell !== retroShell) {
      retroShellParts = {
        retroShell,
        title: retroShell.querySelector(".dream-retro-titlebar strong"),
        penguin: retroShell.querySelector(".dream-retro-title-penguin"),
        controls: retroShell.querySelector(".dream-retro-native-controls"),
      };
    }
    if (retroShellParts.penguin && retroShellParts.penguin.src !== qqAvatarUrl) {
      retroShellParts.penguin.src = qqAvatarUrl;
    }
    setTextContent(retroShellParts.title, `Codex 2007 - ${findRetroTitle()}`);
    return retroShell;
  };

  const retroActionMatchers = {
    "new-task": { text: /^(新建任务|new task)$/i },
    scheduled: { text: /^(已安排|scheduled)$/i },
    plugins: { text: /^(插件|plugins?)$/i },
    skills: { text: /^(技能|skills?)$/i },
    sites: { text: /^(站点|sites?)$/i },
    "pull-requests": { text: /^(拉取请求|pull requests?)$/i },
    chat: { text: /^(聊天|chat)$/i, aria: /^(quick chat|快速聊天|快捷聊天)$/i },
  };

  const findNativeRetroAction = (action) => {
    const matcher = retroActionMatchers[action];
    const isPluginTab = action === "plugins" || action === "skills";
    if (isPluginTab && matcher) {
      const tabs = [...document.querySelectorAll('div[role="group"] button')];
      const nativeTab = tabs.find((candidate) => {
        if (candidate.disabled || candidate.closest?.(`#${RETRO_SHELL_ID}`)) return false;
        const groupText = String(candidate.parentElement?.textContent || "").replace(/\s+/g, "").toLowerCase();
        const text = String(candidate.textContent || "").replace(/\s+/g, " ").trim();
        const box = candidate.getBoundingClientRect?.();
        return Boolean(
          box && box.width >= 8 && box.height >= 8 &&
          /插件|plugins?/.test(groupText) && /技能|skills?/.test(groupText) &&
          matcher.text?.test(text)
        );
      });
      if (nativeTab) return nativeTab;
      if (action === "skills") return null;
    }
    const root = document.querySelector("aside.app-shell-left-panel");
    if (!matcher || !root) return null;
    const candidates = [...root.querySelectorAll("button, a")];
    return candidates.find((candidate) => {
      if (candidate.disabled || candidate.closest?.(`#${RETRO_SHELL_ID}`)) return false;
      const text = String(candidate.textContent || "").replace(/\s+/g, " ").trim();
      const aria = String(candidate.getAttribute?.("aria-label") || "").trim();
      const box = candidate.getBoundingClientRect?.();
      if (!box || box.width < 8 || box.height < 8) return false;
      return Boolean(matcher.text?.test(text) || matcher.aria?.test(aria));
    }) || null;
  };

  const syncRetroToolbarActions = () => {
    const toolbar = document.querySelector(`#${RETRO_SHELL_ID} .dream-retro-toolbar`);
    if (!toolbar) return;
    for (const button of toolbar.querySelectorAll("button[data-retro-action]")) {
      const action = button.dataset.retroAction;
      const target = findNativeRetroAction(action);
      const fallback = action === "skills" ? findNativeRetroAction("plugins") : null;
      button.disabled = !(target || fallback);
      button.setAttribute("aria-disabled", target || fallback ? "false" : "true");
      if (button.dataset.retroActionBound === "true") continue;
      button.dataset.retroActionBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = findNativeRetroAction(action);
        if (current) {
          current.click();
          return;
        }
        if (action !== "skills") return;
        findNativeRetroAction("plugins")?.click();
        let attempts = 0;
        const openSkills = () => {
          const skills = findNativeRetroAction("skills");
          if (skills) {
            skills.click();
            return;
          }
          attempts += 1;
          if (attempts < 20) setTimeout(openSkills, 50);
        };
        setTimeout(openSkills, 50);
      });
    }
  };

  const syncRetroWindowControls = () => {
    for (const button of document.querySelectorAll(".dream-retro-window-control")) {
      button.classList.remove(
        "dream-retro-window-control", "dream-retro-control-summary",
        "dream-retro-control-bottom", "dream-retro-control-sidebar",
      );
    }
    const labels = [
      pinnedSummaryLabel,
      /^(toggle bottom panel visibility|切换底部面板显示|顯示\/隱藏底部面板)$/i,
      /^(toggle sidebar visibility|显示\/隐藏侧边栏|顯示\/隱藏側邊欄)$/i,
    ];
    const selected = [];
    for (const button of document.querySelectorAll('button[aria-label]')) {
      if (typeof button.closest === "function" && button.closest(`#${RETRO_SHELL_ID}`)) continue;
      if (typeof button.getBoundingClientRect !== "function") continue;
      const box = button.getBoundingClientRect();
      const label = button.getAttribute("aria-label") || "";
      if (
        box.width >= 20 && box.height >= 20 && box.x > window.innerWidth * .65 && box.y < 48 &&
        labels.some((pattern) => pattern.test(label))
      ) selected.push(button);
    }
    selected.sort((left, right) => left.getBoundingClientRect().x - right.getBoundingClientRect().x);
    const host = retroShellParts?.controls;
    if (!host?.dataset || typeof host.replaceChildren !== "function") return;
    const signature = selected.map((button) => button.getAttribute("aria-label") || "").join("|");
    if (host.dataset.controlSignature === signature) return;
    host.replaceChildren();
    host.dataset.controlSignature = signature;
    for (const original of selected) {
      const clone = original.cloneNode(true);
      clone.removeAttribute("id");
      clone.classList.add("dream-retro-cloned-control");
      clone.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        original.click();
      });
      host.appendChild(clone);
    }
  };

  const ensureRetroProfile = () => {
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    if (!sidebar || typeof sidebar.getBoundingClientRect !== "function") return null;
    const sidebarBox = sidebar.getBoundingClientRect();
    const buttons = [...sidebar.querySelectorAll("button")];
    const isVisibleFooterButton = (button) => {
      if (typeof button.getBoundingClientRect !== "function") return false;
      const box = button.getBoundingClientRect();
      const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
      return box.width > 120 && box.height > 16 &&
        box.top >= sidebarBox.top && box.bottom <= sidebarBox.bottom + 2 &&
        box.bottom > sidebarBox.bottom - 120 && text.length >= 2 && text.length <= 48;
    };
    const profileButton = buttons.find((button) =>
      profileActionPattern.test(String(button.getAttribute?.("aria-label") || "").trim()) &&
      isVisibleFooterButton(button)) || buttons.find(isVisibleFooterButton);
    const host = profileButton?.closest('[class*="container-type"]') || profileButton?.parentElement;
    if (!host) return null;
    for (const stale of document.querySelectorAll(".dream-retro-profile-host")) {
      if (stale !== host) stale.classList.remove("dream-retro-profile-host");
    }
    host.classList.add("dream-retro-profile-host");
    let profile = document.getElementById(RETRO_PROFILE_ID);
    if (!profile || profile.parentElement !== host) {
      profile?.remove();
      profile = document.createElement("section");
      profile.id = RETRO_PROFILE_ID;
      profile.setAttribute("aria-hidden", "true");
      profile.innerHTML = `
        <img alt="" draggable="false">
        <div><strong></strong><span><i></i> 在线 <b>▾</b></span></div>`;
      host.appendChild(profile);
      retroProfileParts = null;
    }
    if (!retroProfileParts || retroProfileParts.profile !== profile) {
      retroProfileParts = {
        profile,
        image: profile.querySelector("img"),
        name: profile.querySelector("strong"),
      };
    }
    const name = String(profileButton.textContent || "Codex 用户").replace(/\s+/g, " ").trim();
    if (retroProfileParts.image && retroProfileParts.image.src !== qqAvatarUrl) {
      retroProfileParts.image.src = qqAvatarUrl;
    }
    setTextContent(retroProfileParts.name, name);
    return profile;
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    // Include the active product stylesheet only. Keeping custom-skin.css out of
    // QQ mode prevents leftover/ungated wallpaper rules from painting the upload.
    const modeRevision = `${STYLE_REVISION}:${skinMode}`;
    const nextText = skinMode === "custom"
      ? `${cssText}\n${customCssText}`
      : skinMode === "qq"
        ? cssText
        : "";
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamSkinStyleRevision !== modeRevision) {
      style.textContent = nextText;
    }
    style.dataset.dreamSkinVersion = VERSION;
    style.dataset.dreamSkinStyleRevision = modeRevision;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    if (skinMode === "qq") forceNativeLightForQQ();
    else restoreNativeAppearance();
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setAttribute(root, "data-dream-platform", /Win/i.test(window.navigator?.platform || window.navigator?.userAgent || "") ? "windows" : "other");
    // Hard-isolate art variables: never leave the other mode's wallpaper URL on :root.
    if (skinMode === "qq") {
      setStyleProperty(root, "--qq-skin-art", `url("${qqArtUrl}")`);
      setStyleProperty(root, "--dream-retro-frame", `url("${retroFrameUrl}")`);
      root.style.removeProperty("--dream-skin-art");
      setAttribute(root, "data-dream-deep-theme", "");
      root.style.removeProperty("--dream-deep-right");
      root.style.removeProperty("--dream-deep-sidebar");
      root.style.removeProperty("--dream-deep-watermark");
      root.style.removeProperty("--dream-deep-brand");
      root.style.removeProperty("--dream-deep-avatar");
      for (const name of THEME_VARIABLES.filter((value) => value.startsWith("--dream-deep-") && ![
        "--dream-deep-right", "--dream-deep-sidebar", "--dream-deep-watermark", "--dream-deep-brand", "--dream-deep-avatar",
      ].includes(value))) root.style.removeProperty(name);
    } else if (skinMode === "custom") {
      setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
      const deepActive = THEME.schemaVersion === 2 && THEME.kind === "deep-custom";
      setAttribute(root, "data-dream-deep-theme", deepActive ? "true" : "");
      if (deepActive) {
        const asset = (key, fallback = "") => deepThemeUrls[key] || (fallback ? deepThemeUrls[fallback] : "");
        const setAsset = (name, value) => value
          ? setStyleProperty(root, name, `url("${value}")`)
          : root.style.removeProperty(name);
        setAsset("--dream-deep-right", asset("foregroundRight"));
        setAsset("--dream-deep-sidebar", asset("sidebarCharacter"));
        setAsset("--dream-deep-watermark", asset("watermark", "brandEmblem"));
        setAsset("--dream-deep-brand", asset("brandEmblem", "watermark"));
        setAsset("--dream-deep-avatar", asset("avatar", "brandEmblem"));
        const foreground = THEME.layout?.foregroundRight || {};
        const sidebar = THEME.layout?.sidebarCharacter || {};
        const watermark = THEME.layout?.watermark || {};
        setStyleProperty(root, "--dream-deep-right-width", `${foreground.width ?? 520}px`);
        setStyleProperty(root, "--dream-deep-right-right", `${foreground.right ?? -24}px`);
        setStyleProperty(root, "--dream-deep-right-bottom", `${foreground.bottom ?? -120}px`);
        setStyleProperty(root, "--dream-deep-right-opacity", `${foreground.opacity ?? 1}`);
        setStyleProperty(root, "--dream-deep-sidebar-size", `${sidebar.size ?? 138}%`);
        setStyleProperty(root, "--dream-deep-sidebar-y", `${sidebar.positionY ?? 22}%`);
        setStyleProperty(root, "--dream-deep-sidebar-opacity", `${sidebar.opacity ?? .075}`);
        setStyleProperty(root, "--dream-deep-watermark-width", `${watermark.width ?? 170}px`);
        setStyleProperty(root, "--dream-deep-watermark-x", `${watermark.positionX ?? 56}%`);
        setStyleProperty(root, "--dream-deep-watermark-y", `${watermark.positionY ?? 8}%`);
        setStyleProperty(root, "--dream-deep-watermark-opacity", `${watermark.opacity ?? .1}`);
        setStyleProperty(root, "--dream-deep-brand-title", cssString(THEME.brand?.title || "CODEX"));
        setStyleProperty(root, "--dream-deep-brand-subtitle", cssString(THEME.brand?.subtitle || "MORE THAN CODE"));
      } else {
        for (const name of THEME_VARIABLES.filter((value) => value.startsWith("--dream-deep-"))) {
          root.style.removeProperty(name);
        }
      }
      root.style.removeProperty("--qq-skin-art");
      root.style.removeProperty("--dream-retro-frame");
    } else {
      setAttribute(root, "data-dream-deep-theme", "");
      root.style.removeProperty("--qq-skin-art");
      root.style.removeProperty("--dream-skin-art");
      root.style.removeProperty("--dream-retro-frame");
      for (const name of THEME_VARIABLES.filter((value) => value.startsWith("--dream-deep-"))) {
        root.style.removeProperty(name);
      }
    }
    applyTheme(root, shell);
    applyArtMetadata(root);
    root.classList.toggle("codex-qq-skin", skinMode === "qq");
    root.classList.toggle("codex-dream-skin", skinMode === "custom");
    // Belt-and-suspenders: never allow both product skins on the same document.
    if (skinMode === "qq") root.classList.remove("codex-dream-skin");
    if (skinMode === "custom") root.classList.remove("codex-qq-skin");
    return shell;
  };

  const removeQQDecorations = () => {
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(COMPANION_ID)?.remove();
    document.getElementById(USAGE_PANEL_ID)?.remove();
    document.getElementById(USAGE_TOGGLE_ID)?.remove();
    document.getElementById(HOME_PET_ID)?.remove();
    document.getElementById(RIGHT_TRAY_ID)?.remove();
    document.getElementById(RETRO_SHELL_ID)?.remove();
    document.getElementById(RETRO_PROFILE_ID)?.remove();
    document.querySelectorAll(".qq-skin-section-bar").forEach((node) => node.classList.remove("qq-skin-section-bar"));
    document.querySelectorAll(".dream-retro-profile-host").forEach((node) => node.classList.remove("dream-retro-profile-host"));
    document.querySelectorAll(".dream-retro-window-control").forEach((button) => button.classList.remove(
      "dream-retro-window-control", "dream-retro-control-summary",
      "dream-retro-control-bottom", "dream-retro-control-sidebar",
    ));
    companionParts = null;
    usageParts = null;
    chromeParts = null;
    retroProfileParts = null;
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].qq-skin-home')) {
      if (candidate !== home) candidate.classList.remove("qq-skin-home");
    }
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) {
      home.classList.toggle("qq-skin-home", skinMode === "qq");
      home.classList.toggle("dream-skin-home", skinMode === "custom");
    }
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".qq-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("qq-skin-home-utility");
    }
    for (const candidate of document.querySelectorAll(".dream-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("dream-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) {
      candidate.classList.toggle("qq-skin-home-utility", skinMode === "qq");
      candidate.classList.toggle("dream-skin-home-utility", skinMode === "custom");
    }

    if (!shellMain || !document.body) return;
    shellMain.classList.toggle("qq-skin-home-shell", Boolean(home) && skinMode === "qq");
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home) && skinMode === "custom");
    if (skinMode === "custom") {
      removeQQDecorations();
      setAttribute(root, "data-dream-three-pane", "false");
      setAttribute(root, "data-dream-summary-state", "unavailable");
      return;
    }
    ensureRetroShell();
    syncRetroToolbarActions();
    syncRetroWindowControls();
    ensureRetroProfile();
    ensureToggleButton();
    if (observedShellMain !== shellMain) {
      resizeObserver?.disconnect();
      resizeObserver?.observe(shellMain);
      observedShellMain = shellMain;
      layout = true;
    }
    ensureHomePet(home);
    ensureSidebarSectionBars();
    const companion = ensureCompanion();
    const usageUi = ensureUsagePanel();
    const leftSidebarToggle = findLeftSidebarToggle();
    const leftSidebarLabel = leftSidebarToggle?.getAttribute("aria-label") || "";
    let leftSidebarOpen = hideSidebarLabel.test(leftSidebarLabel) ||
      (!leftSidebarToggle && Boolean(document.querySelector("aside.app-shell-left-panel")));
    const summaryToggle = findPinnedSummaryToggle();
    // LAYOUT changes when the segmented control switches modes. Derive these
    // values on every route pass instead of freezing the startup theme's
    // custom `off` layout for the lifetime of the renderer.
    const layoutMode = LAYOUT.mode === "off" ? "off" : "classic-three-pane";
    const layoutMinWidth = typeof LAYOUT.minWidth === "number"
      ? clamp(Math.round(LAYOUT.minWidth), 1080, 2400) : 1180;
    const layoutRightWidth = typeof LAYOUT.rightWidth === "number"
      ? clamp(Math.round(LAYOUT.rightWidth), 272, 360) : 300;
    const shouldAutoOpenSummary = LAYOUT.rightPanel !== "remember";
    const wideEnough = window.innerWidth >= layoutMinWidth;
    const settingsRoute = [...document.querySelectorAll('input[placeholder]')].some((input) => {
      let placeholder = input.getAttribute("placeholder") || "";
      if (/(设置|設定)/i.test(placeholder)) placeholder = "settings";
      if (!/(settings|设置|設定)/i.test(placeholder)) return false;
      if (typeof input.getBoundingClientRect !== "function") return false;
      const box = input.getBoundingClientRect();
      return box.width > 120 && box.height > 12;
    });
    const taskRoute = !home && !settingsRoute && Boolean(shellMain);
    setAttribute(root, "data-dream-task-route", taskRoute ? "true" : "false");
    const visibleThreadFooters = [...document.querySelectorAll(
      'main.main-surface [data-pip-obstacle="thread-footer"]',
    )].filter((footer) => {
      const box = footer.getBoundingClientRect?.();
      return box && box.width > 8 && box.height > 8;
    });
    setAttribute(root, "data-dream-side-task", visibleThreadFooters.length >= 2 ? "open" : "closed");
    const layoutBaseEligible = layoutMode === "classic-three-pane" &&
      !home && taskRoute && wideEnough;
    if (
      layoutBaseEligible && showSidebarLabel.test(leftSidebarLabel) &&
      !autoOpenedSidebarToggles.has(leftSidebarToggle) && typeof leftSidebarToggle.click === "function"
    ) {
      autoOpenedSidebarToggles.add(leftSidebarToggle);
      leftSidebarToggle.click();
      leftSidebarOpen = true;
    }
    const layoutEligible = layoutBaseEligible && leftSidebarOpen && Boolean(summaryToggle);
    let autoOpening = false;
    if (
      layoutEligible && shouldAutoOpenSummary && summaryToggle.getAttribute("aria-pressed") !== "true" &&
      !autoOpenedSummaryToggles.has(summaryToggle) && typeof summaryToggle.click === "function"
    ) {
      autoOpenedSummaryToggles.add(summaryToggle);
      autoOpening = true;
      summaryToggle.click();
    }
    const summaryOpen = layoutEligible &&
      (autoOpening || summaryToggle?.getAttribute("aria-pressed") === "true");
    setAttribute(root, "data-dream-three-pane", summaryOpen ? "true" : "false");
    setAttribute(root, "data-dream-left-sidebar", leftSidebarOpen ? "open" : "closed");
    setAttribute(root, "data-dream-summary-state", summaryOpen ? "open" : (layoutEligible ? "closed" : "unavailable"));
    setStyleProperty(root, "--dream-three-pane-min-width", `${layoutMinWidth}px`);
    setStyleProperty(root, "--dream-right-panel-width", `${layoutRightWidth}px`);
    const summaryPanelCandidate = summaryOpen
      ? document.querySelector('[data-pip-obstacle="thread-summary-panel"]') : null;
    const summaryPanelBox = summaryPanelCandidate?.getBoundingClientRect?.();
    const summaryPanel = summaryPanelBox && summaryPanelBox.width > 8 && summaryPanelBox.height > 8
      ? summaryPanelCandidate : null;
    const rightTray = ensureRightTray();
    if (summaryPanel && typeof summaryPanel.getBoundingClientRect === "function") {
      const summaryBox = summaryPanelBox;
      const summaryWidth = Math.round(summaryBox.width);
      if (summaryWidth >= 272 && summaryWidth <= 420) {
        setStyleProperty(root, "--dream-summary-panel-width", `${summaryWidth}px`);
      }
      // Paint a wider blue tray behind Output/Source + companion, inset from the
      // window chrome and extending from the title bar down to the bottom edge.
      const trayPad = 14;
      const panelRight = Math.max(8, Math.round(window.innerWidth - summaryBox.right));
      const trayLeft = Math.max(0, Math.round(summaryBox.left) - trayPad);
      const trayRight = Math.max(6, panelRight - trayPad);
      const trayWidth = Math.max(summaryWidth + trayPad * 2, Math.round(window.innerWidth - trayLeft - trayRight));
      setStyleProperty(rightTray, "left", `${trayLeft}px`);
      setStyleProperty(rightTray, "right", `${trayRight}px`);
      setStyleProperty(rightTray, "width", `${trayWidth}px`);
      setStyleProperty(root, "--dream-right-tray-inset", `${trayPad}px`);
      setStyleProperty(root, "--dream-right-panel-right", `${panelRight}px`);
      setStyleProperty(usageUi.panel, "left", `${Math.round(summaryBox.left)}px`);
      setStyleProperty(usageUi.panel, "top", `${Math.round(summaryBox.top)}px`);
      setStyleProperty(usageUi.panel, "width", `${summaryWidth}px`);
      setStyleProperty(usageUi.panel, "height", `${Math.round(summaryBox.height)}px`);
      setStyleProperty(usageUi.toggle, "right", `${panelRight + 10}px`);
      setStyleProperty(usageUi.toggle, "top", `${Math.round(summaryBox.top) + 8}px`);
      rightTray.classList.add("is-visible");
    } else {
      rightTray.classList.remove("is-visible");
      root.style.removeProperty("--dream-right-panel-right");
    }
    // The summary and generic sidebar controls can briefly report the same
    // pressed state. Show the companion only while the summary is visible.
    companion.classList.toggle("is-visible", Boolean(summaryPanel));
    usageUi.panel.classList.toggle("is-available", Boolean(summaryPanel));
    usageUi.toggle.classList.toggle("is-available", Boolean(summaryPanel));
    setUsageMode(usageMode);
    let chrome = document.getElementById(CHROME_ID);
    let created = false;
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="qq-skin-brand">
          <span class="qq-skin-portal-mark">◉</span>
          <span><b></b><small></small></span>
        </div>
        <div class="qq-skin-status"><i></i><span></span></div>
        <div class="qq-skin-quote"></div>
        <div class="qq-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="qq-skin-orbit"></div>`;
      document.body.appendChild(chrome);
      created = true;
      chromeParts = null;
    }
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".qq-skin-brand b"),
        subtitle: chrome.querySelector(".qq-skin-brand small"),
        status: chrome.querySelector(".qq-skin-status span"),
        quote: chrome.querySelector(".qq-skin-quote"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex QQ Skin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX QQ SKIN");
    setTextContent(chromeParts.status, THEME.statusText || "QQ SKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    if (layout || created) {
      metrics.layoutReads += 1;
      const shellBox = shellMain.getBoundingClientRect();
      setStyleProperty(chrome, "left", `${Math.round(shellBox.left)}px`);
      setStyleProperty(chrome, "top", `${Math.round(shellBox.top)}px`);
      setStyleProperty(chrome, "width", `${Math.round(shellBox.width)}px`);
      setStyleProperty(chrome, "height", `${Math.round(shellBox.height)}px`);
    }
    chrome.classList.toggle("qq-skin-home-shell", Boolean(home));
    if (chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    soundMonitor.scan();
    if (route) syncRouteState(shell, { layout });
  };

  const removeSkinVisuals = () => {
    const root = document.documentElement;
    root?.classList.remove("codex-qq-skin", "codex-dream-skin");
    root?.removeAttribute(SHELL_ATTR);
    for (const name of ART_ATTRS) root?.removeAttribute(name);
    root?.style.removeProperty("--qq-skin-art");
    root?.style.removeProperty("--dream-skin-art");
    for (const name of THEME_VARIABLES) root?.style.removeProperty(name);
    document.querySelectorAll(".qq-skin-home").forEach((node) => node.classList.remove("qq-skin-home"));
    document.querySelectorAll(".qq-skin-home-shell").forEach((node) => node.classList.remove("qq-skin-home-shell"));
    document.querySelectorAll(".qq-skin-home-utility").forEach((node) => node.classList.remove("qq-skin-home-utility"));
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-home-utility").forEach((node) => node.classList.remove("dream-skin-home-utility"));
    document.querySelectorAll(".qq-skin-section-bar").forEach((node) => node.classList.remove("qq-skin-section-bar"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(COMPANION_ID)?.remove();
    document.getElementById(USAGE_PANEL_ID)?.remove();
    document.getElementById(USAGE_TOGGLE_ID)?.remove();
    document.getElementById(HOME_PET_ID)?.remove();
    document.getElementById(RIGHT_TRAY_ID)?.remove();
    document.getElementById(RETRO_SHELL_ID)?.remove();
    document.getElementById(RETRO_PROFILE_ID)?.remove();
    document.querySelectorAll(".dream-retro-profile-host").forEach((node) =>
      node.classList.remove("dream-retro-profile-host"));
    document.querySelectorAll(".dream-retro-window-control").forEach((button) =>
      button.classList.remove(
        "dream-retro-window-control", "dream-retro-control-summary",
        "dream-retro-control-bottom", "dream-retro-control-sidebar",
      ));
    companionParts = null;
    usageParts = null;
    chromeParts = null;
    retroProfileParts = null;
  };

  const syncToggleButton = (control) => {
    for (const button of control.querySelectorAll("button[data-skin-mode]")) {
      const selected = button.dataset.skinMode === skinMode;
      const unavailable = button.dataset.skinMode === "custom" && !CUSTOM_THEME_KINDS.has(CUSTOM_THEME.kind);
      button.disabled = unavailable;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.style.opacity = unavailable ? ".45" : "1";
      button.style.color = selected ? "#fff" : "#3b3f45";
      button.style.background = selected
        ? "linear-gradient(180deg,#4ba9f0 0%,#166fc8 100%)"
        : "transparent";
      button.style.boxShadow = selected ? "inset 0 1px rgba(255,255,255,.42),0 1px 2px rgba(0,54,112,.22)" : "none";
    }
    const libraryButton = control.querySelector("button[data-skin-library]");
    if (libraryButton) {
      const unavailable = !CUSTOM_THEME_KINDS.has(CUSTOM_THEME.kind) && LIBRARY_THEMES.length === 0;
      libraryButton.disabled = unavailable;
      libraryButton.style.opacity = unavailable ? ".45" : "1";
      libraryButton.style.color = skinMode === "custom" ? "#fff" : "#3b3f45";
      libraryButton.style.background = skinMode === "custom"
        ? "linear-gradient(180deg,#4ba9f0 0%,#166fc8 100%)"
        : "transparent";
    }
  };

  const closeLibraryMenu = () => {
    document.getElementById(LIBRARY_MENU_ID)?.remove();
  };

  const requestLibrarySwitch = (themeId) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(themeId || "")) return;
    closeLibraryMenu();
    try {
      // Injector watches this key, runs switch-theme --no-apply, then reinjects.
      window.localStorage?.setItem(LIBRARY_SWITCH_KEY, JSON.stringify({
        id: themeId,
        requestedAt: Date.now(),
      }));
      window.localStorage?.setItem(MODE_STORAGE_KEY, "custom");
      window.localStorage?.setItem(ENABLED_STORAGE_KEY, "true");
    } catch {}
  };

  const openLibraryMenu = (anchor) => {
    closeLibraryMenu();
    if (!LIBRARY_THEMES.length) return;
    const menu = document.createElement("div");
    menu.id = LIBRARY_MENU_ID;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "最近自定义皮肤");
    const rect = typeof anchor.getBoundingClientRect === "function"
      ? anchor.getBoundingClientRect()
      : { bottom: 36, right: 210 };
    menu.style.cssText = [
      "position:fixed", `top:${Math.round(rect.bottom + 6)}px`, `right:${Math.max(12, Math.round(window.innerWidth - rect.right))}px`,
      "z-index:2147483001", "min-width:168px", "max-width:240px", "max-height:260px", "overflow:auto",
      "padding:4px", "border:1px solid rgba(82,88,98,.18)", "border-radius:10px",
      "background:rgba(248,248,249,.97)", "box-shadow:0 8px 24px rgba(0,0,0,.14)",
      "backdrop-filter:blur(14px) saturate(110%)", "-webkit-app-region:no-drag",
    ].join(";");
    for (const item of LIBRARY_THEMES.slice(0, 8)) {
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("role", "menuitem");
      option.dataset.themeId = item.id;
      const label = typeof item.name === "string" && item.name.trim() ? item.name.trim() : item.id;
      option.textContent = skinMode === "custom" && item.active ? `✓ ${label}` : label;
      option.title = item.id;
      option.style.cssText = [
        "display:block", "width:100%", "text-align:left", "height:28px", "padding:0 10px",
        "border:0", "border-radius:7px", "background:transparent", "cursor:pointer",
        "font:500 12px/28px -apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif",
        "color:#2f3338", "white-space:nowrap", "overflow:hidden", "text-overflow:ellipsis",
      ].join(";");
      option.addEventListener?.("mouseenter", () => { option.style.background = "rgba(22,111,200,.12)"; });
      option.addEventListener?.("mouseleave", () => { option.style.background = "transparent"; });
      option.addEventListener?.("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestLibrarySwitch(item.id);
      });
      menu.appendChild(option);
    }
    const hint = document.createElement("div");
    hint.textContent = "完整管理请打开 App";
    hint.style.cssText = [
      "margin:4px 6px 2px", "font:400 10px/14px -apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif",
      "color:#8a9098",
    ].join(";");
    menu.appendChild(hint);
    document.body.appendChild(menu);
    const dismiss = (event) => {
      if (menu.contains(event?.target) || anchor.contains?.(event?.target)) return;
      closeLibraryMenu();
      document.removeEventListener?.("mousedown", dismiss, true);
    };
    document.addEventListener?.("mousedown", dismiss, true);
  };

  const selectSkinMode = (mode) => {
    if (!["native", "qq", "custom"].includes(mode)) return;
    if (mode === "custom" && !CUSTOM_THEME_KINDS.has(CUSTOM_THEME.kind)) return;
    skinMode = mode;
    if (skinMode === "qq") forceNativeLightForQQ();
    else restoreNativeAppearance();
    THEME = skinMode === "qq" ? QQ_THEME : CUSTOM_THEME;
    ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
    LAYOUT = THEME.layout && typeof THEME.layout === "object" ? THEME.layout : {};
    SOUND = THEME.sound && typeof THEME.sound === "object" ? THEME.sound : {};
    // Keep cached custom analysis for later, but never let it tint QQ after a switch.
    if (skinMode === "custom" && !artAnalysis && typeof CUSTOM_THEME.artKey === "string") {
      artAnalysis = analysisCache.get(CUSTOM_THEME.artKey) ?? null;
    }
    window[DISABLED_KEY] = skinMode === "native";
    try {
      window.localStorage?.setItem(MODE_STORAGE_KEY, skinMode);
      window.localStorage?.setItem(ENABLED_STORAGE_KEY, skinMode === "native" ? "false" : "true");
    } catch {}
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) {
      state.skinMode = skinMode;
      state.themeId = THEME.id || (skinMode === "qq" ? "qq-stable" : "custom");
    }
    removeSkinVisuals();
    if (skinMode !== "native") ensure({ root: true, route: true, layout: true });
    // Always re-assert the toggle above retro chrome so Electron drag regions
    // created during ensure() cannot swallow the next click.
    const control = ensureToggleButton();
    if (control?.parentElement === document.body) document.body.appendChild(control);
    if (typeof window.dispatchEvent === "function" && typeof window.Event === "function") {
      window.dispatchEvent(new window.Event("resize"));
    }
  };

  const ensureToggleButton = () => {
    let control = document.getElementById(TOGGLE_ID);
    const needsLibrary = LIBRARY_THEMES.length > 0;
    const hasLibrary = Boolean(control?.querySelector?.("button[data-skin-library]"));
    if (
      !control || control.parentElement !== document.body || control.tagName === "BUTTON"
      || needsLibrary !== hasLibrary
    ) {
      control?.remove();
      closeLibraryMenu();
      control = document.createElement("div");
      control.id = TOGGLE_ID;
      control.setAttribute("role", "group");
      control.setAttribute("aria-label", "切换皮肤");
      control.style.cssText = [
        "position:fixed", "z-index:2147483000", "top:7px", "right:210px", "height:28px",
        "display:flex", "align-items:center", "gap:2px", "padding:2px",
        "border:1px solid rgba(82,88,98,.18)", "border-radius:10px",
        "background:rgba(248,248,249,.91)", "box-shadow:0 1px 2px rgba(0,0,0,.08),0 5px 14px rgba(0,0,0,.08)",
        "backdrop-filter:blur(14px) saturate(110%)", "-webkit-app-region:no-drag",
      ].join(";");
      for (const [mode, label] of [["native", "原生"], ["qq", "QQ"], ["custom", "自定义"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.skinMode = mode;
        button.textContent = label;
        button.style.cssText = [
          "height:22px", "padding:0 9px", "border:0", "border-radius:7px", "white-space:nowrap",
          "font:650 11px/22px -apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif",
          "cursor:pointer", "user-select:none", "transition:background .16s ease,color .16s ease",
        ].join(";");
        const activateMode = (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectSkinMode(mode);
        };
        // Electron can occasionally consume the synthesized click while the
        // title bar is being rebuilt. Pointer-up arrives before that drag-region
        // reconciliation, so handle it as the primary activation path and keep
        // click as the keyboard/accessibility fallback.
        button.addEventListener?.("pointerup", activateMode);
        button.addEventListener?.("click", activateMode);
        control.appendChild(button);
      }
      if (needsLibrary) {
        const libraryButton = document.createElement("button");
        libraryButton.type = "button";
        libraryButton.dataset.skinLibrary = "recent";
        libraryButton.setAttribute("aria-label", "最近自定义皮肤");
        libraryButton.setAttribute("aria-haspopup", "menu");
        libraryButton.textContent = "▾";
        libraryButton.style.cssText = [
          "height:22px", "width:22px", "padding:0", "border:0", "border-radius:7px",
          "font:700 12px/22px -apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif",
          "cursor:pointer", "user-select:none", "transition:background .16s ease,color .16s ease",
        ].join(";");
        libraryButton.addEventListener?.("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (document.getElementById(LIBRARY_MENU_ID)) closeLibraryMenu();
          else openLibraryMenu(libraryButton);
        });
        control.appendChild(libraryButton);
      }
      document.body.appendChild(control);
    }
    syncToggleButton(control);
    return control;
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    restoreNativeAppearance();
    removeSkinVisuals();
    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(LIBRARY_MENU_ID)?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.startupTimer) clearInterval(state.startupTimer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (routeSettleTimer) clearTimeout(routeSettleTimer);
    if (companionBreakTimer) {
      clearTimeout(companionBreakTimer);
      companionBreakTimer = null;
    }
    if (blindBoxRevealTimer) {
      clearTimeout(blindBoxRevealTimer);
      blindBoxRevealTimer = null;
    }
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.routeInteractionHandler && typeof document.removeEventListener === "function") {
      document.removeEventListener("click", state.routeInteractionHandler, true);
    }
    state?.soundMonitor?.cleanup?.();
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.qqArtUrl) URL.revokeObjectURL(state.qqArtUrl);
    if (state?.petUrl) URL.revokeObjectURL(state.petUrl);
    if (state?.retroFrameUrl) URL.revokeObjectURL(state.retroFrameUrl);
    if (state?.qqAvatarUrl) URL.revokeObjectURL(state.qqAvatarUrl);
    if (state?.coughAudioUrl) URL.revokeObjectURL(state.coughAudioUrl);
    for (const url of Object.values(state?.deepThemeUrls || {})) URL.revokeObjectURL(url);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  const observer = new MutationObserver(() => scheduleEnsure({ route: true }));
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure({ root: true, route: true });
  });
  const resizeHandler = () => scheduleEnsure({ route: true, layout: true });
  const routeInteractionHandler = () => {
    if (routeSettleTimer) clearTimeout(routeSettleTimer);
    routeSettleTimer = setTimeout(() => {
      routeSettleTimer = null;
      scheduleEnsure({ route: true, layout: true });
    }, 500);
  };
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => scheduleEnsure({ route: true, layout: true }));
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: true });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    ensureToggleButton,
    setUsageSnapshot,
    setCompanionSnapshot,
    observer,
    rootObserver,
    resizeObserver,
    timer: null,
    startupTimer: null,
    scheduler,
    resizeHandler,
    routeInteractionHandler,
    soundMonitor,
    mediaQuery,
    mediaHandler,
    artUrl,
    qqArtUrl,
    petUrl,
    retroFrameUrl,
    qqAvatarUrl,
    coughAudioUrl,
    deepThemeUrls,
    installToken,
    analysis: artAnalysis,
    artMetadata: CUSTOM_ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    skinMode,
    customThemeKind: CUSTOM_THEME.kind || null,
    customThemeId: CUSTOM_THEME.id || null,
    qqThemeId: QQ_THEME.id || null,
    detectShellMode,
    selectSkinMode,
  };
  ensureToggleButton();
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.qqArtUrl && previous.qqArtUrl !== qqArtUrl) URL.revokeObjectURL(previous.qqArtUrl);
  if (previous?.petUrl && previous.petUrl !== petUrl) URL.revokeObjectURL(previous.petUrl);
  if (previous?.retroFrameUrl && previous.retroFrameUrl !== retroFrameUrl) {
    URL.revokeObjectURL(previous.retroFrameUrl);
  }
  if (previous?.qqAvatarUrl && previous.qqAvatarUrl !== qqAvatarUrl) {
    URL.revokeObjectURL(previous.qqAvatarUrl);
  }
  if (previous?.coughAudioUrl && previous.coughAudioUrl !== coughAudioUrl) {
    URL.revokeObjectURL(previous.coughAudioUrl);
  }
  for (const url of Object.values(previous?.deepThemeUrls || {})) URL.revokeObjectURL(url);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    // Inline styles on <html> are owned by applyRootState. Observing them
    // feeds our own CSS-variable writes back into another full root pass.
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
    });
  }
  const timer = setInterval(() => ensure({ root: false, route: true, layout: true }), 4000);
  window[STATE_KEY].timer = timer;
  window.addEventListener("resize", resizeHandler, { passive: true });
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", routeInteractionHandler, true);
  }
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  // Codex mounts its fixed shell, composer and account footer across several
  // React commits. Refresh their cached geometry during that bounded startup
  // window, reproducing the useful layout effect of toggling a native panel.
  const startupResizePasses = new Set([1, 2, 4, 8, 12, 16]);
  let startupPass = 0;
  const startupTimer = setInterval(() => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window[DISABLED_KEY]) {
      clearInterval(startupTimer);
      return;
    }
    startupPass += 1;
    metrics.startupPasses = startupPass;
    scheduleEnsure({ route: true, layout: true });
    if (
      startupResizePasses.has(startupPass) &&
      typeof window.dispatchEvent === "function" && typeof window.Event === "function"
    ) {
      window.dispatchEvent(new window.Event("resize"));
    }
    if (startupPass >= 16) {
      clearInterval(startupTimer);
      if (state.startupTimer === startupTimer) state.startupTimer = null;
    }
  }, 250);
  window[STATE_KEY].startupTimer = startupTimer;
  // Only analyze the uploaded custom image while custom mode is active. QQ must
  // never adopt that analysis after a mode switch or a late analysis callback.
  const analysisPromise = (skinMode === "custom" && !artAnalysis)
    ? analyzeArt()
    : Promise.resolve(null);
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    if (skinMode !== "custom") return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof CUSTOM_THEME.artKey === "string") {
      analysisCache.set(CUSTOM_THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(
  __QQ_SKIN_CSS_JSON__,
  __CUSTOM_SKIN_CSS_JSON__,
  __QQ_SKIN_ART_JSON__,
  __QQ_STABLE_ART_JSON__,
  __QQ_SKIN_PET_JSON__,
  __QQ_SKIN_RETRO_FRAME_JSON__,
  __QQ_SKIN_QQ_AVATAR_JSON__,
  __QQ_SKIN_COUGH_AUDIO_JSON__,
  __QQ_SKIN_DEEP_ASSETS_JSON__,
  __QQ_SKIN_THEME_JSON__,
  __QQ_STABLE_THEME_JSON__,
  __QQ_SKIN_LIBRARY_JSON__
)
