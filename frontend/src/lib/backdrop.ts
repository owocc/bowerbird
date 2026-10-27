/**
 * The app background: a single layer painted between <body> and the real
 * content. It replaces the window's own fill, so the page draws nothing itself
 * (`body` is always transparent) and this layer decides what shows behind
 * everything — the theme's own colour, a solid colour, a gradient, or
 * transparency.
 *
 * The layer only appears where the app draws no fill of its own: surfaces such
 * as the gallery and the inspector keep theirs, so a bright background never
 * eats into content readability.
 */

import { BACKDROP_STORAGE_KEY } from "@/lib/appearance-keys";

export { BACKDROP_STORAGE_KEY };

/**
 * How the background layer is painted.
 *
 * - `default` fills with the theme's own chrome colour, so the window looks as
 *   it always did (the sidebar keeps its usual tint) and an enabled window
 *   material stays hidden. This is the out-of-the-box choice.
 * - `transparent` paints the theme's background colour at a fixed 20%, so the
 *   window shows through while the sidebar text keeps a readable base. This is
 *   what reveals an enabled window material; the value is fixed on purpose, so
 *   the plain "see the blur" choice never needs tuning.
 * - `solid` fills with one colour.
 * - `gradient` fills with a ready-made preset or a custom gradient.
 * - `image` fills with a picture the user picked, laid over `--background` so it
 *   never leaves the chrome looking unfinished.
 *
 * `solid`, `gradient` and `image` are drawn at `opacity`, so any of them can sit
 * lightly over the window. `default` and `transparent` ignore it: the first is
 * the theme's own surface, the second has its own fixed strength.
 */
export type BackdropMode =
  | "default"
  | "transparent"
  | "solid"
  | "gradient"
  | "image";

export type BackdropPresetId = "aurora" | "sunset" | "ocean" | "mono";

export interface BackdropPreset {
  id: BackdropPresetId;
  /** Translation keys under `settings.backdrop.presets`. */
  labelKey: string;
  /** The gradient painted in light mode. */
  light: string;
  /** The gradient painted in dark mode. */
  dark: string;
}

/**
 * Gradients are plain CSS `linear-gradient(...)` values. Colours use oklch to
 * match the rest of the theme tokens, and each preset keeps its light and dark
 * variant low-contrast so sidebar text stays readable on top.
 */
export const BACKDROP_PRESETS: BackdropPreset[] = [
  {
    id: "aurora",
    labelKey: "settings.backdrop.presets.aurora",
    light: "linear-gradient(160deg, oklch(0.94 0.06 300) 0%, oklch(0.96 0.05 200) 55%, oklch(0.95 0.06 160) 100%)",
    dark: "linear-gradient(160deg, oklch(0.28 0.07 300) 0%, oklch(0.26 0.06 220) 55%, oklch(0.24 0.05 170) 100%)",
  },
  {
    id: "sunset",
    labelKey: "settings.backdrop.presets.sunset",
    light: "linear-gradient(160deg, oklch(0.95 0.07 60) 0%, oklch(0.94 0.08 20) 55%, oklch(0.93 0.06 350) 100%)",
    dark: "linear-gradient(160deg, oklch(0.30 0.08 60) 0%, oklch(0.26 0.08 20) 55%, oklch(0.24 0.06 350) 100%)",
  },
  {
    id: "ocean",
    labelKey: "settings.backdrop.presets.ocean",
    light: "linear-gradient(160deg, oklch(0.95 0.05 220) 0%, oklch(0.96 0.05 240) 55%, oklch(0.95 0.05 265) 100%)",
    dark: "linear-gradient(160deg, oklch(0.27 0.06 220) 0%, oklch(0.25 0.06 245) 55%, oklch(0.24 0.06 265) 100%)",
  },
  {
    id: "mono",
    labelKey: "settings.backdrop.presets.mono",
    light: "linear-gradient(160deg, oklch(0.97 0 0) 0%, oklch(0.93 0 0) 100%)",
    dark: "linear-gradient(160deg, oklch(0.26 0 0) 0%, oklch(0.20 0 0) 100%)",
  },
];

export interface BackdropPrefs {
  mode: BackdropMode;
  /** The preset used when `mode` is `"gradient"`. */
  preset: BackdropPresetId;
  /** The colour used when `mode` is `"solid"`, as `#rrggbb`. */
  solid: string;
  /** A user-supplied gradient; overrides the preset when valid. */
  custom: string;
  /**
   * How strongly `solid`/`gradient`/`image` paints, in percent. 100 is opaque;
   * lower values let the window (or an enabled material) show through.
   */
  opacity: number;
  /**
   * The picture for `image` mode, as a `file://` URL or an http(s) one. Empty
   * until the user picks one.
   */
  image: string;
}

