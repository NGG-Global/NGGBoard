/**
 * Domain model for NGG Boards.
 *
 * These types intentionally mirror the relational schema in
 * `supabase/migrations` so the local data layer and a future Supabase backend
 * share one contract. Field names use snake_case to match Postgres columns.
 */

export type Role = "org_admin" | "board_creator" | "co_editor" | "facilitator";

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: Role;
  avatar_url: string | null;
  created_at: string;
}

export type BoardStatus = "draft" | "ready" | "archived";

/** Named presets from the design system's ThemePicker. */
export type BackgroundTheme = "light" | "soft" | "ink" | "metal";

export type CardStyle = "elevated" | "flat" | "outline";
export type FontScale = "sm" | "md" | "lg";
export type DisplayLayout = "wall" | "mosaic" | "feed";
export type SortOrder = "newest" | "oldest";

/** How participants must present a name. */
export type NamePolicy = "required" | "optional" | "disabled";

/** How submissions become visible on the board. */
export type ModerationMode = "immediate" | "approval";

/** Who can find / open the board inside the organization. */
export type SharingLevel = "private" | "selected" | "team" | "organization" | "link";

export interface BoardParticipationSettings {
  allow_text: boolean;
  allow_image: boolean;
  name_policy: NamePolicy;
  anonymous_allowed: boolean;
  multiple_submissions: boolean;
  text_char_limit: number;
  image_size_limit_mb: number;
  allow_participant_edit: boolean;
  allow_participant_delete: boolean;
}

export interface BoardModerationSettings {
  mode: ModerationMode;
  hide_identity_on_display: boolean;
  blocked_words: string[];
}

/** A named region of the board. A board has 1–4 zones; 1 = undivided. */
export interface BoardZone {
  id: string;
  title: string;
  subtitle: string;
}

export interface BoardAppearance {
  background_theme: BackgroundTheme;
  background_color: string | null;
  background_image_url: string | null;
  client_logo_url: string | null;
  show_org_logo: boolean;
  card_style: CardStyle;
  font_scale: FontScale;
}

/** A dashboard folder. Boards link to it by `Board.folder` (the folder name). */
export interface Folder {
  id: string;
  organization_id: string;
  name: string;
  sort: number;
  created_at: string;
}

/** A folder plus how many (non-archived) boards it holds — what the UI renders. */
export interface FolderSummary {
  name: string;
  count: number;
}

/** Compact stats from a board's most recent ended session, for the board card. */
export interface LastSession {
  participants: number;
  items: number;
  endedAt: string;
}

export interface Board {
  id: string;
  organization_id: string;
  created_by: string;
  internal_name: string;
  public_title: string;
  public_subtitle: string;
  internal_description: string;
  status: BoardStatus;
  appearance: BoardAppearance;
  participation: BoardParticipationSettings;
  moderation: BoardModerationSettings;
  sharing: SharingLevel;
  default_layout: DisplayLayout;
  default_sort: SortOrder;
  /** 1–4 named regions. Length < 2 means the board is undivided. */
  zones: BoardZone[];
  tags: string[];
  folder: string | null;
  collaborator_ids: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  last_activated_at: string | null;
}

/**
 * Live room lifecycle. `ready` is a pre-activation staging state; `active` is
 * the running session. See spec "Live room lifecycle".
 */
export type RoomStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "read_only"
  | "suspended"
  | "ended"
  | "archived";

export interface LiveRoom {
  id: string;
  board_id: string;
  organization_id: string;
  /** Non-guessable public identifier used in /join and /display URLs. */
  public_id: string;
  /** Human-friendly numeric code, e.g. "739428". */
  room_code: string;
  session_label: string | null;
  status: RoomStatus;
  layout: DisplayLayout;
  /** Currently focused submission shown large on the display. */
  focused_submission_id: string | null;
  /** Whether the QR overlay is forced onto the public display. */
  qr_overlay_visible: boolean;
  facilitator_ids: string[];
  participant_count: number;
  started_at: string | null;
  ended_at: string | null;
  /** Server timestamp of the last *meaningful* activity (drives suspension). */
  last_activity_at: string;
  created_by: string;
  created_at: string;
}

export type SubmissionType = "text" | "image";

/**
 * Moderation/visibility lifecycle of a single submission.
 * `pending` -> awaiting facilitator approval (approval mode only).
 * `published` -> visible on the display.
 * `hidden` -> removed from display but recoverable.
 * `rejected` -> declined in moderation.
 * `deleted` -> soft-deleted (undoable for a short window).
 */
export type SubmissionStatus = "pending" | "published" | "hidden" | "rejected" | "deleted";

export interface Submission {
  id: string;
  room_id: string;
  organization_id: string;
  type: SubmissionType;
  text_content: string | null;
  media_url: string | null;
  /** Which board zone this belongs to (null when the board is undivided). */
  zone_id: string | null;
  participant_session_id: string;
  display_name: string | null;
  anonymous: boolean;
  status: SubmissionStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParticipantSession {
  id: string;
  room_id: string;
  display_name: string | null;
  created_at: string;
  last_seen_at: string;
}

export type ModerationActionType =
  | "approve"
  | "reject"
  | "hide"
  | "restore"
  | "delete"
  | "pin"
  | "unpin"
  | "focus"
  | "unfocus";

export interface ModerationAction {
  id: string;
  room_id: string;
  submission_id: string | null;
  actor_id: string;
  action: ModerationActionType;
  created_at: string;
}

export type ActivityEventType =
  | "participant_joined"
  | "submission_created"
  | "submission_approved"
  | "submission_rejected"
  | "facilitator_action"
  | "room_activated"
  | "room_paused"
  | "room_resumed"
  | "room_suspended"
  | "room_reactivated"
  | "room_ended";

export interface ActivityEvent {
  id: string;
  room_id: string;
  type: ActivityEventType;
  actor_id: string | null;
  /** True for events that reset the inactivity timer. */
  meaningful: boolean;
  created_at: string;
}

/** A completed/aggregated session row for the board's session history. */
export interface SessionSummary {
  room: LiveRoom;
  submission_count: number;
  published_count: number;
  duration_minutes: number | null;
}
