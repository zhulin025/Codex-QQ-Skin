((cssText, artDataUrl, petDataUrl, retroFrameDataUrl, qqAvatarDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_QQ_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_QQ_SKIN_DISABLED__";
  const STYLE_ID = "codex-qq-skin-style";
  const CHROME_ID = "codex-qq-skin-chrome";
  const COMPANION_ID = "codex-qq-skin-companion";
  const HOME_PET_ID = "codex-qq-skin-home-pet";
  const RIGHT_TRAY_ID = "codex-qq-skin-right-tray";
  const RETRO_SHELL_ID = "codex-qq-skin-retro-shell";
  const RETRO_PROFILE_ID = "codex-qq-skin-retro-profile";
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready", "data-dream-three-pane", "data-dream-summary-state", "data-dream-left-sidebar",
  ];
  const VERSION = __QQ_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __QQ_SKIN_STYLE_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const LAYOUT = THEME.layout && typeof THEME.layout === "object" ? THEME.layout : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
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
  ];
  const installToken = {};
  const autoOpenedSummaryToggles = new WeakSet();
  const autoOpenedSidebarToggles = new WeakSet();
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
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
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

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
  const petUrl = dataUrlToObjectUrl(petDataUrl, "image/png");
  const retroFrameUrl = dataUrlToObjectUrl(retroFrameDataUrl, "image/png");
  const qqAvatarUrl = dataUrlToObjectUrl(qqAvatarDataUrl, "image/png");

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.routeInteractionHandler && typeof document.removeEventListener === "function") {
    document.removeEventListener("click", previous.routeInteractionHandler, true);
  }
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
      const hadSkin = root.classList.contains("codex-qq-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-qq-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-qq-skin");
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
    if (!root.classList.contains("codex-qq-skin")) {
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
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
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
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || false;
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
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
  let retroShellParts = null;
  let retroProfileParts = null;
  let observedShellMain = null;
  let resizeObserver = null;

  const layoutMode = LAYOUT.mode === "off" ? "off" : "classic-three-pane";
  const layoutMinWidth = typeof LAYOUT.minWidth === "number"
    ? clamp(Math.round(LAYOUT.minWidth), 1080, 2400) : 1180;
  const layoutRightWidth = typeof LAYOUT.rightWidth === "number"
    ? clamp(Math.round(LAYOUT.rightWidth), 272, 360) : 300;
  const shouldAutoOpenSummary = LAYOUT.rightPanel !== "remember";
  const pinnedSummaryLabel = /(toggle pinned summary|pinned summary|置顶摘要|固定摘要|釘選概要|釘選摘要|概要.*釘選|摘要.*固定)/i;
  const showSidebarLabel = /^(show sidebar|显示边栏|显示侧边栏|顯示邊欄|顯示側邊欄|サイドバーを表示|사이드바 표시)$/i;
  const hideSidebarLabel = /^(hide sidebar|隐藏边栏|隐藏侧边栏|隱藏邊欄|隱藏側邊欄|サイドバーを非表示|사이드바 숨기기)$/i;

  const findPinnedSummaryToggle = () => {
    for (const button of document.querySelectorAll('button[aria-label]')) {
      if (pinnedSummaryLabel.test(button.getAttribute("aria-label") || "")) return button;
    }
    return null;
  };

  const findLeftSidebarToggle = () => {
    for (const button of document.querySelectorAll('button[aria-label]')) {
      const label = button.getAttribute("aria-label") || "";
      if (showSidebarLabel.test(label) || hideSidebarLabel.test(label)) return button;
    }
    return null;
  };

  const ensureCompanion = () => {
    let companion = document.getElementById(COMPANION_ID);
    if (!companion || companion.parentElement !== document.body) {
      companion?.remove();
      companion = document.createElement("section");
      companion.id = COMPANION_ID;
      companion.setAttribute("aria-hidden", "true");
      companion.innerHTML = `
        <div class="qq-skin-companion-title">
          <span>Codex 伙伴</span><i></i>
        </div>
        <div class="qq-skin-companion-stage">
          <img class="qq-skin-pet-image" alt="" draggable="false">
          <div class="qq-skin-pet-glow"></div>
        </div>
        <div class="qq-skin-pet-status"><i></i><span>在线 · 随时待命</span></div>`;
      document.body.appendChild(companion);
      companionParts = null;
    }
    if (!companionParts || companionParts.companion !== companion) {
      companionParts = {
        companion,
        image: companion.querySelector(".qq-skin-pet-image"),
      };
    }
    if (companionParts.image && companionParts.image.src !== petUrl) companionParts.image.src = petUrl;
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
      !retroShell.querySelector(".dream-retro-native-controls")
    ) {
      retroShell?.remove();
      retroShell = document.createElement("div");
      retroShell.id = RETRO_SHELL_ID;
      retroShell.setAttribute("aria-hidden", "true");
      retroShell.innerHTML = `
        <div class="dream-retro-titlebar">
          <img class="dream-retro-title-penguin" alt="" draggable="false">
          <strong></strong>
        </div>
        <div class="dream-retro-toolbar">
          <span>📝 新建任务</span><span>🗓 已安排</span><i></i><span>🧩 插件</span>
          <span>🌐 站点</span><span>↗ 拉取请求</span><span>💬 聊天</span>
        </div>
        <div class="dream-retro-native-controls"></div>
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
    const profileButton = [...sidebar.querySelectorAll("button")].find((button) => {
      if (typeof button.getBoundingClientRect !== "function") return false;
      const box = button.getBoundingClientRect();
      const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
      return box.width > 120 && box.bottom > sidebarBox.bottom - 90 && text.length >= 2 && text.length <= 48;
    });
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
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.dreamSkinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.dreamSkinVersion = VERSION;
    style.dataset.dreamSkinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--qq-skin-art", `url("${artUrl}")`);
    setStyleProperty(root, "--dream-retro-frame", `url("${retroFrameUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    root.classList.add("codex-qq-skin");
    return shell;
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
    if (home) home.classList.add("qq-skin-home");
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".qq-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("qq-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("qq-skin-home-utility");

    if (!shellMain || !document.body) return;
    ensureRetroShell();
    syncRetroWindowControls();
    ensureRetroProfile();
    if (observedShellMain !== shellMain) {
      resizeObserver?.disconnect();
      resizeObserver?.observe(shellMain);
      observedShellMain = shellMain;
      layout = true;
    }
    shellMain.classList.toggle("qq-skin-home-shell", Boolean(home));
    ensureHomePet(home);
    ensureSidebarSectionBars();
    const companion = ensureCompanion();
    const leftSidebarToggle = findLeftSidebarToggle();
    const leftSidebarLabel = leftSidebarToggle?.getAttribute("aria-label") || "";
    let leftSidebarOpen = hideSidebarLabel.test(leftSidebarLabel) ||
      (!leftSidebarToggle && Boolean(document.querySelector("aside.app-shell-left-panel")));
    const summaryToggle = findPinnedSummaryToggle();
    const wideEnough = window.innerWidth >= layoutMinWidth;
    const settingsRoute = [...document.querySelectorAll('input[placeholder]')].some((input) => {
      const placeholder = input.getAttribute("placeholder") || "";
      if (!/(settings|设置|設定)/i.test(placeholder)) return false;
      if (typeof input.getBoundingClientRect !== "function") return false;
      const box = input.getBoundingClientRect();
      return box.width > 120 && box.height > 12;
    });
    const taskRoute = !settingsRoute && Boolean(shellMain);
    setAttribute(root, "data-dream-task-route", taskRoute ? "true" : "false");
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
    const summaryPanel = summaryOpen
      ? document.querySelector('[data-pip-obstacle="thread-summary-panel"]') : null;
    const rightTray = ensureRightTray();
    if (summaryPanel && typeof summaryPanel.getBoundingClientRect === "function") {
      const summaryBox = summaryPanel.getBoundingClientRect();
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
      rightTray.classList.add("is-visible");
    } else {
      rightTray.classList.remove("is-visible");
      root.style.removeProperty("--dream-right-panel-right");
    }
    companion.classList.toggle("is-visible", summaryOpen);
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
    if (route) syncRouteState(shell, { layout });
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-qq-skin");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
    document.documentElement?.style.removeProperty("--qq-skin-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".qq-skin-home").forEach((node) => node.classList.remove("qq-skin-home"));
    document.querySelectorAll(".qq-skin-home-shell").forEach((node) => node.classList.remove("qq-skin-home-shell"));
    document.querySelectorAll(".qq-skin-home-utility").forEach((node) => node.classList.remove("qq-skin-home-utility"));
    document.querySelectorAll(".qq-skin-section-bar").forEach((node) => node.classList.remove("qq-skin-section-bar"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(COMPANION_ID)?.remove();
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
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (routeSettleTimer) clearTimeout(routeSettleTimer);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.routeInteractionHandler && typeof document.removeEventListener === "function") {
      document.removeEventListener("click", state.routeInteractionHandler, true);
    }
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.petUrl) URL.revokeObjectURL(state.petUrl);
    if (state?.retroFrameUrl) URL.revokeObjectURL(state.retroFrameUrl);
    if (state?.qqAvatarUrl) URL.revokeObjectURL(state.qqAvatarUrl);
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
    observer,
    rootObserver,
    resizeObserver,
    timer: null,
    scheduler,
    resizeHandler,
    routeInteractionHandler,
    mediaQuery,
    mediaHandler,
    artUrl,
    petUrl,
    retroFrameUrl,
    qqAvatarUrl,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.petUrl && previous.petUrl !== petUrl) URL.revokeObjectURL(previous.petUrl);
  if (previous?.retroFrameUrl && previous.retroFrameUrl !== retroFrameUrl) {
    URL.revokeObjectURL(previous.retroFrameUrl);
  }
  if (previous?.qqAvatarUrl && previous.qqAvatarUrl !== qqAvatarUrl) {
    URL.revokeObjectURL(previous.qqAvatarUrl);
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
    });
  }
  const timer = setInterval(() => ensure(), 4000);
  window[STATE_KEY].timer = timer;
  window.addEventListener("resize", resizeHandler, { passive: true });
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", routeInteractionHandler, true);
  }
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
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
  __QQ_SKIN_ART_JSON__,
  __QQ_SKIN_PET_JSON__,
  __QQ_SKIN_RETRO_FRAME_JSON__,
  __QQ_SKIN_QQ_AVATAR_JSON__,
  __QQ_SKIN_THEME_JSON__
)
