import type { BackgroundTexture, BackgroundTheme, Board, BoardAppearance, BoardZone, FontScale } from "@/lib/types";
import { DEFAULT_IMAGE_SIZE_LIMIT_MB, DEFAULT_TEXT_CHAR_LIMIT } from "@/lib/constants";

const DEFAULT_APPEARANCE: Board["appearance"] = {
  background_theme: "soft", background_color: null, background_texture: "none", background_image_url: null,
  client_logo_url: null, show_org_logo: true, card_style: "elevated", font_scale: "md",
};
const DEFAULT_PARTICIPATION: Board["participation"] = {
  allow_text: true, allow_image: true, allow_giphy: true, allow_youtube: true, name_policy: "optional", anonymous_allowed: true,
  multiple_submissions: true, text_char_limit: DEFAULT_TEXT_CHAR_LIMIT,
  image_size_limit_mb: DEFAULT_IMAGE_SIZE_LIMIT_MB, allow_participant_edit: false,
  allow_participant_delete: true,
};
const DEFAULT_MODERATION: Board["moderation"] = {
  mode: "immediate", hide_identity_on_display: false, blocked_words: [],
};

/**
 * Fill a board row with complete defaults. Boards created by an earlier app
 * version predate fields such as `zones` and `tags`, so their stored shape is
 * partial; screens that read those fields (iterating `tags`, mapping `zones`,
 * reading nested appearance/participation/moderation keys) would otherwise
 * throw. Both data backends pass boards through here on read, so the UI always
 * receives a complete object. Idempotent for already-complete boards.
 */
export function normalizeBoard(board: Board): Board {
  return {
    ...board,
    instructions: board.instructions ?? "",
    appearance: { ...DEFAULT_APPEARANCE, ...(board.appearance ?? {}) },
    participation: { ...DEFAULT_PARTICIPATION, ...(board.participation ?? {}) },
    moderation: { ...DEFAULT_MODERATION, ...(board.moderation ?? {}) },
    sharing: board.sharing ?? "private",
    default_layout: board.default_layout ?? "wall",
    default_sort: board.default_sort ?? "newest",
    zones: Array.isArray(board.zones) ? board.zones : [],
    tags: Array.isArray(board.tags) ? board.tags : [],
    collaborator_ids: Array.isArray(board.collaborator_ids) ? board.collaborator_ids : [],
  };
}

/** Normalised zone list (empty when the board is undivided). */
export function boardZones(board: Pick<Board, "zones">): BoardZone[] {
  return Array.isArray(board.zones) ? board.zones : [];
}

/** True when the board is divided into 2–4 named regions. */
export function isZoned(board: Pick<Board, "zones">): boolean {
  return boardZones(board).length >= 2;
}

export interface ThemeVisual {
  /** CSS background value for the board surface. */
  background: string;
  /** Whether text on this background should be light. */
  dark: boolean;
  /** Chip/preview accent used in thumbnails. */
  chip: string;
  label: string;
}

export const THEME_VISUALS: Record<BackgroundTheme, ThemeVisual> = {
  light: { background: "#f7f7f8", dark: false, chip: "rgba(255,255,255,.95)", label: "בהיר" },
  soft: { background: "var(--gradient-magenta-soft)", dark: false, chip: "rgba(255,255,255,.92)", label: "מגנטה רך" },
  ink: { background: "var(--gradient-ink-magenta)", dark: true, chip: "rgba(255,255,255,.88)", label: "כהה" },
  metal: { background: "var(--gradient-metallic-v)", dark: false, chip: "rgba(255,255,255,.9)", label: "מתכתי" },
};

/** Texture picker metadata (labels are Hebrew i18n keys). */
export const BACKGROUND_TEXTURES: Record<BackgroundTexture, { label: string }> = {
  none: { label: "חלק" },
  dots: { label: "נקודות" },
  grid: { label: "רשת" },
  diagonal: { label: "אלכסונים" },
  noise: { label: "גרעיניות" },
};

/**
 * CSS background layer for a texture, tuned for the underlying tone.
 * All textures are generated in CSS/inline-SVG — no external assets, so they
 * work offline and cost nothing to load on the projector.
 */
export function textureLayer(texture: BackgroundTexture, dark: boolean): string | null {
  const c = dark ? "rgba(255,255,255,.09)" : "rgba(8,8,16,.07)";
  switch (texture) {
    case "dots":
      return `radial-gradient(${c} 1.4px, transparent 1.5px) 0 0 / 26px 26px repeat`;
    case "grid":
      return `linear-gradient(${c} 1px, transparent 1px) 0 0 / 44px 44px repeat, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0 / 44px 44px repeat`;
    case "diagonal":
      return `repeating-linear-gradient(45deg, ${c} 0 1.5px, transparent 1.5px 18px)`;
    case "noise": {
      const opacity = dark ? "0.14" : "0.08";
      const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E`;
      return `url("data:image/svg+xml,${svg}") 0 0 / 220px 220px repeat`;
    }
    default:
      return null;
  }
}

export function themeVisual(appearance: Pick<BoardAppearance, "background_theme" | "background_color" | "background_texture">): ThemeVisual {
  const preset = THEME_VISUALS[appearance.background_theme];
  // A custom solid color (from the color wheel) overrides the preset background.
  const custom = appearance.background_color;
  const dark = custom ? isColorDark(custom) : preset.dark;
  const baseBackground = custom ?? preset.background;
  const layer = textureLayer(appearance.background_texture ?? "none", dark);
  // Multi-layer shorthand: texture pattern(s) painted over the base background.
  const background = layer ? `${layer}, ${baseBackground}` : baseBackground;
  return { ...preset, background, dark };
}

/** Rough luminance check to decide light vs dark text over a solid color. */
export function isColorDark(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/** Multiplier applied to display typography by the board's font scale. */
export const FONT_SCALE_FACTOR: Record<FontScale, number> = {
  sm: 0.88,
  md: 1,
  lg: 1.18,
};

/** Deterministic gradient for seed image placeholders (media_url = "seed-..."). */
export const SEED_IMAGE_GRADIENTS = [
  "var(--gradient-magenta-soft)",
  "var(--gradient-magenta)",
  "var(--gradient-metallic)",
  "var(--gradient-ink-magenta)",
];

export function seedGradientFor(mediaUrl: string): string {
  const n = mediaUrl.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SEED_IMAGE_GRADIENTS[n % SEED_IMAGE_GRADIENTS.length]!;
}

export function isSeedImage(mediaUrl: string | null): boolean {
  return !!mediaUrl && mediaUrl.startsWith("seed-");
}
