"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Board, LiveRoom, ParticipantSession } from "@/lib/types";
import { db } from "@/lib/data/local-db";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { SUBMISSION_RATE_LIMIT_MS } from "@/lib/constants";
import { findBlockedWord, sanitizeText } from "@/lib/utils";
import { validateSubmissionText } from "@/lib/validation";
import { Button, Input, Spinner } from "@/components/ui";
import { IconCheck, IconClock, IconImage, IconText, IconWarning, IconWifiOff } from "@/components/ui/icons";
import { ImageUploadField } from "./ImageUploadField";

type Step = "join" | "choose" | "text" | "image" | "done";

function sessionKey(publicId: string) {
  return `ngg_participant_${publicId}`;
}

export function ParticipantFlow({ publicId }: { publicId: string }) {
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
  const [online, setOnline] = useState(true);

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

  const mySubs = useLiveQuery({ room: room?.id ?? publicId }, () =>
    room && sessionId ? db.listSubmissionsForParticipant(room.id, sessionId) : [],
  );

  if (!mounted) return <Centered><Spinner size={28} /></Centered>;

  if (!room || !board) {
    return (
      <ParticipantShell board={null}>
        <StateCard icon={<IconWarning size={40} />} title="החדר לא נמצא" description="בדקו את הקוד או הקישור ונסו שוב. ייתכן שהמפגש טרם התחיל או שהסתיים." />
      </ParticipantShell>
    );
  }

  const canText = board.participation.allow_text;
  const canImage = board.participation.allow_image;
  const allowMultiple = board.participation.multiple_submissions;
  const limitReached = !allowMultiple && mySubs.length > 0;

  // Room lifecycle gates (apply regardless of step).
  if (room.status === "ended") {
    return (
      <ParticipantShell board={board}>
        <StateCard icon={<IconCheck size={40} />} title="המפגש הסתיים" description="תודה על ההשתתפות! אי אפשר לשלוח תוכן נוסף." />
      </ParticipantShell>
    );
  }
  if (room.status === "suspended") {
    return (
      <ParticipantShell board={board}>
        <StateCard icon={<IconClock size={40} />} title="החדר מושהה זמנית" description="המנחה השהה את המפגש. השאירו את החלון פתוח — כשהמפגש יחזור לפעילות תוכלו לשלוח." />
      </ParticipantShell>
    );
  }

  function joinRoom() {
    if (board!.participation.name_policy === "required" && !name.trim()) {
      setNameError("יש להזין שם כדי להצטרף");
      return;
    }
    const result = db.joinRoom(publicId, board!.participation.name_policy === "disabled" ? null : name);
    if (!result) return;
    window.localStorage.setItem(sessionKey(publicId), result.session.id);
    setSessionId(result.session.id);
    setStep("choose");
  }

  return (
    <ParticipantShell board={board}>
      {!online && (
        <Banner icon={<IconWifiOff size={16} />} color="warning">אין חיבור לרשת — התוכן יישמר ויישלח כשהחיבור יחזור</Banner>
      )}
      {room.status === "paused" && step !== "done" && (
        <Banner icon={<IconClock size={16} />} color="warning">המנחה השהה זמנית את קבלת התוכן. אפשר להכין תשובה — היא תישלח כשהקבלה תתחדש.</Banner>
      )}
      {room.status === "read_only" && step !== "done" && (
        <Banner icon={<IconWarning size={16} />} color="info">הלוח במצב צפייה בלבד ואינו מקבל תוכן חדש כרגע.</Banner>
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

      {step === "choose" && (
        <ChooseStep
          canText={canText}
          canImage={canImage}
          limitReached={limitReached}
          submittedCount={mySubs.length}
          onText={() => setStep("text")}
          onImage={() => setStep("image")}
        />
      )}

      {step === "text" && sessionId && (
        <TextStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          onDone={() => setStep("done")}
          onBack={() => setStep(canText && canImage ? "choose" : "choose")}
        />
      )}

      {step === "image" && sessionId && (
        <ImageStep
          room={room}
          board={board}
          sessionId={sessionId}
          displayName={name}
          onDone={() => setStep("done")}
          onBack={() => setStep("choose")}
        />
      )}

      {step === "done" && (
        <DoneStep
          approval={board.moderation.mode === "approval"}
          allowMore={allowMultiple}
          onAnother={() => setStep("choose")}
          publicId={publicId}
        />
      )}
    </ParticipantShell>
  );
}

// ---- steps ------------------------------------------------------------------

function JoinStep({ board, name, nameError, onName, onContinue, participants }: { board: Board; name: string; nameError: string | null; onName: (v: string) => void; onContinue: () => void; participants: number }) {
  const policy = board.participation.name_policy;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)" }}>{board.public_title}</h1>
        {board.public_subtitle && <p style={{ fontSize: "var(--text-md)", color: "var(--text-muted)" }}>{board.public_subtitle}</p>}
        {participants > 0 && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>{participants} משתתפים כבר הצטרפו</p>}
      </div>
      {policy !== "disabled" && (
        <Input
          label={policy === "required" ? "השם שלכם" : "השם שלכם (אופציונלי)"}
          value={name}
          onChange={(e) => onName(e.target.value)}
          error={nameError}
          placeholder="איך לקרוא לכם על המסך?"
          required={policy === "required"}
        />
      )}
      <Button variant="primary" size="lg" block onClick={onContinue}>המשך</Button>
    </div>
  );
}

