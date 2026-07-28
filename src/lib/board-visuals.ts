import type { BackgroundTheme, Board, BoardAppearance, BoardZone, FontScale } from "@/lib/types";
import { DEFAULT_IMAGE_SIZE_LIMIT_MB, DEFAULT_TEXT_CHAR_LIMIT } from "@/lib/constants";

const DEFAULT_APPEARANCE: Board["appearance"] = {
  background_theme: "soft", background_color: null, background_image_url: null,
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

export function themeVisual(appearance: Pick<BoardAppearance, "background_theme" | "background_color">): ThemeVisual {
  const base = THEME_VISUALS[appearance.background_theme];
  if (appearance.background_color) {
    // A custom solid color overrides the preset background.
    const isDark = isColorDark(appearance.background_color);
    return { ...base, background: appearance.background_color, dark: isDark };
  }
  return base;
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
