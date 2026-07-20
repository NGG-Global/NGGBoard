/** Inactivity lifecycle thresholds, in milliseconds. See spec "Live room lifecycle". */
export const INACTIVITY_WARNING_MS = 25 * 60 * 1000; // 25 min → warn facilitator
export const INACTIVITY_SUSPEND_MS = 30 * 60 * 1000; // 30 min → auto-suspend

/** How long a soft-deleted submission stays undoable in the UI. */
export const UNDO_WINDOW_MS = 6000;

/** Minimum interval between submissions from one participant (rate limiting). */
export const SUBMISSION_RATE_LIMIT_MS = 3000;

/** Defaults applied to a fresh board. */
export const DEFAULT_TEXT_CHAR_LIMIT = 280;
export const DEFAULT_IMAGE_SIZE_LIMIT_MB = 8;

/** Accepted image mime types for participant uploads. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Public base used for join links shown in the control room / QR. */
export const JOIN_LINK_LABEL_HOST = "ngg.live";
