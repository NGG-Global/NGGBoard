"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Board, BoardZone, LiveRoom, ParticipantSession } from "@/lib/types";
import { db } from "@/lib/data";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { boardZones, isZoned } from "@/lib/board-visuals";
import { SUBMISSION_RATE_LIMIT_MS } from "@/lib/constants";
import { findBlockedWord, sanitizeText } from "@/lib/utils";
import { validateSubmissionText } from "@/lib/validation";
import { Button, Input, Spinner } from "@/components/ui";
import { LanguageToggle, useI18n } from "@/lib/i18n/react";
import { IconCheck, IconClock, IconImage, IconPlay, IconSticker, IconText, IconWarning, IconWifiOff } from "@/components/ui/icons";
import { ImageUploadField } from "./ImageUploadField";
import { GiphyPicker } from "./GiphyPicker";
import type { GiphyPickerItem } from "@/lib/giphy";
import { YouTubePicker } from "./YouTubePicker";
import type { YouTubePickerItem } from "@/lib/youtube";
import { youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/youtube";

type Step = "join" | "zone" | "choose" | "text" | "image" | "gif" | "video" | "done";

function sessionKey(publicId: string) {
  return `ngg_participant_${publicId}`;
}

export function ParticipantFlow({ publicId }: { publicId: string }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const room = useLiveQuery({ room: publicId }, () => db.getRoomByPublicId(publicId));
  const board = useLiveQuery({ room: publicId }, () => {
    const r = db.getRoomByPublicId(publicId);
    return r ? db.getBoard(r.board_id) : null;
  });

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("join");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Grace window: give the room a few seconds to load (a just-activated room
  // takes a moment to reach Supabase) before showing "not found".
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 6000);
    return () => clearTimeout(t);
  }, [publicId]);

  // Restore an existing participant session (survives refresh).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(sessionKey(publicId));
    if (stored && db.getParticipant(stored)) {
      setSessionId(stored);
      setStep("choose");
    }
  }, [publicId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const mySubs = useLiveQuery(
    { room: publicId },
    () => {
      const r = db.getRoomByPublicId(publicId);
      return r && sessionId ? db.listSubmissionsForParticipant(r.id, sessionId) : [];
    },
    [sessionId], // selector reads sessionId; re-run when a restored session resolves
  );

  if (!mounted) return <Centered><Spinner size={28} /></Centered>;

  if (!room || !board) {
    // Still within the grace window → show a connecting state, not an error.
    if (!graceOver) {
      return (
        <ParticipantShell board={null}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "56px 12px", color: "var(--text-muted)" }}>
            <Spinner size={28} />
            <div style={{ fontSize: "var(--text-sm)" }}>{t("מתחבר למפגש…")}</div>
          </div>
        </ParticipantShell>
      );
    }
    return (
      <ParticipantShell board={null}>
        <StateCard icon={<IconWarning size={40} />} title={t("החדר לא נמצא")} description={t("בדקו את הקוד או הקישור ונסו שוב. ייתכן שהמפגש טרם התחיל או שהסתיים.")} />
      </ParticipantShell>
    );
  }

  const canText = board.participation.allow_text;
  const canImage = board.participation.allow_image;
  const canGif = board.participation.allow_giphy;
  const canVideo = board.participation.allow_youtube;
  const allowMultiple = board.participation.multiple_submissions;
  const limitReached = !allowMultiple && mySubs.length > 0;
  const zoned = isZoned(board);
  const zones = boardZones(board);
  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;

  // Room lifecycle gates (apply regardless of step).
  if (room.status === "ended") {
    return (
      <ParticipantShell board={board}>
        <StateCard icon={<IconCheck size={40} />} title={t("המפגש הסתיים")} description={t("תודה על ההשתתפות! אי אפשר לשלוח תוכן נוסף.")} />
      </ParticipantShell>
    );
  }
  if (room.status === "suspended") {
    return (
      <ParticipantShell board={board}>
        <StateCard icon={<IconClock size={40} />} title={t("החדר מושהה זמנית")} description={t("המנחה השהה את המפגש. השאירו את החלון פתוח — כשהמפגש יחזור לפעילות תוכלו לשלוח.")} />
      </ParticipantShell>
    );
  }

  function joinRoom() {
    if (board!.participation.name_policy === "required" && !name.trim()) {
      setNameError(t("יש להזין שם כדי להצטרף"));
      return;
    }
    const result = db.joinRoom(publicId, board!.participation.name_policy === "disabled" ? null : name);
    if (!result) return;
    window.localStorage.setItem(sessionKey(publicId), result.session.id);
    setSessionId(result.session.id);
    setStep(isZoned(board!) ? "zone" : "choose");
  }

  const progress = step === "join" ? 0 : step === "zone" || step === "choose" ? 1 : step === "done" ? 3 : 2;

  return (
    <ParticipantShell board={board} hero={step === "join" ? "full" : "compact"} progress={progress} participants={room.participant_count}>
      {!online && (
        <Banner icon={<IconWifiOff size={16} />} color="warning">{t("אין חיבור לרשת — התוכן יישמר ויישלח כשהחיבור יחזור")}</Banner>
      )}
      {room.status === "paused" && step !== "done" && (
        <Banner icon={<IconClock size={16} />} color="warning">{t("המנחה השהה זמנית את קבלת התוכן. אפשר להכין תשובה — היא תישלח כשהקבלה תתחדש.")}</Banner>
      )}
      {room.status === "read_only" && step !== "done" && (
        <Banner icon={<IconWarning size={16} />} color="info">{t("הלוח במצב צפייה בלבד ואינו מקבל תוכן חדש כרגע.")}</Banner>
      )}

      {step === "join" && (
        <JoinStep
          board={board}
          name={name}
          nameError={nameError}
          onName={(v) => { setName(v); setNameError(null); }}
          onContinue={joinRoom}
          participants={room.participant_count}
        />
      )}

      {/* Zone picker (zoned boards). Also guards choose/compose if no zone yet. */}
      {((step === "zone") || (zoned && !zoneId && (step === "choose" || step === "text" || step === "image" || step === "gif" || step === "video"))) && (
        <ZoneStep
          zones={zones}
          onPick={(id) => { setZoneId(id); setStep("choose"); }}
        />
      )}

      {step === "choose" && (!zoned || zoneId) && (
        <ChooseStep
          canText={canText}
          canImage={canImage}
          canGif={canGif}
          canVideo={canVideo}
          limitReached={limitReached}
          submittedCount={mySubs.length}
          zone={selectedZone}
          onChangeZone={zoned ? () => setStep("zone") : undefined}
          onText={() => setStep("text")}
          onImage={() => setStep("image")}
          onGif={() => setStep("gif")}
          onVideo={() => setStep("video")}
        />
      )}

      {step === "text" && sessionId && (!zoned || zoneId) && (
        <TextStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          zone={selectedZone}
          onDone={() => setStep("done")}
          onBack={() => setStep("choose")}
        />
      )}

      {step === "image" && sessionId && (!zoned || zoneId) && (
        <ImageStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          zone={selectedZone}
          onDone={() => setStep("done")}
          onBack={() => setStep("choose")}
        />
      )}

      {step === "gif" && sessionId && (!zoned || zoneId) && (
        <GifStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          zone={selectedZone}
          onDone={() => setStep("done")}
          onBack={() => setStep("choose")}
        />
      )}

      {step === "video" && sessionId && (!zoned || zoneId) && (
        <VideoStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          zone={selectedZone}
          onDone={() => setStep("done")}
          onBack={() => setStep("choose")}
        />
      )}

      {step === "done" && (
        <DoneStep
          approval={board.moderation.mode === "approval"}
          allowMore={allowMultiple}
          onAnother={() => { if (zoned) { setZoneId(null); setStep("zone"); } else setStep("choose"); }}
          publicId={publicId}
        />
      )}
    </ParticipantShell>
  );
}

