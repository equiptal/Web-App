"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Deal-room chat voice note (app parity: chat_input_bar mic → record → send). Records mic audio via
 * MediaRecorder and hands the parent a single audio File on stop; Cancel discards it. Pure recorder —
 * the parent uploads/sends it (via GetStream) so this component stays free of chat wiring.
 *
 * The app caps voice/media modestly; we reuse the chat's media cap. Output MIME is whatever the browser
 * supports (webm/opus on Chromium, mp4/aac on Safari) — GetStream stores it as a file attachment and the
 * message list renders an <audio> player, matching the app's inline voice bubble.
 */
type Props = {
  disabled?: boolean;
  ar: boolean;
  L: (en: string, ar: string) => string;
  maxBytes: number;
  onRecorded: (file: File) => void;
  onError: (msg: string) => void;
  /** Fired when recording starts/stops so the composer can take over its row (app parity). */
  onRecordingChange?: (recording: boolean) => void;
};

function pickMime(): string {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  for (const m of cands) if (MR && MR.isTypeSupported?.(m)) return m;
  return "";
}
function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function VoiceRecorder({ disabled, ar, L, maxBytes, onRecorded, onError, onRecordingChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } stopTracks(); }, []);

  async function start() {
    if (disabled || recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError(L("Voice notes aren't supported on this browser.", "الملاحظات الصوتية غير مدعومة في هذا المتصفح."));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stopTracks();
        setRecording(false);
        onRecordingChange?.(false);
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (cancelledRef.current) return;
        if (blob.size === 0) { onError(L("Nothing recorded.", "لم يُسجَّل شيء.")); return; }
        if (blob.size > maxBytes) { onError(L(`Voice note is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`, `الملاحظة الصوتية كبيرة جدًا (الحد ${Math.round(maxBytes / (1024 * 1024))} ميغابايت).`)); return; }
        onRecorded(new File([blob], `voice-note.${extFor(type)}`, { type }));
      };
      rec.start();
      setSeconds(0);
      setRecording(true);
      onRecordingChange?.(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      stopTracks();
      onError(L("Microphone permission denied.", "تم رفض إذن الميكروفون."));
    }
  }

  const finish = (cancel: boolean) => {
    cancelledRef.current = cancel;
    try { recRef.current?.stop(); } catch { stopTracks(); setRecording(false); }
  };

  if (!recording) {
    return (
      <button type="button" className="ib" disabled={disabled} onClick={start} aria-label={L("Record a voice note", "تسجيل ملاحظة صوتية")} title={L("Voice note", "ملاحظة صوتية")}>
        <span className="material-icons-outlined">mic</span>
      </button>
    );
  }
  return (
    <div className="vn-rec" dir={ar ? "rtl" : "ltr"} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <span className="vn-dot" aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: "#d9362a", animation: "pulse 1s infinite" }} />
      <span className="vn-time" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--navy,#0f1e2e)" }}>{fmtTime(seconds)}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted,#6b7280)" }}>{L("Recording…", "جارٍ التسجيل…")}</span>
      <button type="button" className="ib" onClick={() => finish(true)} aria-label={L("Cancel", "إلغاء")} title={L("Cancel", "إلغاء")}>
        <span className="material-icons-outlined" style={{ color: "#d9362a" }}>delete</span>
      </button>
      <button type="button" className="ib send" onClick={() => finish(false)} aria-label={L("Send voice note", "إرسال")} title={L("Send", "إرسال")}>
        <span className="material-icons-outlined">send</span>
      </button>
    </div>
  );
}