/**
 * The fixed strength of the `transparent` mode: the theme's own background at 50%,
 * enough to keep sidebar text legible over the material.
 */
export const BACKDROP_TRANSPARENT_OPACITY = 50;

/** Drawn at 20% so a coloured background reads as a tint, not a wall of colour. */
export const BACKDROP_OPACITY_DEFAULT = 20;
export const BACKDROP_OPACITY_MIN = 0;
export const BACKDROP_OPACITY_MAX = 100;

export function clampBackdropOpacity(value: number): number {
  if (!Number.isFinite(value)) return BACKDROP_OPACITY_DEFAULT;
  return Math.min(
    BACKDROP_OPACITY_MAX,
    Math.max(BACKDROP_OPACITY_MIN, Math.round(value))
  );
}

/** Modes whose fill is affected by the tunable `opacity`. */
export function backdropUsesOpacity(mode: BackdropMode): boolean {
  return mode === "solid" || mode === "gradient" || mode === "image";
}

/**
 * The layer's own opacity, as a number 0..1.
 *
 * `transparent` uses its fixed strength, `solid`/`gradient` use the tuned one, and
 * the rest paint at full strength (they are the theme's own surface).
 */
export function backdropLayerOpacity(prefs: BackdropPrefs): number {
  if (prefs.mode === "transparent") return BACKDROP_TRANSPARENT_OPACITY / 100;
  if (backdropUsesOpacity(prefs.mode)) {
    return clampBackdropOpacity(prefs.opacity) / 100;
  }
  return 1;
}

/** Out of the box: the theme's own colour, no material showing through. */
export const BACKDROP_DEFAULTS: BackdropPrefs = {
  mode: "default",
  preset: "aurora",
  solid: "#f3f1ec",
  custom: "",
  opacity: BACKDROP_OPACITY_DEFAULT,
  image: "",
};

const MODES: BackdropMode[] = [
  "default",
  "transparent",
  "solid",
  "gradient",
  "image",
];

/**
 * Accepts a picture reference the page is allowed to load: an http(s) URL or a
 * `file://` path. `url(...)`, data URLs and inline CSS are refused, because the
 * value is written into a `url("…")` in the stylesheet and must not be able to
 * escape it or run script.
 */