// ---- steps ------------------------------------------------------------------

function JoinStep({ board, name, nameError, onName, onContinue }: { board: Board; name: string; nameError: string | null; onName: (v: string) => void; onContinue: () => void; participants: number }) {
  const { t } = useI18n();
  const policy = board.participation.name_policy;
  return (
    <div className="ngg-fade-up" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, padding: 20, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{t("הצטרפות למפגש")}</div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {policy === "disabled" ? t("לחיצה אחת ואתם בפנים — התוכן שתשלחו יופיע על המסך המשותף.") : t("עוד רגע אתם בפנים — איך לקרוא לכם על המסך?")}
          </p>
        </div>
        {policy !== "disabled" && (
          <Input
            label={policy === "required" ? t("השם שלכם") : t("השם שלכם (אופציונלי)")}
            value={name}
            onChange={(e) => onName(e.target.value)}
            error={nameError}
            placeholder={t("איך לקרוא לכם על המסך?")}
            required={policy === "required"}
          />
        )}
        <Button variant="primary" size="lg" block onClick={onContinue}>{t("המשך")}</Button>
        {policy === "optional" && board.participation.anonymous_allowed && (
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", textAlign: "center" }}>{t("אפשר גם בלי שם — התוכן יוצג כאנונימי")}</p>
        )}
      </div>
    </div>
  );
}

