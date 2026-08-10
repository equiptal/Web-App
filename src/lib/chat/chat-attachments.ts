/**
 * **The chat attachment path — one copy, two surfaces.**
 *
 * `/deal-room/[id]` and the map's chat dock (004a §2) read the SAME Stream channel, so a file sent
 * from one has to be indistinguishable from a file sent from the other: same accepted types, same
 * size caps, same `attachments[0]` shape, same wording when a file is refused. This module exists
 * because the second copy is what makes that stop being true — a cap raised in one place, an
 * `attachment.type` spelled differently in the other, and the two surfaces quietly disagree about
 * what a message IS while both keep working.
 *
 * It owns the GATE and the UPLOAD and nothing else. It holds no React state, does not decide when a
 * spinner shows, and never creates a deal room: the dock's first message on a roomless bid is a
 * room-creating act (004a §4.5) and that seam stays with the caller, which is the only thing that
 * knows whether a room exists.
 *
 * Copy lives here rather than in either surface's dictionary on purpose. "That file type isn't
 * supported" is a statement about THIS gate, and a renter who is told 10 MB on one surface and
 * something else on the other has been told the rule twice.
 */

import type { Channel } from "stream-chat";

/** One Stream attachment, as both surfaces read it off a message. */
export type ChatAttachment = {
  type?: string;
  image_url?: string;
  thumb_url?: string;
  asset_url?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
  fallback?: string;
};

// Chat attachments — matched EXACTLY to the mobile app (chat_input_bar.dart): images + documents
// ≤ 10 MB, video ≤ 25 MB, and ONE attachment per message. The web used to allow any file, any size,
// multiple at once — these bring it in line.
export const CHAT_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "heic"];
export const CHAT_DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "ppt", "pptx"];
export const CHAT_VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "3gp"];
export const CHAT_ACCEPT = [
  "image/jpeg", "image/png", "image/webp", "image/heic", ".jpg", ".jpeg", ".png", ".webp", ".heic",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".ppt", ".pptx",
  "video/mp4", "video/quicktime", "video/webm", ".mp4", ".mov", ".m4v", ".webm", ".3gp",
].join(",");
export const CHAT_MAX_MEDIA = 10 * 1024 * 1024; // images + documents
export const CHAT_MAX_VIDEO = 25 * 1024 * 1024; // video

/** Localiser, the shape both surfaces already pass around. */
type LFn = (en: string, ar: string) => string;

/** What a file is, once the gate has accepted it. `video` is carried separately from `file` only
 *  because it has its own cap — on the wire both travel as a `file` attachment. */
export type ChatFileKind = "image" | "video" | "file";

/** The gate's answer. A refusal names its reason so the caller can word it, and carries the cap it
 *  broke so the message can state the real number rather than a hardcoded one. */
export type ChatFileVerdict =
  | { ok: true; kind: ChatFileKind }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "too-large"; capBytes: number };

/** The minimum of `File` this gate reads — so it can be exercised without a browser. */
export type ChatFileFacts = { name: string; type: string; size: number };

/**
 * Accept or refuse ONE file, by extension/MIME first and then by the cap its kind carries.
 *
 * Extension AND MIME, because neither alone is reliable: a `.heic` from a Mac often arrives with an
 * empty `type`, and a `.csv` exported from Excel arrives as `application/vnd.ms-excel`.
 */
export function classifyChatFile(file: ChatFileFacts): ChatFileVerdict {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const isImg = file.type.startsWith("image/") || CHAT_IMAGE_EXT.includes(ext);
  const isVideo = file.type.startsWith("video/") || CHAT_VIDEO_EXT.includes(ext);
  const isDoc = CHAT_DOC_EXT.includes(ext);
  if (!isImg && !isVideo && !isDoc) return { ok: false, reason: "unsupported" };
  const capBytes = isVideo ? CHAT_MAX_VIDEO : CHAT_MAX_MEDIA;
  if (file.size > capBytes) return { ok: false, reason: "too-large", capBytes };
  // An image wins over video when both match — a `.webm` is video, but a `.png` with a video MIME is
  // a lie about a picture, and `sendImage` is what makes a thumbnail.
  return { ok: true, kind: isImg ? "image" : isVideo ? "video" : "file" };
}

/** A refusal, in the renter's words. */
export function chatFileRejection(verdict: Extract<ChatFileVerdict, { ok: false }>, L: LFn): string {
  if (verdict.reason === "unsupported") return L("That file type isn't supported.", "نوع الملف غير مدعوم.");
  const mb = Math.round(verdict.capBytes / (1024 * 1024));
  return L(`File is too large (max ${mb} MB).`, `الملف كبير جدًا (الحد ${mb} ميغابايت).`);
}

/** A send that reached the wire and failed there — distinct from a refusal, which never left. */
export function chatSendFailure(what: "attachment" | "voice", L: LFn): string {
  return what === "voice"
    ? L("Couldn't send the voice note.", "تعذّر إرسال الملاحظة الصوتية.")
    : L("Upload failed — please try again.", "فشل الرفع — حاول مجددًا.");
}

/**
 * Upload one accepted file and post it as the message's single attachment.
 *
 * `sendImage` rather than `sendFile` for pictures: it is what gets Stream to mint the thumbnail both
 * surfaces render inline. Everything else — documents AND video — travels as `type: "file"`, which
 * is what the mobile app posts and therefore what the app can read back.
 *
 * `caption` rides along as the message text (the app's behaviour: the composer's line is not thrown
 * away when a file is attached). Empty becomes `undefined`, never `""` — an empty string renders as
 * a blank line above the attachment.
 */
export async function sendChatAttachment(
  channel: Channel,
  file: File,
  kind: ChatFileKind,
  caption?: string,
): Promise<void> {
  const res = kind === "image" ? await channel.sendImage(file) : await channel.sendFile(file);
  const attachment: ChatAttachment =
    kind === "image"
      ? { type: "image", image_url: res.file, fallback: file.name }
      : { type: "file", asset_url: res.file, title: file.name, mime_type: file.type, file_size: file.size };
  await channel.sendMessage({ text: caption?.trim() || undefined, attachments: [attachment] });
}

/**
 * Post a recorded voice note (app parity: mic → voice bubble).
 *
 * `type: "audio"` is what both surfaces switch on to render an `<audio>` player instead of a file
 * row; the `mime_type` beside it is the fallback for a client that only reads that.
 */
export async function sendChatVoiceNote(channel: Channel, file: File): Promise<void> {
  const res = await channel.sendFile(file);
  await channel.sendMessage({
    attachments: [{ type: "audio", asset_url: res.file, title: file.name, mime_type: file.type, file_size: file.size }],
  });
}
