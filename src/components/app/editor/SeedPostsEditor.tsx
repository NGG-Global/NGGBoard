"use client";

import { useRef } from "react";
import type { BoardSeedPost, BoardZone, SubmissionType } from "@/lib/types";
import { blankSeedPost, SEED_POST_LABELS } from "@/lib/posts";
import { parseYouTubeVideoId, youTubeThumbnailUrl, youTubeWatchUrl } from "@/lib/youtube";
import { Button, Input, Switch, Textarea } from "@/components/ui";
import { IconChevron, IconImage, IconPlay, IconText, IconTrash } from "@/components/ui/icons";
import { ImageUploadField } from "@/components/participant/ImageUploadField";
import { useI18n } from "@/lib/i18n/react";

/**
 * Editor for the posts a board opens with — the facilitator's own guidance
 * cards, reference images and videos, written while building the board and
 * present the moment it opens.
 *
 * Each item is edited in place, in the order it will appear. Videos take a
 * pasted link rather than the participant's search picker: a facilitator at a
 * desk already has the URL, and paste-only needs no YouTube API key at all.
 */
export function SeedPostsEditor({
  posts,
  zones,
  imageSizeLimitMb,
  onChange,
}: {
  posts: BoardSeedPost[];
  zones: BoardZone[];
  imageSizeLimitMb: number;
  onChange: (next: BoardSeedPost[]) => void;
}) {
  const { t } = useI18n();

  function patch(id: string, p: Partial<BoardSeedPost>) {
    onChange(posts.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  function add(type: SubmissionType) {
    onChange([...posts, blankSeedPost(type, posts.length)]);
  }
  function remove(id: string) {
    onChange(posts.filter((x) => x.id !== id));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= posts.length) return;
    const next = [...posts];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", lineHeight: "var(--leading-relaxed)" }}>
        {t("תוכן שתוסיפו כאן יופיע על הלוח מהרגע שהוא נפתח, לפני שמשתתפים שולחים משהו. שימושי להנחיה, לדוגמה או לסרטון שכדאי לראות קודם.")}
      </div>

      {posts.map((post, i) => (
        <div key={post.id} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)", flex: 1 }}>
              {i + 1}. {t(SEED_POST_LABELS[post.type])}
            </span>
            <IconBtn label={t("העלה למעלה")} disabled={i === 0} onClick={() => move(i, -1)} rotate={-90} />
            <IconBtn label={t("הורד למטה")} disabled={i === posts.length - 1} onClick={() => move(i, 1)} rotate={90} />
            <button
              onClick={() => remove(post.id)}
              aria-label={t("הסרת הפריט")}
              title={t("הסרת הפריט")}
              className="ngg-danger-hover"
              style={{ display: "flex", border: "none", background: "transparent", color: "var(--text-subtle)", padding: 5, borderRadius: "var(--radius-md)", cursor: "pointer" }}
            >
              <IconTrash size={14} />
            </button>
          </div>

          {post.type === "text" && (
            <Textarea
              label={t("הטקסט שיופיע על הכרטיס")}
              value={post.text}
              onChange={(e) => patch(post.id, { text: e.target.value.slice(0, 600) })}
              rows={3}
              placeholder={t("למשל: התשובות כאן אנונימיות — כתבו בכיוון שנוח לכם")}
            />
          )}

          {post.type === "image" && (
            <>
              <ImageUploadField value={post.media_url} onChange={(url) => patch(post.id, { media_url: url })} maxSizeMb={imageSizeLimitMb} />
              <Input
                label={t("כיתוב (אופציונלי)")}
                value={post.text}
                onChange={(e) => patch(post.id, { text: e.target.value.slice(0, 160) })}
                placeholder={t("הוסיפו כיתוב קצר")}
              />
            </>
          )}

          {post.type === "video" && <VideoField post={post} onPatch={(p) => patch(post.id, p)} />}

          {zones.length >= 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" }}>{t("באיזה אזור להציג")}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {zones.map((z, zi) => {
                  const active = post.zone_id === z.id;
                  return (
                    <button
                      key={z.id}
                      onClick={() => patch(post.id, { zone_id: active ? null : z.id })}
                      aria-pressed={active}
                      style={{ padding: "6px 12px", borderRadius: "var(--radius-pill)", border: `1.5px solid ${active ? "var(--magenta-500)" : "var(--border)"}`, background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-text)" : "var(--text-muted)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", cursor: "pointer" }}
                    >
                      {z.title || t("אזור {number}", { number: zi + 1 })}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Switch
            label={t("הצמד לראש הלוח")}
            description={t("יישאר קדימה גם כשמשתתפים ממלאים את הלוח")}
            checked={post.pinned}
            onChange={(v) => patch(post.id, { pinned: v })}
          />
        </div>
      ))}

      <div style={{ display: "flex", gap: 6 }}>
        <AddBtn icon={<IconText size={15} />} label={t("טקסט")} onClick={() => add("text")} />
        <AddBtn icon={<IconImage size={15} />} label={t("תמונה")} onClick={() => add("image")} />
        <AddBtn icon={<IconPlay size={15} />} label={t("סרטון")} onClick={() => add("video")} />
      </div>
    </>
  );
}

/**
 * YouTube link field. The video id is parsed locally and the thumbnail comes
 * from YouTube's public image CDN, so this needs no API key — and the stored
 * URL is rebuilt from the parsed id rather than kept as typed, which is what
 * keeps a crafted URL out of the display's iframe.
 */
function VideoField({ post, onPatch }: { post: BoardSeedPost; onPatch: (p: Partial<BoardSeedPost>) => void }) {
  const { t } = useI18n();
  const raw = useRef(post.media_url ?? "");
  const videoId = post.media_url ? parseYouTubeVideoId(post.media_url) : null;

  function handle(value: string) {
    raw.current = value;
    const id = parseYouTubeVideoId(value);
    onPatch({ media_url: id ? youTubeWatchUrl(id) : null });
  }

  return (
    <>
      <Input
        label={t("קישור לסרטון YouTube")}
        defaultValue={raw.current}
        onChange={(e) => handle(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=…"
        dir="ltr"
        hint={videoId ? undefined : t("הדביקו קישור לסרטון מ-YouTube")}
        error={raw.current.trim() && !videoId ? t("הקישור אינו קישור תקין לסרטון YouTube") : null}
      />
      {videoId && (
        <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", aspectRatio: "16 / 9", background: "#08080f" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youTubeThumbnailUrl(videoId)} alt={t("תצוגה מקדימה")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }} />
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(8,8,16,.28)" }}>
            <IconPlay size={30} />
          </span>
        </div>
      )}
      <Input
        label={t("כיתוב (אופציונלי)")}
        value={post.text}
        onChange={(e) => onPatch({ text: e.target.value.slice(0, 160) })}
        placeholder={t("הוסיפו כיתוב קצר")}
      />
    </>
  );
}

function AddBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" block leadingIcon={icon} onClick={onClick}>
      {label}
    </Button>
  );
}

function IconBtn({ label, disabled, onClick, rotate }: { label: string; disabled: boolean; onClick: () => void; rotate: number }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={disabled ? undefined : "ngg-hover"}
      style={{ display: "flex", border: "none", background: "transparent", color: disabled ? "var(--border-strong)" : "var(--text-subtle)", padding: 5, borderRadius: "var(--radius-md)", cursor: disabled ? "default" : "pointer" }}
    >
      <span style={{ display: "flex", transform: `rotate(${rotate}deg)` }}>
        <IconChevron size={14} strokeWidth={2.2} />
      </span>
    </button>
  );
}
