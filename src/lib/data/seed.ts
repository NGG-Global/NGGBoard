import type {
  ActivityEvent,
  Board,
  Folder,
  LiveRoom,
  ModerationAction,
  Organization,
  SubmissionComment,
  ParticipantSession,
  Profile,
  Submission,
} from "@/lib/types";
import { DEFAULT_IMAGE_SIZE_LIMIT_MB, DEFAULT_TEXT_CHAR_LIMIT } from "@/lib/constants";

export interface Database {
  organizations: Organization[];
  profiles: Profile[];
  folders: Folder[];
  boards: Board[];
  rooms: LiveRoom[];
  submissions: Submission[];
  participants: ParticipantSession[];
  activity: ActivityEvent[];
  moderation: ModerationAction[];
  comments: SubmissionComment[];
}

const ORG_ID = "org_ngg";
export const CURRENT_USER_ID = "user_dor";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function defaultParticipation(overrides: Partial<Board["participation"]> = {}): Board["participation"] {
  return {
    allow_text: true,
    allow_image: true,
    allow_giphy: true,
    allow_youtube: true,
    name_policy: "optional",
    anonymous_allowed: true,
    multiple_submissions: true,
    text_char_limit: DEFAULT_TEXT_CHAR_LIMIT,
    image_size_limit_mb: DEFAULT_IMAGE_SIZE_LIMIT_MB,
    allow_participant_edit: false,
    allow_participant_delete: true,
    allow_participant_comments: false,
    ...overrides,
  };
}

function defaultModeration(overrides: Partial<Board["moderation"]> = {}): Board["moderation"] {
  return { mode: "immediate", hide_identity_on_display: false, blocked_words: [], ...overrides };
}

function appearance(overrides: Partial<Board["appearance"]> = {}): Board["appearance"] {
  return {
    background_theme: "soft",
    background_color: null,
    background_texture: "none",
    background_image_url: null,
    client_logo_url: null,
    show_org_logo: true,
    card_style: "elevated",
    font_scale: "md",
    ...overrides,
  };
}

