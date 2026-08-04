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

/** CSS-generated background texture overlaid on the board background. */
export type BackgroundTexture = "none" | "dots" | "grid" | "diagonal" | "noise";

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
  /** Allow picking a GIF / sticker from the Giphy library. */
  allow_giphy: boolean;
  /** Allow searching / linking a YouTube video. */
  allow_youtube: boolean;
  name_policy: NamePolicy;
  anonymous_allowed: boolean;
  multiple_submissions: boolean;
  text_char_limit: number;
  image_size_limit_mb: number;
  allow_participant_edit: boolean;
  allow_participant_delete: boolean;
  /**
   * Whether participants may reply to posts on the board. Opt-in: the
   * facilitator can always reply, but participant-to-participant discussion is
   * a different kind of board and should be a deliberate choice.
   */
  allow_participant_comments: boolean;
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
  background_texture: BackgroundTexture;
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
  /**
   * The facilitator's brief to participants — several lines, shown on the
   * participant's opening screen and pinned above the board.
   *
   * Distinct from `public_subtitle` on purpose: the subtitle is a one-line
   * strapline rendered large in the projector header, so it can't carry a
   * multi-paragraph brief. On an open board nobody is in the room to explain
   * the task, which makes this the participant's only context.
   */
  instructions: string;
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
  /**
   * Content the facilitator authors while building the board, which is on the
   * board from the moment it opens — guidance cards, a reference image, a video
   * to watch before contributing.
   *
   * Stored on the BOARD rather than as submissions because the board is edited
   * before any room exists to attach a submission to. Each activation copies
   * them into that room's submissions, so every session of the board opens with
   * the same framing and they flow through moderation, the display, results and
   * export as ordinary posts.
   */
  seed_posts: BoardSeedPost[];
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

/**
 * How a room collects content.
 *
 * `live` — a facilitated session happening now. Auto-suspends after 30 minutes
 *   without activity, because an abandoned live room shouldn't stay open.
 * `open` — an ongoing collection window. The facilitator publishes the link once
 *   and participants contribute over days or weeks, so inactivity must NOT
 *   suspend it: a link that dies half an hour after it was sent reads to a
 *   participant as a broken system. It closes on `closes_at`, or when the
 *   facilitator closes it.
 */
export type RoomMode = "live" | "open";

export interface LiveRoom {
  id: string;
  board_id: string;
  organization_id: string;
  /** Non-guessable public identifier used in /join and /display URLs. */
  public_id: string;
  /** Human-friendly numeric code, e.g. "739428". */
  room_code: string;
  session_label: string | null;
  mode: RoomMode;
  /**
   * Open rooms: the moment collection stops accepting new content (null = no
   * deadline, open until closed by hand). Enforced server-side as well as in
   * the UI — a client-only deadline would be trivially bypassable.
   */
  closes_at: string | null;
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

export type SubmissionType = "text" | "image" | "video";

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
  /** Null on a facilitator's own post — it comes from no participant session. */
  participant_session_id: string | null;
  /**
   * Set when the post is the facilitator's own (materialized from the board's
   * `seed_posts`, or added during a session). Exactly one of this and
   * `participant_session_id` is set; see `isFacilitatorPost`.
   */
  author_profile_id: string | null;
  display_name: string | null;
  anonymous: boolean;
  status: SubmissionStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A post the facilitator writes into the board at edit time. Deliberately a
 * subset of `Submission`: no author, status or room — those are decided when a
 * room is activated and the seed post becomes a real submission.
 */
export interface BoardSeedPost {
  /** Stable within the board, so reordering and editing don't lose identity. */
  id: string;
  type: SubmissionType;
  text: string;
  /** Data URL / CDN URL for an image, or a YouTube watch URL for a video. */
  media_url: string | null;
  /** Which zone it opens in (null when the board is undivided). */
  zone_id: string | null;
  /** Keep it at the front of the board as content arrives. */
  pinned: boolean;
}

/**
 * A reply on a post. Written either by the facilitator (`author_profile_id`) or,
 * when the board allows it, by a participant (`participant_session_id`).
 */
export interface SubmissionComment {
  id: string;
  submission_id: string;
  room_id: string;
  organization_id: string;
  body: string;
  author_profile_id: string | null;
  participant_session_id: string | null;
  display_name: string | null;
  anonymous: boolean;
  /** Only `published`, `hidden` and `deleted` are used for comments. */
  status: SubmissionStatus;
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
  | "comment_created"
  | "submission_approved"
  | "submission_rejected"
  | "facilitator_action"
  | "room_activated"
  | "room_paused"
  | "room_resumed"
  | "room_suspended"
  | "room_reactivated"
  | "room_ended"
  /** An open collection reached its deadline and stopped accepting content. */
  | "collection_closed";

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
