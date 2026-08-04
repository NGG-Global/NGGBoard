"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { Board, BackgroundTexture, BackgroundTheme, BoardSeedPost, BoardZone, DisplayLayout, NamePolicy, SharingLevel } from "@/lib/types";
import { db } from "@/lib/data";
import { BACKGROUND_TEXTURES, THEME_VISUALS, themeVisual } from "@/lib/board-visuals";
import { boardFormSchema } from "@/lib/validation";
import { Button, ColorWheel, Input, Radio, Switch, Textarea, useToast } from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import { RoomActivationDialog } from "@/components/app/RoomActivationDialog";
import { useI18n } from "@/lib/i18n/react";
import { SeedPostsEditor } from "./SeedPostsEditor";
import { EditorSection } from "./EditorSection";
import { EditorPreview } from "./EditorPreview";

type Draft = {
  internal_name: string;
  public_title: string;
  public_subtitle: string;
  instructions: string;
  internal_description: string;
  appearance: Board["appearance"];
  participation: Board["participation"];
  moderation: Board["moderation"];
  sharing: SharingLevel;
  default_layout: DisplayLayout;
  default_sort: Board["default_sort"];
  zones: BoardZone[];
  seed_posts: BoardSeedPost[];
  tags: string[];
  folder: string | null;
};

function draftFromBoard(b: Board): Draft {
  return {
    internal_name: b.internal_name,
    public_title: b.public_title,
    public_subtitle: b.public_subtitle,
    instructions: b.instructions ?? "",
    internal_description: b.internal_description,
    appearance: { ...b.appearance },
    participation: { ...b.participation },
    moderation: { ...b.moderation },
    sharing: b.sharing,
    default_layout: b.default_layout,
    default_sort: b.default_sort,
    zones: Array.isArray(b.zones) ? b.zones.map((z) => ({ ...z })) : [],
    seed_posts: Array.isArray(b.seed_posts) ? b.seed_posts.map((sp) => ({ ...sp })) : [],
    tags: [...b.tags],
    folder: b.folder,
  };
}

function blankDraft(): Draft {
  const template = db.getBoard("board_retro");
  // Fall back to a hard-coded shape if seed changed.
  const base = template ?? {
    appearance: {
      background_theme: "soft" as BackgroundTheme,
      background_color: null,
      background_texture: "none" as const,
      background_image_url: null,
      client_logo_url: null,
      show_org_logo: true,
      card_style: "elevated" as const,
      font_scale: "md" as const,
    },
    participation: {
      allow_text: true,
      allow_image: true,
      allow_giphy: true,
      allow_youtube: true,
      name_policy: "optional" as NamePolicy,
      anonymous_allowed: false,
      multiple_submissions: true,
      text_char_limit: 280,
      image_size_limit_mb: 8,
      allow_participant_edit: false,
      allow_participant_delete: true,
      allow_participant_comments: false,
    },
    moderation: { mode: "immediate" as const, hide_identity_on_display: false, blocked_words: [] },
  };
  return {
    internal_name: "",
    public_title: "",
    public_subtitle: "",
    instructions: "",
    internal_description: "",
    appearance: { ...base.appearance, background_theme: "soft", client_logo_url: null },
    participation: { ...base.participation },
    moderation: { mode: "immediate", hide_identity_on_display: false, blocked_words: [] },
    sharing: "private",
    default_layout: "wall",
    default_sort: "newest",
    zones: [],
    seed_posts: [],
    tags: [],
    folder: null,
  };
}

/** Zone id helpers — stable ids z1..z4. */
function makeZones(count: number, prev: BoardZone[]): BoardZone[] {
  return Array.from({ length: count }, (_, i) => prev[i] ?? { id: `z${i + 1}`, title: "", subtitle: "" });
}

const SHARE_LABELS: Record<SharingLevel, string> = {
  private: "פרטי",
  selected: "אנשים נבחרים",
  team: "צוות",
  organization: "כל הארגון",
  link: "קישור ישיר",
};