export function buildSeed(): Database {
  const org: Organization = {
    id: ORG_ID,
    name: "נירם גיתן — NGG",
    logo_url: "/brand/ngg-logo.png",
    created_at: iso(400 * DAY),
  };

  const profiles: Profile[] = [
    {
      id: CURRENT_USER_ID,
      organization_id: ORG_ID,
      full_name: "דור ואנונו",
      email: "Dor_va@nggconsult.com",
      role: "org_admin",
      avatar_url: null,
      created_at: iso(390 * DAY),
    },
    {
      id: "user_dana",
      organization_id: ORG_ID,
      full_name: "דנה פרידמן",
      email: "dana@nggconsult.com",
      role: "board_creator",
      avatar_url: null,
      created_at: iso(300 * DAY),
    },
    {
      id: "user_yoav",
      organization_id: ORG_ID,
      full_name: "יואב לוי",
      email: "yoav@nggconsult.com",
      role: "facilitator",
      avatar_url: null,
      created_at: iso(200 * DAY),
    },
  ];

  const boards: Board[] = [
    {
      id: "board_innovation",
      organization_id: ORG_ID,
      created_by: CURRENT_USER_ID,
      internal_name: "סדנת חדשנות — הנהלה 2026",
      public_title: "קיר רעיונות — סדנת חדשנות 2026",
      public_subtitle: "איזה רעיון אחד תרצו שנאמץ כבר השנה?",
      instructions: "",
      internal_description: "מפגש פתיחה לסדנת החדשנות של ההנהלה הבכירה.",
      status: "ready",
      appearance: appearance({ background_theme: "ink", client_logo_url: null }),
      participation: defaultParticipation({ name_policy: "optional" }),
      moderation: defaultModeration({ mode: "immediate" }),
      sharing: "organization",
      default_layout: "wall",
      default_sort: "newest",
      zones: [],
      seed_posts: [],
      tags: ["חדשנות", "הנהלה"],
      folder: "סדנאות",
      collaborator_ids: ["user_yoav"],
      created_at: iso(20 * DAY),
      updated_at: iso(1 * DAY),
      archived_at: null,
      last_activated_at: iso(42 * MIN),
    },
    {
      id: "board_qa",
      organization_id: ORG_ID,
      created_by: "user_dana",
      internal_name: "שאלות ותשובות — כנס לקוחות",
      public_title: "שאלות ותשובות — כנס לקוחות",
      public_subtitle: "מה תרצו לשאול את הפאנל?",
      instructions: "",
      internal_description: "לוח שאלות פתוח לכנס הלקוחות השנתי.",
      status: "ready",
      appearance: appearance({ background_theme: "soft" }),
      participation: defaultParticipation({ allow_image: false, name_policy: "required" }),
      moderation: defaultModeration({ mode: "approval" }),
      sharing: "selected",
      default_layout: "feed",
      default_sort: "newest",
      zones: [],
      seed_posts: [],
      tags: ["כנס", "לקוחות"],
      folder: "אירועים",
      collaborator_ids: [CURRENT_USER_ID],
      created_at: iso(35 * DAY),
      updated_at: iso(3 * DAY),
      archived_at: null,
      last_activated_at: iso(9 * DAY),
    },
    {
      id: "board_retro",
      organization_id: ORG_ID,
      created_by: CURRENT_USER_ID,
      internal_name: "רטרוספקטיבה — צוות פיתוח",
      public_title: "רטרוספקטיבה — מה נשמור ומה נשפר",
      public_subtitle: "מה עבד טוב ברבעון האחרון, ומה כדאי לשנות?",
      instructions: "",
      internal_description: "",
      status: "draft",
      appearance: appearance({ background_theme: "light", card_style: "flat" }),
      participation: defaultParticipation({ multiple_submissions: true }),
      moderation: defaultModeration(),
      sharing: "private",
      default_layout: "wall",
      default_sort: "newest",
      zones: [],
      seed_posts: [],
      tags: ["רטרו"],
      folder: "צוות פיתוח",
      collaborator_ids: [],
      created_at: iso(2 * HOUR),
      updated_at: iso(1 * HOUR),
      archived_at: null,
      last_activated_at: null,
    },
    {
      id: "board_prework",
      organization_id: ORG_ID,
      created_by: CURRENT_USER_ID,
      internal_name: "עבודה מקדימה — מנהלים חדשים",
      public_title: "לפני שנפגשים — מה מאתגר אותך בניהול?",
      public_subtitle: "שתפו אתגר אחד מהשבועות האחרונים",
      instructions:
        "לפני המפגש בשבוע הבא נבקש מכל אחת ואחד מכם לשתף אתגר ניהולי אמיתי מהתקופה האחרונה.\n" +
        "אין צורך בניסוח מלוטש — כמה שורות מספיקות. אפשר גם תמונה או צילום מסך אם זה עוזר להמחיש.\n" +
        "אנחנו נבנה מהשיתופים שלכם את התרגול במפגש עצמו, כך שמה שתעלו כאן הוא החומר שנעבוד עליו.",
      internal_description: "איסוף מקדים לקראת מפגש 3 בתוכנית מנהלים חדשים.",
      status: "ready",
      appearance: appearance({ background_theme: "light" }),
      participation: defaultParticipation({ name_policy: "optional", allow_youtube: false }),
      moderation: defaultModeration({ mode: "approval" }),
      sharing: "selected",
      default_layout: "wall",
      default_sort: "oldest",
      zones: [],
      // Opening content the facilitator wrote while building the board. Copied
      // into every room this board activates, so the board is never empty when
      // the first participant arrives.
      seed_posts: [
        {
          id: "sp_frame",
          type: "text",
          text: "אתגר טוב לשיתוף הוא כזה שעוד לא פתרתם. מה שמסתדר מעצמו פחות מעניין אותנו כאן.",
          media_url: null,
          zone_id: null,
          pinned: true,
        },
        {
          id: "sp_example",
          type: "text",
          text: "דוגמה: \"עובדת מוכשרת שמסרבת לקחת אחריות על פרויקט, ואני לא מבין אם זה חוסר ביטחון או חוסר עניין.\"",
          media_url: null,
          zone_id: null,
          pinned: false,
        },
      ],
      tags: ["מנהלים", "עבודה מקדימה"],
      folder: "סדנאות",
      collaborator_ids: ["user_dana"],
      created_at: iso(11 * DAY),
      updated_at: iso(6 * DAY),
      archived_at: null,
      last_activated_at: iso(6 * DAY),
    },
    {
      id: "board_photowall",
      organization_id: ORG_ID,
      created_by: "user_yoav",
      internal_name: "קיר תמונות — יום גיבוש",
      public_title: "קיר תמונות — יום גיבוש 2025",
      public_subtitle: "שתפו רגע אחד בלתי נשכח מהיום",
      instructions: "",
      internal_description: "",
      status: "archived",
      appearance: appearance({ background_theme: "metal" }),
      participation: defaultParticipation({ allow_text: false, name_policy: "optional" }),
      moderation: defaultModeration(),
      sharing: "organization",
      default_layout: "mosaic",
      default_sort: "newest",
      zones: [],
      seed_posts: [],
      tags: ["גיבוש"],
      folder: "אירועים",
      collaborator_ids: [],
      created_at: iso(120 * DAY),
      updated_at: iso(90 * DAY),
      archived_at: iso(85 * DAY),
      last_activated_at: iso(100 * DAY),
    },
  ];

  // One active room for the innovation board (drives "Active now").
  const activeRoom: LiveRoom = {
    id: "room_active",
    board_id: "board_innovation",
    organization_id: ORG_ID,
    public_id: "r-8fk2p9qd3m7x",
    room_code: "739428",
    session_label: "קבוצת בוקר",
    mode: "live",
    closes_at: null,
    status: "active",
    layout: "wall",
    focused_submission_id: "sub_3",
    qr_overlay_visible: false,
    facilitator_ids: [CURRENT_USER_ID],
    participant_count: 23,
    started_at: iso(42 * MIN),
    ended_at: null,
    last_activity_at: iso(2 * MIN),
    created_by: CURRENT_USER_ID,
    created_at: iso(42 * MIN),
  };

  // A prior, ended session for session history.
  const endedRoom: LiveRoom = {
    id: "room_past",
    board_id: "board_qa",
    organization_id: ORG_ID,
    public_id: "r-past0001qa",
    room_code: "204815",
    session_label: "מושב אחר הצהריים",
    mode: "live",
    closes_at: null,
    status: "ended",
    layout: "feed",
    focused_submission_id: null,
    qr_overlay_visible: false,
    facilitator_ids: ["user_dana"],
    participant_count: 47,
    started_at: iso(9 * DAY),
    ended_at: iso(9 * DAY - 78 * MIN),
    last_activity_at: iso(9 * DAY - 78 * MIN),
    created_by: "user_dana",
    created_at: iso(9 * DAY),
  };

  // An open collection window: opened a week ago, still accepting, closes in
  // three days. Idle for over a day — which must NOT suspend it (that is the
  // whole point of `mode: "open"`).
  const openRoom: LiveRoom = {
    id: "room_open",
    board_id: "board_prework",
    organization_id: ORG_ID,
    public_id: "r-prework24kb",
    room_code: "518073",
    session_label: "מחזור אביב",
    mode: "open",
    // End of day, three days out — the shape the facilitator's date picker
    // produces, so the demo shows the deadline the way a real one reads.
    closes_at: (() => {
      const d = new Date(now + 3 * DAY);
      d.setHours(23, 59, 0, 0);
      return d.toISOString();
    })(),
    status: "active",
    layout: "wall",
    focused_submission_id: null,
    qr_overlay_visible: false,
    facilitator_ids: [CURRENT_USER_ID],
    participant_count: 4,
    started_at: iso(6 * DAY),
    ended_at: null,
    last_activity_at: iso(26 * HOUR),
    created_by: CURRENT_USER_ID,
    created_at: iso(6 * DAY),
  };

  const rooms: LiveRoom[] = [activeRoom, openRoom, endedRoom];

  const P = (label: string) => `part_${label}`;
  const participants: ParticipantSession[] = [
    { id: P("noa"), room_id: "room_active", display_name: "נועה ברק", created_at: iso(38 * MIN), last_seen_at: iso(2 * MIN) },
    { id: P("yoav"), room_id: "room_active", display_name: "יואב לוי", created_at: iso(36 * MIN), last_seen_at: iso(3 * MIN) },
    { id: P("michal"), room_id: "room_active", display_name: "מיכל אדר", created_at: iso(34 * MIN), last_seen_at: iso(5 * MIN) },
    { id: P("anon1"), room_id: "room_active", display_name: null, created_at: iso(30 * MIN), last_seen_at: iso(6 * MIN) },
    { id: P("ron"), room_id: "room_active", display_name: "רון שגב", created_at: iso(25 * MIN), last_seen_at: iso(8 * MIN) },
    // Open collection: contributions spread across days, not minutes.
    { id: P("tamar"), room_id: "room_open", display_name: "תמר כהן", created_at: iso(5 * DAY), last_seen_at: iso(5 * DAY) },
    { id: P("eyal"), room_id: "room_open", display_name: "אייל מזרחי", created_at: iso(4 * DAY), last_seen_at: iso(4 * DAY) },
    { id: P("shira"), room_id: "room_open", display_name: "שירה אלון", created_at: iso(2 * DAY), last_seen_at: iso(2 * DAY) },
    { id: P("anon2"), room_id: "room_open", display_name: null, created_at: iso(26 * HOUR), last_seen_at: iso(26 * HOUR) },
  ];

  const mkSub = (
    id: string,
    over: Partial<Submission> & Pick<Submission, "participant_session_id"> & { agoMs: number },
  ): Submission => {
    const { agoMs, ...rest } = over;
    return {
      id,
      room_id: "room_active",
      organization_id: ORG_ID,
      type: "text",
      text_content: null,
      media_url: null,
      zone_id: null,
      author_profile_id: null,
      display_name: null,
      anonymous: false,
      status: "published",
      pinned: false,
      created_at: iso(agoMs),
      updated_at: iso(agoMs),
      ...rest,
    };
  };

  const submissions: Submission[] = [
    mkSub("sub_1", {
      participant_session_id: P("noa"),
      type: "text",
      text_content: "להטמיע עוזר AI בתהליך קליטת עובדים חדשים — חוסך שבועיים של חפיפה",
      display_name: "נועה ברק",
      agoMs: 25 * MIN,
    }),
    mkSub("sub_2", {
      participant_session_id: P("yoav"),
      type: "image",
      media_url: "seed-gradient-1",
      display_name: "יואב לוי",
      agoMs: 22 * MIN,
    }),
    mkSub("sub_3", {
      participant_session_id: P("michal"),
      type: "text",
      text_content: "פחות מצגות, יותר סימולציות. הלמידה קורית כשעושים.",
      display_name: "מיכל אדר",
      pinned: true,
      agoMs: 18 * MIN,
    }),
    mkSub("sub_4", {
      participant_session_id: P("anon1"),
      type: "text",
      text_content: "שקיפות מלאה בנתוני הפרויקט מול הלקוח",
      display_name: null,
      anonymous: true,
      agoMs: 14 * MIN,
    }),
    mkSub("sub_5", {
      participant_session_id: P("ron"),
      type: "text",
      text_content: "מסלול מנטורינג הפוך — צעירים מלמדים מנהלים כלים חדשים",
      display_name: "רון שגב",
      agoMs: 9 * MIN,
    }),
    mkSub("sub_6", {
      participant_session_id: P("noa"),
      type: "text",
      text_content: "לקצר את מחזור ההחלטות מרבעון לשבועיים",
      display_name: "נועה ברק",
      status: "hidden",
      agoMs: 7 * MIN,
    }),
    // One submission waiting for approval (visible when board is in approval mode;
    // kept here to demonstrate the moderation queue after switching modes).
    mkSub("sub_7", {
      participant_session_id: P("anon1"),
      type: "text",
      text_content: "אימוץ מדדים של ערך ללקוח במקום מדדי תפוקה",
      display_name: null,
      anonymous: true,
      status: "pending",
      agoMs: 3 * MIN,
    }),
  ];

  // Open-collection submissions — days apart, one still awaiting approval
  // (the board collects in approval mode, as an unattended board should).
  const openSub = (
    id: string,
    over: Partial<Submission> & Pick<Submission, "participant_session_id"> & { agoMs: number },
  ): Submission => ({ ...mkSub(id, over), room_id: "room_open" });

  submissions.push(
    openSub("sub_o1", {
      participant_session_id: P("tamar"),
      text_content: "העברתי צוות לעבודה היברידית ואני לא מצליחה לשמור על תחושת שייכות. הפגישות יעילות אבל קרות.",
      display_name: "תמר כהן",
      agoMs: 5 * DAY,
    }),
    openSub("sub_o2", {
      participant_session_id: P("eyal"),
      text_content: "עובד ותיק שמתנגד לכל שינוי בתהליך. אני לא רוצה לאבד אותו אבל הוא מעכב את כל הצוות.",
      display_name: "אייל מזרחי",
      agoMs: 4 * DAY,
    }),
    openSub("sub_o3", {
      participant_session_id: P("shira"),
      text_content: "קיבלתי צוות אחרי מנהל אהוד מאוד, ואני מרגישה שכל החלטה שלי נמדדת מולו.",
      display_name: "שירה אלון",
      agoMs: 2 * DAY,
    }),
    openSub("sub_o4", {
      participant_session_id: P("anon2"),
      text_content: "אני נמנע משיחות משמעת. יודע שזה הכרחי ופשוט דוחה את זה שוב ושוב.",
      display_name: null,
      anonymous: true,
      status: "pending",
      agoMs: 26 * HOUR,
    }),
  );

  // The prework board's seed posts as they exist inside its open room. Written
  // out here because this room is constructed directly rather than through
  // activateRoom(), which is what materializes them in the running app.
  const facilitatorPost = (id: string, text: string, pinned: boolean, agoMs: number): Submission => ({
    id,
    room_id: "room_open",
    organization_id: ORG_ID,
    type: "text",
    text_content: text,
    media_url: null,
    zone_id: null,
    participant_session_id: null,
    author_profile_id: CURRENT_USER_ID,
    display_name: "דור ואנונו",
    anonymous: false,
    status: "published",
    pinned,
    created_at: iso(agoMs),
    updated_at: iso(agoMs),
  });

  submissions.push(
    facilitatorPost("sub_seed1", "אתגר טוב לשיתוף הוא כזה שעוד לא פתרתם. מה שמסתדר מעצמו פחות מעניין אותנו כאן.", true, 6 * DAY),
    facilitatorPost("sub_seed2", 'דוגמה: "עובדת מוכשרת שמסרבת לקחת אחריות על פרויקט, ואני לא מבין אם זה חוסר ביטחון או חוסר עניין."', false, 6 * DAY),
  );

  // A facilitator reply on a participant's contribution — the second feature.
  const comments: SubmissionComment[] = [
    {
      id: "cmt_1",
      submission_id: "sub_o1",
      room_id: "room_open",
      organization_id: ORG_ID,
      body: "תודה תמר. זה בדיוק סוג האתגר שנפתח איתו את המפגש — נעבוד עליו בקבוצה.",
      author_profile_id: CURRENT_USER_ID,
      participant_session_id: null,
      display_name: "דור ואנונו",
      anonymous: false,
      status: "published",
      created_at: iso(4 * DAY),
      updated_at: iso(4 * DAY),
    },
  ];

  const activity: ActivityEvent[] = [
    { id: "act_1", room_id: "room_active", type: "room_activated", actor_id: CURRENT_USER_ID, meaningful: true, created_at: iso(42 * MIN) },
    { id: "act_2", room_id: "room_active", type: "submission_created", actor_id: null, meaningful: true, created_at: iso(25 * MIN) },
    { id: "act_3", room_id: "room_active", type: "submission_created", actor_id: null, meaningful: true, created_at: iso(3 * MIN) },
  ];

  const moderation: ModerationAction[] = [];

  // Folder registry — matches the folders the seed boards already use, so they
  // have a stable order and demonstrate the (persisted) empty-folder capability.
  const folders: Folder[] = [
    { id: "folder_workshops", organization_id: ORG_ID, name: "סדנאות", sort: 0, created_at: iso(30 * DAY) },
    { id: "folder_events", organization_id: ORG_ID, name: "אירועים", sort: 1, created_at: iso(30 * DAY) },
    { id: "folder_dev", organization_id: ORG_ID, name: "צוות פיתוח", sort: 2, created_at: iso(30 * DAY) },
  ];

  return { organizations: [org], profiles, folders, boards, rooms, submissions, participants, activity, moderation, comments };
}