function ZoneStep({ zones, onPick }: { zones: BoardZone[]; onPick: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="ngg-fade-up" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{t("לאיזה אזור לשלוח?")}</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>{t("בחרו את האזור שאליו התוכן שלכם יופיע על המסך.")}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {zones.map((z, i) => (
          <button
            key={z.id}
            onClick={() => onPick(z.id)}
            className="ngg-tile"
            style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 18px", cursor: "pointer", textAlign: "start", minHeight: 74 }}
          >
            <span style={{ width: 42, height: 42, borderRadius: 14, background: "var(--gradient-magenta)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--weight-black)", fontSize: "var(--text-lg)", flex: "none", boxShadow: "0 4px 12px rgba(236,42,140,.30)" }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{z.title || t("אזור {num}", { num: i + 1 })}</span>
              {z.subtitle && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{z.subtitle}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoneBanner({ zone, onChange }: { zone: BoardZone; onChange?: () => void }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", border: "1px solid var(--magenta-200)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{t("אזור:")}</span>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)", flex: 1, minWidth: 0 }}>{zone.title || t("ללא שם")}</span>
      {onChange && (
        <button onClick={onChange} style={{ border: "none", background: "transparent", color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", cursor: "pointer" }}>{t("שינוי")}</button>
      )}
    </div>
  );
}

function ChooseStep({ canText, canImage, canGif, canVideo, limitReached, submittedCount, zone, onChangeZone, onText, onImage, onGif, onVideo }: { canText: boolean; canImage: boolean; canGif: boolean; canVideo: boolean; limitReached: boolean; submittedCount: number; zone: BoardZone | null; onChangeZone?: () => void; onText: () => void; onImage: () => void; onGif: () => void; onVideo: () => void }) {
  const { t } = useI18n();
  if (limitReached) {
    return <StateCard icon={<IconCheck size={34} />} title={t("כבר שלחתם")} description={t("בלוח הזה אפשר לשלוח פעם אחת. תודה על ההשתתפות!")} />;
  }
  const options = [
    canText && { key: "text", icon: <IconText size={22} />, title: t("תשובת טקסט"), desc: t("רעיון או תשובה קצרה"), tone: "ink" as const, onClick: onText },
    canImage && { key: "image", icon: <IconImage size={22} />, title: t("תמונה"), desc: t("צילום או מהגלריה"), tone: "info" as const, onClick: onImage },
    canGif && { key: "gif", icon: <IconSticker size={22} />, title: t("GIF ומדבקות"), desc: t("מספריית GIPHY"), tone: "magenta" as const, onClick: onGif },
    canVideo && { key: "video", icon: <IconPlay size={22} />, title: t("סרטון YouTube"), desc: t("חיפוש או קישור"), tone: "danger" as const, onClick: onVideo },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; title: string; desc: string; tone: ChoiceTone; onClick: () => void }[];
  return (
    <div className="ngg-fade-up" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {zone && <ZoneBanner zone={zone} onChange={onChangeZone} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{t("מה תרצו לשלוח?")}</div>
        {submittedCount > 0 && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>{t("שלחתם {count} פריטים עד כה — אפשר להוסיף עוד.", { count: submittedCount })}</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {options.map(({ key, ...o }, i) => (
          <ChoiceCard key={key} {...o} wide={options.length % 2 === 1 && i === options.length - 1} />
        ))}
      </div>
    </div>
  );
}

function TextStep({ room, board, sessionId, displayName, zone, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; zone: BoardZone | null; onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const limit = board.participation.text_char_limit;
  const remaining = limit - text.length;
  const canSubmit = room.status === "active" && !submitting;

  function submit() {
    const clean = sanitizeText(text, limit);
    const err = validateSubmissionText(clean, limit);
    if (err) return setError(err);
    const blocked = findBlockedWord(clean, board.moderation.blocked_words);
    if (blocked) return setError(t("התשובה מכילה מילה שאינה מותרת. אנא נסחו מחדש."));
    // Duplicate / rate-limit protection.
    const mine = db.listSubmissionsForParticipant(room.id, sessionId);
    const last = mine[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < SUBMISSION_RATE_LIMIT_MS) {
      return setError(t("רגע לפני — נסו שוב עוד כמה שניות"));
    }
    if (mine.some((s) => s.text_content?.trim() === clean.trim())) {
      return setError(t("כבר שלחתם את התשובה הזו"));
    }
    setSubmitting(true);
    setTimeout(() => {
      db.createSubmission({
        roomId: room.id,
        type: "text",
        text: clean,
        participantSessionId: sessionId,
        displayName,
        anonymous: board.participation.anonymous_allowed && !displayName.trim(),
        zoneId: zone?.id ?? null,
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
      <BackLink onClick={onBack} />
      {zone && <ZoneBanner zone={zone} />}
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{zone?.subtitle || board.public_subtitle || t("כתבו את התשובה שלכם")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value.slice(0, limit)); setError(null); }}
          placeholder={t("כתבו כאן…")}
          className="ngg-focusable"
          autoFocus
          style={{ width: "100%", minHeight: 160, flex: 1, fontFamily: "var(--font-sans)", fontSize: "var(--text-md)", color: "var(--text)", background: "var(--surface)", border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`, borderRadius: "var(--radius-xl)", padding: 14, outline: "none", lineHeight: "var(--leading-relaxed)", resize: "none" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-2xs)" }}>
          <span style={{ color: error ? "var(--danger)" : "var(--text-subtle)", fontWeight: "var(--weight-semibold)" }}>{error ?? " "}</span>
          <span style={{ color: remaining < 20 ? "var(--warning)" : "var(--text-subtle)" }}>{t("{count} תווים נותרו", { count: remaining })}</span>
        </div>
      </div>
      <StickyAction>
        <Button variant="primary" size="lg" block disabled={!canSubmit || !text.trim()} onClick={submit}>
          {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? t("שלח") : t("קבלת התוכן מושהית")}
        </Button>
      </StickyAction>
    </div>
  );
}

function ImageStep({ room, board, sessionId, displayName, zone, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; zone: BoardZone | null; onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = room.status === "active" && !!image && !submitting;

  function submit() {
    if (!image) return;
    setSubmitting(true);
    setTimeout(() => {
      db.createSubmission({
        roomId: room.id,
        type: "image",
        mediaUrl: image,
        text: caption.trim() || null,
        participantSessionId: sessionId,
        displayName,
        anonymous: board.participation.anonymous_allowed && !displayName.trim(),
        zoneId: zone?.id ?? null,
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BackLink onClick={onBack} />
      {zone && <ZoneBanner zone={zone} />}
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{t("הוסיפו תמונה")}</div>
      <ImageUploadField value={image} onChange={setImage} maxSizeMb={board.participation.image_size_limit_mb} />
      {image && (
        <Input label={t("כיתוב (אופציונלי)")} value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} placeholder={t("הוסיפו כיתוב קצר")} />
      )}
      <StickyAction>
        <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
          {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? t("שלח תמונה") : t("קבלת התוכן מושהית")}
        </Button>
      </StickyAction>
    </div>
  );
}

function GifStep({ room, board, sessionId, displayName, zone, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; zone: BoardZone | null; onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<GiphyPickerItem | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = room.status === "active" && !!selected && !submitting;

  function submit() {
    if (!selected) return;
    // Same duplicate / rate-limit protection as text and image submissions.
    const mine = db.listSubmissionsForParticipant(room.id, sessionId);
    const last = mine[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < SUBMISSION_RATE_LIMIT_MS) {
      return setError(t("רגע לפני — נסו שוב עוד כמה שניות"));
    }
    if (mine.some((s) => s.media_url === selected.media_url)) {
      return setError(t("כבר שלחתם את ה-GIF הזה"));
    }
    setSubmitting(true);
    setTimeout(() => {
      db.createSubmission({
        roomId: room.id,
        type: "image",
        mediaUrl: selected.media_url,
        text: caption.trim() || null,
        participantSessionId: sessionId,
        displayName,
        anonymous: board.participation.anonymous_allowed && !displayName.trim(),
        zoneId: zone?.id ?? null,
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BackLink onClick={onBack} />
      {zone && <ZoneBanner zone={zone} />}
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{t("הוסיפו GIF או מדבקה")}</div>

      {!selected && <GiphyPicker onSelect={(item) => { setSelected(item); setError(null); }} />}

      {selected && (
        <>
          <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-sunken)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 160, maxHeight: 300 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.media_url} alt={selected.title || t("ה-GIF שנבחר")} style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain" }} />
          </div>
          <Button variant="outline" size="md" block onClick={() => setSelected(null)}>{t("בחרו GIF אחר")}</Button>
          <Input label={t("כיתוב (אופציונלי)")} value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} placeholder={t("הוסיפו כיתוב קצר")} />
          {error && <div style={{ fontSize: "var(--text-2xs)", color: "var(--danger)", fontWeight: "var(--weight-semibold)" }}>{error}</div>}
          <StickyAction>
            <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
              {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? t("שלח GIF") : t("קבלת התוכן מושהית")}
            </Button>
          </StickyAction>
        </>
      )}
    </div>
  );
}

function VideoStep({ room, board, sessionId, displayName, zone, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; zone: BoardZone | null; onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<YouTubePickerItem | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = room.status === "active" && !!selected && !submitting;

  function submit() {
    if (!selected) return;
    const mediaUrl = youTubeWatchUrl(selected.id);
    // Same duplicate / rate-limit protection as the other submission types.
    const mine = db.listSubmissionsForParticipant(room.id, sessionId);
    const last = mine[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < SUBMISSION_RATE_LIMIT_MS) {
      return setError(t("רגע לפני — נסו שוב עוד כמה שניות"));
    }
    if (mine.some((s) => s.media_url === mediaUrl)) {
      return setError(t("כבר שלחתם את הסרטון הזה"));
    }
    setSubmitting(true);
    setTimeout(() => {
      db.createSubmission({
        roomId: room.id,
        type: "video",
        mediaUrl,
        text: caption.trim() || null,
        participantSessionId: sessionId,
        displayName,
        anonymous: board.participation.anonymous_allowed && !displayName.trim(),
        zoneId: zone?.id ?? null,
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BackLink onClick={onBack} />
      {zone && <ZoneBanner zone={zone} />}
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{t("הוסיפו סרטון YouTube")}</div>

      {!selected && <YouTubePicker onSelect={(item) => { setSelected(item); setError(null); }} />}

      {selected && (
        <>
          <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-sunken)", aspectRatio: "16 / 9" }}>
            <iframe
              src={youTubeEmbedUrl(selected.id)}
              title={selected.title || t("הסרטון שנבחר")}
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          </div>
          {selected.title && <div dir="auto" style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>{selected.title}</div>}
          <Button variant="outline" size="md" block onClick={() => setSelected(null)}>{t("בחרו סרטון אחר")}</Button>
          <Input label={t("כיתוב (אופציונלי)")} value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} placeholder={t("הוסיפו כיתוב קצר")} />
          {error && <div style={{ fontSize: "var(--text-2xs)", color: "var(--danger)", fontWeight: "var(--weight-semibold)" }}>{error}</div>}
          <StickyAction>
            <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
              {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? t("שלח סרטון") : t("קבלת התוכן מושהית")}
            </Button>
          </StickyAction>
        </>
      )}
    </div>
  );
}

function DoneStep({ approval, allowMore, onAnother, publicId }: { approval: boolean; allowMore: boolean; onAnother: () => void; publicId: string }) {
  const { t } = useI18n();
  return (
    <div className="ngg-fade-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center", padding: "36px 24px", marginTop: 10 }}>
      <div
        className="ngg-pop"
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: approval ? "var(--warning-bg)" : "var(--gradient-magenta)",
          color: approval ? "var(--warning)" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: approval ? "none" : "0 12px 32px rgba(236,42,140,.35)",
        }}
      >
        {approval ? <IconClock size={38} /> : <IconCheck size={38} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-extrabold)" }}>
          {approval ? t("התוכן נשלח וממתין לאישור המנחה") : t("התוכן שלכם עלה על הלוח!")}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", maxWidth: 320, lineHeight: "var(--leading-relaxed)" }}>
          {approval ? t("ברגע שהמנחה יאשר, התוכן יופיע על המסך המשותף.") : t("אפשר לראות אותו כעת על המסך המשותף.")}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
        {allowMore && <Button variant="primary" size="lg" block onClick={onAnother}>{t("שליחת תוכן נוסף")}</Button>}
        <a href={`/display/${publicId}`} target="_blank" rel="noreferrer">
          <Button variant="outline" size="md" block>{t("צפייה בלוח המשותף")}</Button>
        </a>
      </div>
    </div>
  );
}

// ---- shell + shared bits ----------------------------------------------------

/**
 * Mobile participant chrome: a dark brand hero (board identity + a 3-step
 * progress rail) over a soft content area. `hero="full"` is the welcoming
 * join screen; every later step collapses it to a compact bar so the content
 * keeps the screen. Purely presentational — flow logic lives in the steps.
 */
function ParticipantShell({ board, children, hero = "compact", progress = null, participants = 0 }: { board: Board | null; children: React.ReactNode; hero?: "full" | "compact"; progress?: number | null; participants?: number }) {
  const { t } = useI18n();
  const full = hero === "full" && !!board;
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
      <header
        style={{
          position: "relative",
          overflow: "hidden",
          background: "var(--gradient-ink-magenta)",
          color: "#fff",
          borderRadius: "0 0 26px 26px",
          padding: `calc(12px + env(safe-area-inset-top)) 20px ${full ? 26 : 14}px`,
        }}
      >
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 18% -40%, rgba(236,42,140,.38), transparent 58%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: full ? 16 : 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Image src="/brand/ngg-mark.png" alt="NGG" width={26} height={22} style={{ height: 22, width: "auto" }} />
              <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", letterSpacing: "0.08em", color: "rgba(255,255,255,.65)" }}>NGG BOARDS</span>
            </span>
            <LanguageToggle onDark />
          </div>

          {board && (
            <div style={{ display: "flex", flexDirection: "column", gap: full ? 8 : 2 }}>
              <h1
                style={{
                  fontSize: full ? "var(--text-2xl)" : "var(--text-md)",
                  fontWeight: "var(--weight-black)",
                  lineHeight: "var(--leading-tight)",
                  color: "#fff",
                  ...(full ? {} : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
                }}
              >
                {board.public_title}
              </h1>
              {full && board.public_subtitle && (
                <p style={{ fontSize: "var(--text-sm)", color: "rgba(255,255,255,.72)", lineHeight: "var(--leading-relaxed)" }}>{board.public_subtitle}</p>
              )}
              {full && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)", borderRadius: "var(--radius-pill)", padding: "5px 12px", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)" }}>
                    <span className="ngg-pulse-dot-light" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--magenta-neon)", flex: "none" }} />
                    {t("בשידור חי")}
                  </span>
                  {participants > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)", borderRadius: "var(--radius-pill)", padding: "5px 12px", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)" }}>
                      {t("{count} משתתפים", { count: participants })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {progress !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 5, flex: 1 }} role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={Math.min(progress + 1, 3)}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ height: 4, flex: 1, borderRadius: "var(--radius-pill)", background: i <= progress ? "var(--gradient-magenta)" : "rgba(255,255,255,.18)", transition: "background var(--dur) var(--ease-standard)" }} />
                ))}
              </div>
              {progress < 3 && (
                <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-semibold)", color: "rgba(255,255,255,.6)", flex: "none" }}>
                  {t("שלב {num} מתוך 3", { num: Math.min(progress + 1, 3) })}
                </span>
              )}
            </div>
          )}
        </div>
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: 480, margin: "0 auto", padding: "18px 18px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--surface-sunken)" }}>{children}</div>;
}

function StateCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="ngg-fade-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "40px 24px", marginTop: 10 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-extrabold)" }}>{title}</h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", maxWidth: 320, lineHeight: "var(--leading-relaxed)" }}>{description}</p>
    </div>
  );
}

type ChoiceTone = "ink" | "info" | "magenta" | "danger";

const CHOICE_TONES: Record<ChoiceTone, { bg: string; fg: string }> = {
  ink: { bg: "var(--neutral-100)", fg: "var(--ink-600)" },
  info: { bg: "var(--info-50)", fg: "var(--info-600)" },
  magenta: { bg: "var(--magenta-50)", fg: "var(--magenta-600)" },
  danger: { bg: "var(--danger-50)", fg: "var(--danger-600)" },
};

function ChoiceCard({ icon, title, desc, tone, onClick, wide }: { icon: React.ReactNode; title: string; desc: string; tone: ChoiceTone; onClick: () => void; wide?: boolean }) {
  const c = CHOICE_TONES[tone];
  return (
    <button
      onClick={onClick}
      className="ngg-tile"
      style={{
        display: "flex",
        flexDirection: wide ? "row" : "column",
        alignItems: wide ? "center" : "flex-start",
        gap: wide ? 14 : 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: 16,
        cursor: "pointer",
        textAlign: "start",
        minHeight: wide ? 76 : 124,
        gridColumn: wide ? "1 / -1" : undefined,
      }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 14, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-extrabold)" }}>{title}</span>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{desc}</span>
      </span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="ngg-tile" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", cursor: "pointer", padding: "7px 14px 7px 16px", borderRadius: "var(--radius-pill)" }}>
      {t("← חזרה")}
    </button>
  );
}

function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "sticky", bottom: 0, paddingTop: 14, paddingBottom: "calc(6px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, var(--surface-sunken) 72%, transparent)" }}>
      {children}
    </div>
  );
}

function Banner({ icon, color, children }: { icon: React.ReactNode; color: "warning" | "info"; children: React.ReactNode }) {
  const c = color === "warning" ? { bg: "var(--warning-bg)", color: "var(--warning)" } : { bg: "var(--info-bg)", color: "var(--info)" };
  return (
    <div className="ngg-fade-up" style={{ display: "flex", alignItems: "center", gap: 10, background: c.bg, border: `1px solid color-mix(in srgb, ${c.color} 35%, transparent)`, borderRadius: "var(--radius-pill)", padding: "9px 14px", fontSize: "var(--text-xs)", color: c.color, fontWeight: "var(--weight-semibold)" }}>
      <span style={{ flex: "none", display: "flex" }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