function ChooseStep({ canText, canImage, limitReached, submittedCount, onText, onImage }: { canText: boolean; canImage: boolean; limitReached: boolean; submittedCount: number; onText: () => void; onImage: () => void }) {
  if (limitReached) {
    return <StateCard icon={<IconCheck size={40} />} title="כבר שלחתם" description="בלוח הזה אפשר לשלוח פעם אחת. תודה על ההשתתפות!" />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>מה תרצו לשלוח?</div>
      {submittedCount > 0 && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>שלחתם {submittedCount} פריטים עד כה — אפשר להוסיף עוד.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {canText && <ChoiceCard icon={<IconText size={24} />} title="כתבו תשובה" desc="שתפו רעיון או תשובה קצרה בטקסט" onClick={onText} />}
        {canImage && <ChoiceCard icon={<IconImage size={24} />} title="הוסיפו תמונה" desc="צלמו או העלו תמונה מהגלריה" onClick={onImage} />}
      </div>
    </div>
  );
}

function TextStep({ room, board, sessionId, displayName, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; onDone: () => void; onBack: () => void }) {
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
    if (blocked) return setError("התשובה מכילה מילה שאינה מותרת. אנא נסחו מחדש.");
    // Duplicate / rate-limit protection.
    const mine = db.listSubmissionsForParticipant(room.id, sessionId);
    const last = mine[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < SUBMISSION_RATE_LIMIT_MS) {
      return setError("רגע לפני — נסו שוב עוד כמה שניות");
    }
    if (mine.some((s) => s.text_content?.trim() === clean.trim())) {
      return setError("כבר שלחתם את התשובה הזו");
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
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
      <BackLink onClick={onBack} />
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{board.public_subtitle || "כתבו את התשובה שלכם"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value.slice(0, limit)); setError(null); }}
          placeholder="כתבו כאן…"
          className="ngg-focusable"
          autoFocus
          style={{ width: "100%", minHeight: 160, flex: 1, fontFamily: "var(--font-sans)", fontSize: "var(--text-md)", color: "var(--text)", background: "var(--surface)", border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`, borderRadius: "var(--radius-xl)", padding: 14, outline: "none", lineHeight: "var(--leading-relaxed)", resize: "none" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-2xs)" }}>
          <span style={{ color: error ? "var(--danger)" : "var(--text-subtle)", fontWeight: "var(--weight-semibold)" }}>{error ?? " "}</span>
          <span style={{ color: remaining < 20 ? "var(--warning)" : "var(--text-subtle)" }}>{remaining} תווים נותרו</span>
        </div>
      </div>
      <StickyAction>
        <Button variant="primary" size="lg" block disabled={!canSubmit || !text.trim()} onClick={submit}>
          {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? "שלח" : "קבלת התוכן מושהית"}
        </Button>
      </StickyAction>
    </div>
  );
}

function ImageStep({ room, board, sessionId, displayName, onDone, onBack }: { room: LiveRoom; board: Board; sessionId: string; displayName: string; onDone: () => void; onBack: () => void }) {
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
        moderationMode: board.moderation.mode,
      });
      setSubmitting(false);
      onDone();
    }, 350);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BackLink onClick={onBack} />
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>הוסיפו תמונה</div>
      <ImageUploadField value={image} onChange={setImage} maxSizeMb={board.participation.image_size_limit_mb} />
      {image && (
        <Input label="כיתוב (אופציונלי)" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} placeholder="הוסיפו כיתוב קצר" />
      )}
      <StickyAction>
        <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
          {submitting ? <Spinner size={18} color="#fff" /> : room.status === "active" ? "שלח תמונה" : "קבלת התוכן מושהית"}
        </Button>
      </StickyAction>
    </div>
  );
}

function DoneStep({ approval, allowMore, onAnother, publicId }: { approval: boolean; allowMore: boolean; onAnother: () => void; publicId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center", paddingTop: 20 }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: approval ? "var(--warning-bg)" : "var(--success-bg)", color: approval ? "var(--warning)" : "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {approval ? <IconClock size={34} /> : <IconCheck size={34} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-extrabold)" }}>
          {approval ? "התוכן נשלח וממתין לאישור המנחה" : "התוכן שלכם עלה על הלוח!"}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", maxWidth: 320 }}>
          {approval ? "ברגע שהמנחה יאשר, התוכן יופיע על המסך המשותף." : "אפשר לראות אותו כעת על המסך המשותף."}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
        {allowMore && <Button variant="primary" size="lg" block onClick={onAnother}>שליחת תוכן נוסף</Button>}
        <a href={`/display/${publicId}`} target="_blank" rel="noreferrer">
          <Button variant="outline" size="md" block>צפייה בלוח המשותף</Button>
        </a>
      </div>
    </div>
  );
}

// ---- shell + shared bits ----------------------------------------------------

function ParticipantShell({ board, children }: { board: Board | null; children: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <Image src="/brand/ngg-logo.png" alt="NGG" width={64} height={22} style={{ height: 22, width: "auto" }} />
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: 480, margin: "0 auto", padding: "20px 18px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "48px 12px" }}>
      <div style={{ color: "var(--text-subtle)" }}>{icon}</div>
      <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-extrabold)" }}>{title}</h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", maxWidth: 320 }}>{description}</p>
    </div>
  );
}

function ChoiceCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ngg-card-hover"
      style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "16px 18px", cursor: "pointer", textAlign: "start", minHeight: 72 }}
    >
      <span style={{ width: 46, height: 46, borderRadius: "var(--radius-lg)", background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)" }}>{title}</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{desc}</span>
      </span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer", padding: 0 }}>
      ← חזרה
    </button>
  );
}

function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "sticky", bottom: 0, paddingTop: 12, paddingBottom: 4, background: "linear-gradient(to top, var(--surface-sunken) 70%, transparent)" }}>
      {children}
    </div>
  );
}

function Banner({ icon, color, children }: { icon: React.ReactNode; color: "warning" | "info"; children: React.ReactNode }) {
  const c = color === "warning" ? { border: "var(--warning)", bg: "var(--warning-bg)", color: "var(--warning)" } : { border: "var(--info)", bg: "var(--info-bg)", color: "var(--info)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--radius-lg)", padding: "10px 12px", fontSize: "var(--text-xs)", color: c.color, fontWeight: "var(--weight-semibold)" }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
