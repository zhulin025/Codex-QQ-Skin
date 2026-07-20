((cssText, artDataUrl, petDataUrl, retroFrameDataUrl, qqAvatarDataUrl, coughAudioDataUrl, themeConfig) => {
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
  const SOUND = THEME.sound && typeof THEME.sound === "object" ? THEME.sound : {};
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
    startupPasses: 0,
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
  const coughAudioUrl = dataUrlToObjectUrl(coughAudioDataUrl, "audio/mpeg");

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
    return null;
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

  const ensureCompanion = () => {
    let companion = document.getElementById(COMPANION_ID);
    if (!companion || companion.parentElement !== document.body) {
      companion?.remove();
      companion = document.createElement("section");
      companion.id = COMPANION_ID;
      companion.setAttribute("aria-label", "Codex 伙伴");
      companion.innerHTML = `
        <div class="qq-skin-companion-title">
          <span>Codex 伙伴</span><i></i>
        </div>
        <div class="qq-skin-companion-stage">
          <img class="qq-skin-pet-image" alt="" draggable="false">
          <div class="qq-skin-pet-glow"></div>
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
    if (!companionParts || companionParts.companion !== companion) {
      companionParts = {
        companion,
        image: companion.querySelector(".qq-skin-pet-image"),
        petButton: companion.querySelector('[data-companion-action="pet"]'),
        terminalButton: companion.querySelector('[data-companion-action="terminal"]'),
        soundButton: companion.querySelector('[data-companion-action="sound"]'),
        statusText: companion.querySelector(".qq-skin-pet-status span"),
        weeklyUsage: companion.querySelector(".qq-skin-weekly-usage"),
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
    }
    if (companionParts.image && companionParts.image.src !== petUrl) companionParts.image.src = petUrl;
    soundMonitor.bindButton(companionParts.soundButton);
    soundMonitor.bindStatus(syncCompanionStatus);
    syncCompanionStatus(soundMonitor.status);
    syncWeeklyUsage(companionParts.weeklyUsage);
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
          <button type="button" data-retro-action="sites">🌐 站点</button>
          <button type="button" data-retro-action="pull-requests">↗ 拉取请求</button>
          <button type="button" data-retro-action="chat">💬 聊天</button>
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

  const retroActionMatchers = {
    "new-task": { text: /^(新建任务|new task)$/i },
    scheduled: { text: /^(已安排|scheduled)$/i },
    plugins: { text: /^(插件|plugins?)$/i },
    sites: { text: /^(站点|sites?)$/i },
    "pull-requests": { text: /^(拉取请求|pull requests?)$/i },
    chat: { text: /^(聊天|chat)$/i, aria: /^(quick chat|快速聊天|快捷聊天)$/i },
  };

  const findNativeRetroAction = (action) => {
    const matcher = retroActionMatchers[action];
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    if (!matcher || !sidebar) return null;
    const candidates = [...sidebar.querySelectorAll("button, a")];
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
      button.disabled = !target;
      button.setAttribute("aria-disabled", target ? "false" : "true");
      if (button.dataset.retroActionBound === "true") continue;
      button.dataset.retroActionBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        findNativeRetroAction(action)?.click();
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
    syncRetroToolbarActions();
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
    const taskRoute = !home && !settingsRoute && Boolean(shellMain);
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
    soundMonitor.scan();
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
    if (state?.startupTimer) clearInterval(state.startupTimer);
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
    state?.soundMonitor?.cleanup?.();
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.petUrl) URL.revokeObjectURL(state.petUrl);
    if (state?.retroFrameUrl) URL.revokeObjectURL(state.retroFrameUrl);
    if (state?.qqAvatarUrl) URL.revokeObjectURL(state.qqAvatarUrl);
    if (state?.coughAudioUrl) URL.revokeObjectURL(state.coughAudioUrl);
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
    startupTimer: null,
    scheduler,
    resizeHandler,
    routeInteractionHandler,
    soundMonitor,
    mediaQuery,
    mediaHandler,
    artUrl,
    petUrl,
    retroFrameUrl,
    qqAvatarUrl,
    coughAudioUrl,
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
  if (previous?.coughAudioUrl && previous.coughAudioUrl !== coughAudioUrl) {
    URL.revokeObjectURL(previous.coughAudioUrl);
  }

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
  __QQ_SKIN_COUGH_AUDIO_JSON__,
  __QQ_SKIN_THEME_JSON__
)