const LAYOUT_LABELS: Record<DisplayLayout, string> = { wall: "קיר כרטיסים", mosaic: "פסיפס", feed: "פיד חי" };

export function BoardEditor({ boardId }: { boardId?: string }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const toast = useToast();
  const existing = boardId ? db.getBoard(boardId) : null;

  const [draft, setDraft] = useState<Draft>(() => (existing ? draftFromBoard(existing) : blankDraft()));
  const [dirty, setDirty] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [openSec, setOpenSec] = useState(1);
  const [activateOpen, setActivateOpen] = useState(false);
  const savedBoardRef = useRef<Board | null>(existing ?? null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    if (p.public_title !== undefined) setTitleError(null);
  }
  function patchAppearance(p: Partial<Draft["appearance"]>) {
    setDraft((d) => ({ ...d, appearance: { ...d.appearance, ...p } }));
    setDirty(true);
  }
  function patchParticipation(p: Partial<Draft["participation"]>) {
    setDraft((d) => ({ ...d, participation: { ...d.participation, ...p } }));
    setDirty(true);
  }
  function patchModeration(p: Partial<Draft["moderation"]>) {
    setDraft((d) => ({ ...d, moderation: { ...d.moderation, ...p } }));
    setDirty(true);
  }

  function doSave(): Board | null {
    const parsed = boardFormSchema.safeParse(draft);
    if (!parsed.success) {
      const titleIssue = parsed.error.issues.find((i) => i.path[0] === "public_title");
      // Schema messages are Hebrew i18n keys — translate at display time.
      setTitleError(titleIssue ? t(titleIssue.message) : t("יש למלא את השדות הנדרשים"));
      setOpenSec(1);
      return null;
    }
    const payload: Partial<Board> = {
      internal_name: draft.internal_name || draft.public_title,
      public_title: draft.public_title.trim(),
      public_subtitle: draft.public_subtitle,
      instructions: draft.instructions.trim(),
      internal_description: draft.internal_description,
      appearance: draft.appearance,
      participation: draft.participation,
      moderation: draft.moderation,
      sharing: draft.sharing,
      default_layout: draft.default_layout,
      default_sort: draft.default_sort,
      zones: draft.zones.length >= 2 ? draft.zones : [],
      seed_posts: draft.seed_posts,
      tags: draft.tags,
      folder: draft.folder,
      status: "ready",
    };
    const saved = existing ? db.updateBoard(existing.id, payload) : db.createBoard(payload);
    savedBoardRef.current = saved;
    setDirty(false);
    return saved;
  }

  const summaries = useMemo(() => {
    const perms = [draft.participation.allow_text && t("טקסט"), draft.participation.allow_image && t("תמונות"), draft.participation.allow_giphy && "GIF", draft.participation.allow_youtube && t("וידאו"), draft.participation.anonymous_allowed && t("אנונימי")]
      .filter(Boolean)
      .join(" · ") || t("ללא");
    return {
      s1: draft.public_title || t("עדיין ללא כותרת"),
      s2:
        (draft.appearance.background_color ? t("צבע מותאם אישית") : t(THEME_VISUALS[draft.appearance.background_theme].label)) +
        ((draft.appearance.background_texture ?? "none") !== "none" ? ` · ${t(BACKGROUND_TEXTURES[draft.appearance.background_texture].label)}` : ""),
      s3: perms,
      s4: draft.moderation.mode === "approval" ? t("אישור לפני הצגה") : t("הצגה מיידית"),
      s5: t(SHARE_LABELS[draft.sharing]),
      s6: t(LAYOUT_LABELS[draft.default_layout]),
      s7: draft.zones.length >= 2 ? t("{count} אזורים", { count: draft.zones.length }) : t("ללא חלוקה"),
      s8: draft.seed_posts.length ? t("{count} פריטי פתיחה", { count: draft.seed_posts.length }) : t("הלוח נפתח ריק"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang` re-derives the translated summaries on language change.
  }, [draft, lang]);

  const saveState = titleError ? t("שגיאה — חסרה כותרת") : dirty ? t("שינויים לא נשמרו") : existing ? t("נשמר") : t("טיוטה חדשה");
  const saveStateColor = titleError ? "var(--danger)" : dirty ? "var(--warning)" : "var(--text-subtle)";

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patchAppearance({ client_logo_url: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
      {/* Header */}
      <header style={{ height: 60, flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/app/boards")} className="ngg-hover" style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer", padding: "7px 10px", borderRadius: "var(--radius-lg)" }}>
          <IconChevron size={15} strokeWidth={2.2} />
          {t("הלוחות שלי")}
        </button>
        <div style={{ width: 1, height: 24, background: "var(--border)" }} />
        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>{existing ? t("עריכת לוח") : t("לוח חדש")}</div>
        <div style={{ fontSize: "var(--text-2xs)", color: saveStateColor, fontWeight: "var(--weight-semibold)" }}>{saveState}</div>
        <div style={{ flex: 1 }} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const saved = doSave();
            if (saved) {
              toast.show(t("הלוח נשמר — מוכן להפעלה"));
              router.push(`/app/boards/${saved.id}`);
            }
          }}
        >
          {t("שמור")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const saved = doSave();
            if (saved) setActivateOpen(true);
          }}
        >
          {t("שמור והפעל חדר")}
        </Button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0, flexWrap: "wrap" }}>
        {/* Config panel */}
        <div style={{ width: 396, flex: "1 1 340px", maxWidth: 460, overflowY: "auto", background: "var(--surface)", borderInlineEnd: "1px solid var(--border)", padding: "18px 18px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          <EditorSection index={1} title={t("פרטים בסיסיים")} summary={summaries.s1} open={openSec === 1} onToggle={() => setOpenSec(openSec === 1 ? 0 : 1)} error={!!titleError}>
            <Input label={t("כותרת ציבורית")} required value={draft.public_title} onChange={(e) => patch({ public_title: e.target.value })} error={titleError} hint={t("הכותרת שהמשתתפים והקהל יראו")} />
            <Input label={t("הנחיה למשתתפים")} value={draft.public_subtitle} onChange={(e) => patch({ public_subtitle: e.target.value })} hint={t("שאלה או משימה קצרה, למשל: מה לוקחים מהסדנה?")} />
            <Textarea
              label={t("הנחיות מפורטות (אופציונלי)")}
              value={draft.instructions}
              onChange={(e) => patch({ instructions: e.target.value.slice(0, 1200) })}
              rows={5}
              placeholder={t("מה אתם מבקשים מהמשתתפים, ולמה זה משמש")}
              hint={t("מוצג למשתתף לפני השליחה ונעוץ בראש הלוח. חשוב במיוחד בלוח פתוח, שבו אין מנחה בחדר שיסביר.")}
            />
            <Input label={t("שם פנימי")} value={draft.internal_name} onChange={(e) => patch({ internal_name: e.target.value })} hint={t("רק אתם רואים אותו — לזיהוי ברשימת הלוחות")} />
            <Input label={t("תיקייה / צוות")} value={draft.folder ?? ""} onChange={(e) => patch({ folder: e.target.value || null })} hint={t("לארגון הלוחות, למשל: סדנאות, אירועים")} />
          </EditorSection>

          <EditorSection index={2} title={t("עיצוב")} summary={summaries.s2} open={openSec === 2} onToggle={() => setOpenSec(openSec === 2 ? 0 : 2)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("רקע")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Object.keys(THEME_VISUALS) as BackgroundTheme[]).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => patchAppearance({ background_theme: theme, background_color: null })}
                    title={t(THEME_VISUALS[theme].label)}
                    aria-label={t("רקע {name}", { name: t(THEME_VISUALS[theme].label) })}
                    aria-pressed={draft.appearance.background_theme === theme && !draft.appearance.background_color}
                    style={{
                      width: 52,
                      height: 38,
                      borderRadius: "var(--radius-lg)",
                      border: `2px solid ${draft.appearance.background_theme === theme && !draft.appearance.background_color ? "var(--magenta-500)" : "var(--border)"}`,
                      background: THEME_VISUALS[theme].background,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Free color via a hue wheel — overrides the preset when set. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("צבע חופשי — גלגל צבעים")}</div>
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <ColorWheel value={draft.appearance.background_color} onChange={(hex) => patchAppearance({ background_color: hex })} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 150 }}>
                  {draft.appearance.background_color ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, background: draft.appearance.background_color, border: "1px solid var(--border-strong)", flex: "none" }} />
                        <span dir="ltr" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontWeight: "var(--weight-semibold)" }}>{draft.appearance.background_color}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => patchAppearance({ background_color: null })}>{t("חזרה לערכת הנושא")}</Button>
                    </>
                  ) : (
                    <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", lineHeight: "var(--leading-relaxed)", maxWidth: 200 }}>
                      {t("גררו על הגלגל לבחירת גוון חופשי — הצבע יחליף את ערכת הרקע, וצבע הטקסט יותאם אוטומטית.")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Background texture, previewed over the currently selected background. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("טקסטורת רקע")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Object.keys(BACKGROUND_TEXTURES) as BackgroundTexture[]).map((tex) => {
                  const active = (draft.appearance.background_texture ?? "none") === tex;
                  const preview = themeVisual({ ...draft.appearance, background_texture: tex });
                  return (
                    <button
                      key={tex}
                      onClick={() => patchAppearance({ background_texture: tex })}
                      aria-pressed={active}
                      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 58,
                          height: 40,
                          borderRadius: "var(--radius-lg)",
                          border: `2px solid ${active ? "var(--magenta-500)" : "var(--border)"}`,
                          background: preview.background,
                          display: "block",
                        }}
                      />
                      <span style={{ fontSize: "var(--text-2xs)", fontWeight: active ? "var(--weight-bold)" : "var(--weight-semibold)", color: active ? "var(--accent-text)" : "var(--text-subtle)" }}>
                        {t(BACKGROUND_TEXTURES[tex].label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("לוגו לקוח")}</div>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} style={{ display: "none" }} />
              <button
                onClick={() => (draft.appearance.client_logo_url ? patchAppearance({ client_logo_url: null }) : logoInputRef.current?.click())}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  border: "1.5px dashed var(--border-strong)",
                  background: "var(--bg-subtle)",
                  borderRadius: "var(--radius-lg)",
                  padding: 14,
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {draft.appearance.client_logo_url ? t("לוגו הועלה — לחצו להסרה") : t("גררו קובץ לוגו או לחצו להעלאה")}
              </button>
            </div>
            <Switch label={t("הצג לוגו NGG בפינת המסך")} checked={draft.appearance.show_org_logo} onChange={(v) => patchAppearance({ show_org_logo: v })} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("גודל טקסט על המסך")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["sm", "md", "lg"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => patchAppearance({ font_scale: s })}
                    aria-pressed={draft.appearance.font_scale === s}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "var(--radius-md)",
                      border: `1.5px solid ${draft.appearance.font_scale === s ? "var(--magenta-500)" : "var(--border)"}`,
                      background: draft.appearance.font_scale === s ? "var(--accent-soft)" : "var(--surface)",
                      color: draft.appearance.font_scale === s ? "var(--accent-text)" : "var(--text-muted)",
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--weight-bold)",
                      cursor: "pointer",
                    }}
                  >
                    {s === "sm" ? t("קטן") : s === "md" ? t("רגיל") : t("גדול")}
                  </button>
                ))}
              </div>
            </div>
          </EditorSection>

          <EditorSection index={3} title={t("מה המשתתפים יכולים לשלוח")} summary={summaries.s3} open={openSec === 3} onToggle={() => setOpenSec(openSec === 3 ? 0 : 3)}>
            <Switch label={t("תשובות טקסט")} description={t("המשתתפים כותבים תשובה קצרה מהנייד")} checked={draft.participation.allow_text} onChange={(v) => patchParticipation({ allow_text: v })} />
            <Switch label={t("תמונות")} description={t("צילום או העלאה מהגלריה")} checked={draft.participation.allow_image} onChange={(v) => patchParticipation({ allow_image: v })} />
            <Switch label={t("GIF ומדבקות")} description={t("בחירת GIF או מדבקה מספריית GIPHY")} checked={draft.participation.allow_giphy} onChange={(v) => patchParticipation({ allow_giphy: v })} />
            <Switch label={t("סרטוני YouTube")} description={t("חיפוש או הדבקת קישור לסרטון שיוצג על הלוח")} checked={draft.participation.allow_youtube} onChange={(v) => patchParticipation({ allow_youtube: v })} />
            <Switch label={t("מצב אנונימי")} description={t("שמות המשתתפים לא יוצגו על המסך")} checked={draft.participation.anonymous_allowed} onChange={(v) => patchParticipation({ anonymous_allowed: v })} />
            <Switch
              label={t("תגובות של משתתפים")}
              description={t("משתתפים יוכלו להגיב לפוסטים על הלוח. אתם תוכלו להגיב בכל מקרה.")}
              checked={draft.participation.allow_participant_comments}
              onChange={(v) => patchParticipation({ allow_participant_comments: v })}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("שם המשתתף")}</div>
              <Radio name="namepolicy" label={t("לא נדרש שם")} checked={draft.participation.name_policy === "disabled"} onChange={() => patchParticipation({ name_policy: "disabled" })} />
              <Radio name="namepolicy" label={t("שם אופציונלי")} checked={draft.participation.name_policy === "optional"} onChange={() => patchParticipation({ name_policy: "optional" })} />
              <Radio name="namepolicy" label={t("שם חובה")} checked={draft.participation.name_policy === "required"} onChange={() => patchParticipation({ name_policy: "required" })} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("כמה פעמים אפשר לשלוח")}</div>
              <Radio name="multi" label={t("שליחה אחת לכל משתתף")} checked={!draft.participation.multiple_submissions} onChange={() => patchParticipation({ multiple_submissions: false })} />
              <Radio name="multi" label={t("כמה שרוצים")} checked={draft.participation.multiple_submissions} onChange={() => patchParticipation({ multiple_submissions: true })} />
            </div>
            <Input label={t("מגבלת תווים לתשובת טקסט")} type="number" value={String(draft.participation.text_char_limit)} onChange={(e) => patchParticipation({ text_char_limit: Math.max(20, Number(e.target.value) || 0) })} />
          </EditorSection>

          <EditorSection index={4} title={t("אישור תוכן")} summary={summaries.s4} open={openSec === 4} onToggle={() => setOpenSec(openSec === 4 ? 0 : 4)}>
            <ModeCard
              title={t("הצג את התוכן מיד")}
              description={t("כל תשובה מופיעה על המסך ברגע שנשלחת")}
              selected={draft.moderation.mode === "immediate"}
              onClick={() => patchModeration({ mode: "immediate" })}
            />
            <ModeCard
              title={t("העבר לאישור לפני שיופיע")}
              description={t("התוכן מגיע קודם לתור אצל המנחה, ומופיע רק אחרי אישור")}
              selected={draft.moderation.mode === "approval"}
              onClick={() => patchModeration({ mode: "approval" })}
            />
            <details style={{ marginTop: 2 }}>
              <summary style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-muted)", cursor: "pointer" }}>{t("הגדרות מתקדמות")}</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
                <Switch label={t("הסתר שמות משתתפים על המסך")} checked={draft.moderation.hide_identity_on_display} onChange={(v) => patchModeration({ hide_identity_on_display: v })} />
                <Input
                  label={t("מילים חסומות (מופרדות בפסיק)")}
                  value={draft.moderation.blocked_words.join(", ")}
                  onChange={(e) => patchModeration({ blocked_words: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) })}
                  hint={t("תוכן שמכיל מילים אלו יימנע מהמשתתפים")}
                />
              </div>
            </details>
          </EditorSection>

          <EditorSection index={5} title={t("שיתוף")} summary={summaries.s5} open={openSec === 5} onToggle={() => setOpenSec(openSec === 5 ? 0 : 5)}>
            <Radio name="share" label={t("פרטי")} description={t("רק אתם יכולים לערוך ולהפעיל")} checked={draft.sharing === "private"} onChange={() => patch({ sharing: "private" })} />
            <Radio name="share" label={t("אנשים נבחרים")} description={t("תבחרו מי עוד יכול להנחות עם הלוח")} checked={draft.sharing === "selected"} onChange={() => patch({ sharing: "selected" })} />
            <Radio name="share" label={t("כל הארגון")} description={t("כל עובד יוכל למצוא ולשכפל את הלוח")} checked={draft.sharing === "organization"} onChange={() => patch({ sharing: "organization" })} />
          </EditorSection>

          <EditorSection index={6} title={t("פריסת תצוגה")} summary={summaries.s6} open={openSec === 6} onToggle={() => setOpenSec(openSec === 6 ? 0 : 6)}>
            <LayoutCard layout="wall" title={t("קיר כרטיסים")} desc={t("כרטיסים אחידים — מתאים לתשובות טקסט קצרות")} selected={draft.default_layout === "wall"} onClick={() => patch({ default_layout: "wall" })} />
            <LayoutCard layout="mosaic" title={t("פסיפס")} desc={t("גדלים משתנים — כשיש הרבה תמונות")} selected={draft.default_layout === "mosaic"} onClick={() => patch({ default_layout: "mosaic" })} />
            <LayoutCard layout="feed" title={t("פיד חי")} desc={t("תוכן חדש קופץ קדימה — לאירועים מהירים")} selected={draft.default_layout === "feed"} onClick={() => patch({ default_layout: "feed" })} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("סדר הצגה")}</div>
              <Radio name="sort" label={t("החדש ביותר קודם")} checked={draft.default_sort === "newest"} onChange={() => patch({ default_sort: "newest" })} />
              <Radio name="sort" label={t("הישן ביותר קודם")} checked={draft.default_sort === "oldest"} onChange={() => patch({ default_sort: "oldest" })} />
            </div>
          </EditorSection>

          <EditorSection index={7} title={t("חלוקה לאזורים")} summary={summaries.s7} open={openSec === 7} onToggle={() => setOpenSec(openSec === 7 ? 0 : 7)}>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
              {t("חלקו את הלוח לאזורים. המשתתפים יבחרו לאיזה אזור לשלוח, והתוכן יופיע באזור שנבחר על המסך.")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("מספר אזורים")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4].map((n) => {
                  const active = (draft.zones.length || 1) === n;
                  return (
                    <button
                      key={n}
                      onClick={() => patch({ zones: n <= 1 ? [] : makeZones(n, draft.zones) })}
                      aria-pressed={active}
                      style={{ flex: 1, padding: "10px", borderRadius: "var(--radius-md)", border: `1.5px solid ${active ? "var(--magenta-500)" : "var(--border)"}`, background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-text)" : "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", cursor: "pointer" }}
                    >
                      {n === 1 ? t("ללא") : n}
                    </button>
                  );
                })}
              </div>
            </div>
            {draft.zones.length >= 2 &&
              draft.zones.map((z, i) => (
                <div key={z.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                  <div style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>{t("אזור {number}", { number: i + 1 })}</div>
                  <Input
                    label={t("כותרת האזור")}
                    value={z.title}
                    onChange={(e) => {
                      const zones = draft.zones.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x));
                      patch({ zones });
                    }}
                    placeholder={t("למשל: לשמר")}
                  />
                  <Input
                    label={t("תת־כותרת")}
                    value={z.subtitle}
                    onChange={(e) => {
                      const zones = draft.zones.map((x, xi) => (xi === i ? { ...x, subtitle: e.target.value } : x));
                      patch({ zones });
                    }}
                    placeholder={t("הסבר קצר על האזור")}
                  />
                </div>
              ))}
          </EditorSection>

          <EditorSection index={8} title={t("תוכן פתיחה של הלוח")} summary={summaries.s8} open={openSec === 8} onToggle={() => setOpenSec(openSec === 8 ? 0 : 8)}>
            <SeedPostsEditor
              posts={draft.seed_posts}
              zones={draft.zones.length >= 2 ? draft.zones : []}
              imageSizeLimitMb={draft.participation.image_size_limit_mb}
              onChange={(seed_posts) => patch({ seed_posts })}
            />
          </EditorSection>
        </div>

        {/* Live preview */}
        <div style={{ flex: "2 1 480px", minWidth: 320, overflowY: "auto", padding: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-subtle)", fontWeight: "var(--weight-semibold)" }}>
            {t("תצוגה מקדימה — כך ייראה המסך המשותף")}
          </div>
          <EditorPreview
            title={draft.public_title}
            subtitle={draft.public_subtitle}
            appearance={draft.appearance}
            participation={draft.participation}
            layout={draft.default_layout}
            seedPosts={draft.seed_posts}
          />
          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
            {t("פריסה נבחרת: {layout} · הרקע והלוגו מתעדכנים בזמן אמת", { layout: t(LAYOUT_LABELS[draft.default_layout]) })}
          </div>
        </div>
      </div>

      <RoomActivationDialog board={savedBoardRef.current} open={activateOpen} onClose={() => setActivateOpen(false)} />
    </div>
  );
}

function ModeCard({ title, description, selected, onClick }: { title: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        border: `1.5px solid ${selected ? "var(--magenta-500)" : "var(--border)"}`,
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px",
        cursor: "pointer",
        textAlign: "start",
      }}
    >
      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--text)" }}>{title}</span>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{description}</span>
    </button>
  );
}

function LayoutCard({ layout, title, desc, selected, onClick }: { layout: DisplayLayout; title: string; desc: string; selected: boolean; onClick: () => void }) {
  const color = selected ? "var(--magenta-600)" : "var(--neutral-500)";
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1.5px solid ${selected ? "var(--magenta-500)" : "var(--border)"}`,
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        borderRadius: "var(--radius-lg)",
        padding: "11px 12px",
        cursor: "pointer",
        textAlign: "start",
      }}
    >
      <LayoutIcon layout={layout} color={color} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{desc}</span>
      </span>
    </button>
  );
}

export function LayoutIcon({ layout, color }: { layout: DisplayLayout; color: string }) {
  return (
    <svg width="30" height="22" viewBox="0 0 20 16" fill={color} aria-hidden="true" style={{ flex: "none" }}>
      {layout === "wall" && (
        <>
          <rect x="0" y="0" width="9" height="7" rx="1.2" />
          <rect x="11" y="0" width="9" height="7" rx="1.2" />
          <rect x="0" y="9" width="9" height="7" rx="1.2" />
          <rect x="11" y="9" width="9" height="7" rx="1.2" />
        </>
      )}
      {layout === "mosaic" && (
        <>
          <rect x="0" y="0" width="12" height="9" rx="1.2" />
          <rect x="14" y="0" width="6" height="9" rx="1.2" />
          <rect x="0" y="11" width="6" height="5" rx="1.2" />
          <rect x="8" y="11" width="12" height="5" rx="1.2" />
        </>
      )}
      {layout === "feed" && (
        <>
          <rect x="0" y="0" width="20" height="6" rx="1.2" />
          <rect x="0" y="8" width="20" height="3.4" rx="1.2" opacity="0.55" />
          <rect x="0" y="13" width="20" height="3" rx="1.2" opacity="0.3" />
        </>
      )}
    </svg>
  );
}