export function isValidBackdropImage(value: string): boolean {
  const url = value.trim();
  if (url.length === 0 || url.length > 2048) return false;
  // No quotes, parentheses, angle brackets or whitespace: the value is written
  // into `url("…")`, and these could end it early. No `;`/`,` either, so it can
  // never add a declaration or a second background layer.
  if (/["'\\();,<>\s]/.test(url)) return false;
  return /^(https?:\/\/|file:\/\/)/i.test(url);
}

function isBackdropMode(value: unknown): value is BackdropMode {
  return typeof value === "string" && MODES.includes(value as BackdropMode);
}

function isBackdropPresetId(value: unknown): value is BackdropPresetId {
  return (
    typeof value === "string" &&
    BACKDROP_PRESETS.some((preset) => preset.id === value)
  );
}

/**
 * Accepts only what the page can safely paint: a gradient function with no
 * `url(...)` and no declaration separators. This blocks both broken CSS and a
 * value that would escape the property it is written into.
 */
export function isValidCustomGradient(value: string): boolean {
  const css = value.trim();
  if (css.length === 0 || css.length > 400) return false;
  if (!/^(linear|radial|conic)-gradient\(/i.test(css)) return false;
  if (/[;{}<>\\]/.test(css)) return false;
  if (/url\s*\(/i.test(css)) return false;
  // Balanced parentheses: a half-written gradient must not reach the stylesheet.
  let depth = 0;
  for (const ch of css) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/** Accepts `#rgb`, `#rrggbb` and `#rrggbbaa` only, normalising to `#rrggbb`. */
export function normalizeHexColor(value: string): string | null {
  const css = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(css);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(css);
  if (full) return `#${full[1]}`;
  return null;
}

/** The opaque fill of a colour, gradient or image mode, ignoring opacity. */
function opaqueFill(prefs: BackdropPrefs, mode: "light" | "dark"): string {
  if (prefs.mode === "image") {
    // An unusable picture falls back to the theme surface rather than leaving a
    // blank window; the settings page flags the bad value.
    if (!isValidBackdropImage(prefs.image)) return "var(--sidebar)";
    // `--background` underneath, so a photo with transparent parts or a very
    // light one still leaves the chrome looking deliberate.
    return `url("${prefs.image.trim()}") center / cover no-repeat, var(--background)`;
  }
  if (prefs.mode === "solid") {
    // An unfinished colour falls back to the theme's own, so a half-typed hex
    // never leaves the window blank.
    return normalizeHexColor(prefs.solid) ?? "var(--sidebar)";
  }
  if (isValidCustomGradient(prefs.custom)) return prefs.custom.trim();
  const preset =
    BACKDROP_PRESETS.find((entry) => entry.id === prefs.preset) ??
    BACKDROP_PRESETS[0];
  return mode === "dark" ? preset.dark : preset.light;
}

/**
 * The CSS `background` value for the layer.
 *
 * `transparent` is the only value that lets the window show through completely;
 * it is what makes an enabled window material visible. `default` paints the
 * theme's own colour, and `solid`/`gradient` paint their fill at `opacity`.
 *
 * The chrome above the layer is always transparent, so whatever this returns is
 * also what the sidebar shows.
 */
export function resolveBackdropBackground(
  prefs: BackdropPrefs,
  mode: "light" | "dark"
): string {
  switch (prefs.mode) {
    case "transparent":
      // Not fully clear: a half-strength wash of the theme background keeps the
      // sidebar readable, and the window material still shows through.
      return "var(--background)";
    case "solid":
    case "gradient":
    case "image":
      // Painted at full strength; the layer's own opacity does the fading, since
      // `color-mix` only accepts a <color> and gradients/images are <image>.
      return opaqueFill(prefs, mode);
    case "default":
    default:
      // The theme's chrome colour, painted here rather than by <body> or the
      // shell, so an enabled window material stays covered instead of showing
      // through. `--sidebar` is what the sidebar itself used to paint.
      return "var(--sidebar)";
  }
}

/**
 * Reads a stored mode, mapping the shapes older builds wrote:
 * a preset id (pre-mode builds) meant a gradient, and `"none"` meant "paint
 * nothing", which is what `"default"` now says explicitly.
 */
function migrateMode(rawMode: unknown, rawPreset: unknown): BackdropMode {
  if (isBackdropMode(rawMode)) return rawMode;
  if (rawMode === "none") return "default";
  if (isBackdropPresetId(rawPreset)) return "gradient";
  return BACKDROP_DEFAULTS.mode;
}

/** Reads the local mirror of the background preference. */
export function getBackdropPreference(): BackdropPrefs {
  if (typeof localStorage === "undefined") return { ...BACKDROP_DEFAULTS };
  try {
    const raw = localStorage.getItem(BACKDROP_STORAGE_KEY);
    if (!raw) return { ...BACKDROP_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BackdropPrefs> & {
      /** Legacy shape: a preset id plus an optional custom gradient. */
      preset?: unknown;
    };
    return {
      mode: migrateMode(parsed.mode, parsed.preset),
      preset: isBackdropPresetId(parsed.preset)
        ? parsed.preset
        : BACKDROP_DEFAULTS.preset,
      solid:
        typeof parsed.solid === "string" && normalizeHexColor(parsed.solid)
          ? normalizeHexColor(parsed.solid)!
          : BACKDROP_DEFAULTS.solid,
      custom: typeof parsed.custom === "string" ? parsed.custom : "",
      image: typeof parsed.image === "string" ? parsed.image : "",
      opacity:
        typeof parsed.opacity === "number"
          ? clampBackdropOpacity(parsed.opacity)
          : BACKDROP_DEFAULTS.opacity,
    };
  } catch {
    return { ...BACKDROP_DEFAULTS };
  }
}

/**
 * Publishes the layer's colour as `--app-backdrop`, which index.css reads.
 *
 * The layer is a real element (`data-slot="backdrop"` in router.tsx) rather than
 * a body background so that stacking stays predictable, and the value lives on
 * <html> so index.html's first-paint script can set it before React runs.
 */
export function applyBackdrop(prefs: BackdropPrefs, mode: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--app-backdrop", resolveBackdropBackground(prefs, mode));
  // "default" and "transparent" are not faded: they mean "the theme's surface"
  // and "fully clear" respectively.
  root.style.setProperty(
    "--app-backdrop-opacity",
    String(backdropLayerOpacity(prefs))
  );
}
