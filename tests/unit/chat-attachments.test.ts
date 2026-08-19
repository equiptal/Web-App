/**
 * **The chat attachment path** (`src/lib/chat/chat-attachments.ts`).
 *
 * `/deal-room/[id]` and the map's chat dock read the SAME Stream channel, and since the owner asked
 * for the dock's composer to gain upload and voice notes (2026-08-11) they also both WRITE to it.
 * This suite is the reason that can be one behaviour rather than two: the gate, the caps and the
 * message shape are exercised here once, and both surfaces are proved to import them (in
 * `chat-dock.test.ts`) rather than restate them.
 *
 * The caps and the type list are not invented here either — they are the mobile app's
 * (`chat_input_bar.dart`: images + documents ≤ 10 MB, video ≤ 25 MB, one attachment per message).
 * A web surface that accepted more would be posting messages the app cannot read back.
 */

import { describe, it, expect } from "vitest";
import type { Channel } from "stream-chat";
import {
  CHAT_ACCEPT,
  CHAT_MAX_MEDIA,
  CHAT_MAX_VIDEO,
  chatFileRejection,
  chatSendFailure,
  classifyChatFile,
  sendChatAttachment,
  sendChatVoiceNote,
} from "@/lib/chat/chat-attachments";

/** Only the three fields the gate and the upload read — so this runs in a `node` env with no DOM. */
const fileOf = (name: string, type: string, size = 1024) => ({ name, type, size }) as unknown as File;

const L = (en: string) => en;
const AR = (_en: string, ar: string) => ar;

/** A channel that RECORDS instead of uploading. Both send helpers are pure wire-shaping over these
 *  three calls, so recording them is the whole of what there is to assert. */
function fakeChannel() {
  const calls: { image: File[]; file: File[]; messages: unknown[] } = { image: [], file: [], messages: [] };
  const channel = {
    sendImage: async (f: File) => { calls.image.push(f); return { file: `https://cdn/img/${f.name}` }; },
    sendFile: async (f: File) => { calls.file.push(f); return { file: `https://cdn/file/${f.name}` }; },
    sendMessage: async (m: unknown) => { calls.messages.push(m); return {}; },
  };
  return { calls, channel: channel as unknown as Channel };
}

/* ── the gate ─────────────────────────────────────────────────────────────────────────────────── */

describe("classifyChatFile — what may be attached at all", () => {
  it("reads an image from its MIME type", () => {
    expect(classifyChatFile(fileOf("site.jpg", "image/jpeg"))).toEqual({ ok: true, kind: "image" });
  });

  it("reads an image from its EXTENSION when the browser gave no MIME", () => {
    // A `.heic` off a Mac routinely arrives with `type: ""`. MIME alone would refuse the renter's
    // own photo of the yard.
    expect(classifyChatFile(fileOf("yard.heic", ""))).toEqual({ ok: true, kind: "image" });
  });

  it("reads a spreadsheet by extension even when the MIME is Excel's own", () => {
    // `.csv` exported from Excel arrives as `application/vnd.ms-excel`, which is in no list.
    expect(classifyChatFile(fileOf("terms.csv", "application/vnd.ms-excel"))).toEqual({ ok: true, kind: "file" });
  });

  it("separates video from the other files, because it has its own cap", () => {
    expect(classifyChatFile(fileOf("walkaround.mov", "video/quicktime"))).toEqual({ ok: true, kind: "video" });
  });

  it("refuses a type neither surface can render", () => {
    expect(classifyChatFile(fileOf("payload.exe", "application/octet-stream"))).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(classifyChatFile(fileOf("archive.zip", "application/zip"))).toEqual({ ok: false, reason: "unsupported" });
  });

  it("caps images and documents at 10 MB, and video at 25", () => {
    expect(classifyChatFile(fileOf("big.png", "image/png", CHAT_MAX_MEDIA + 1))).toEqual({
      ok: false,
      reason: "too-large",
      capBytes: CHAT_MAX_MEDIA,
    });
    // The SAME size is fine for video — the two caps are genuinely different, which is why the
    // verdict has to carry which one was broken.
    expect(classifyChatFile(fileOf("clip.mp4", "video/mp4", CHAT_MAX_MEDIA + 1))).toEqual({ ok: true, kind: "video" });
    expect(classifyChatFile(fileOf("clip.mp4", "video/mp4", CHAT_MAX_VIDEO + 1))).toEqual({
      ok: false,
      reason: "too-large",
      capBytes: CHAT_MAX_VIDEO,
    });
  });

  it("admits a file that is EXACTLY at the cap — the boundary is inclusive", () => {
    expect(classifyChatFile(fileOf("edge.pdf", "application/pdf", CHAT_MAX_MEDIA))).toEqual({ ok: true, kind: "file" });
  });

  it("offers the file picker the same list it will accept", () => {
    // The picker's filter and the gate are two statements of one rule; a renter who can CHOOSE a
    // file that is then refused has been let down by the difference.
    for (const ext of [".pdf", ".heic", ".mp4", ".xlsx"]) expect(CHAT_ACCEPT).toContain(ext);
    expect(CHAT_ACCEPT).not.toContain(".zip");
  });
});

describe("the words a refusal is given", () => {
  it("states the REAL cap, per kind", () => {
    const doc = classifyChatFile(fileOf("big.pdf", "application/pdf", CHAT_MAX_MEDIA + 1));
    const vid = classifyChatFile(fileOf("big.mp4", "video/mp4", CHAT_MAX_VIDEO + 1));
    expect(doc.ok).toBe(false);
    expect(vid.ok).toBe(false);
    if (doc.ok || vid.ok) return;
    expect(chatFileRejection(doc, L)).toContain("10 MB");
    expect(chatFileRejection(vid, L)).toContain("25 MB");
  });

  it("speaks Arabic on an Arabic surface", () => {
    const bad = classifyChatFile(fileOf("payload.exe", "application/octet-stream"));
    if (bad.ok) throw new Error("expected a refusal");
    expect(chatFileRejection(bad, AR)).toBe("نوع الملف غير مدعوم.");
    expect(chatSendFailure("voice", AR)).toContain("الصوتية");
  });

  it("tells a refusal apart from a failure — one never left, the other did", () => {
    const bad = classifyChatFile(fileOf("payload.exe", "application/octet-stream"));
    if (bad.ok) throw new Error("expected a refusal");
    expect(chatFileRejection(bad, L)).not.toBe(chatSendFailure("attachment", L));
  });
});

/* ── the wire ─────────────────────────────────────────────────────────────────────────────────── */

describe("sendChatAttachment — one message, one attachment", () => {
  it("uploads a picture through sendImage, so Stream mints the thumbnail both surfaces render", () => {
    // `sendFile` would store the bytes and give back no `thumb_url`, and the bubble would fall
    // through to the grey file row on both surfaces.
    const { calls, channel } = fakeChannel();
    return sendChatAttachment(channel, fileOf("site.jpg", "image/jpeg"), "image").then(() => {
      expect(calls.image.map((f) => f.name)).toEqual(["site.jpg"]);
      expect(calls.file).toHaveLength(0);
      expect(calls.messages).toEqual([
        { text: undefined, attachments: [{ type: "image", image_url: "https://cdn/img/site.jpg", fallback: "site.jpg" }] },
      ]);
    });
  });

  it("sends a document as a `file`, with the title, MIME and size the row is drawn from", () => {
    const { calls, channel } = fakeChannel();
    return sendChatAttachment(channel, fileOf("quote.pdf", "application/pdf", 2048), "file").then(() => {
      expect(calls.messages).toEqual([
        {
          text: undefined,
          attachments: [
            {
              type: "file",
              asset_url: "https://cdn/file/quote.pdf",
              title: "quote.pdf",
              mime_type: "application/pdf",
              file_size: 2048,
            },
          ],
        },
      ]);
    });
  });

  it("sends VIDEO as a `file` too — that is what the mobile app posts and can read back", () => {
    const { calls, channel } = fakeChannel();
    return sendChatAttachment(channel, fileOf("walkaround.mp4", "video/mp4"), "video").then(() => {
      expect(calls.image).toHaveLength(0);
      expect(calls.file.map((f) => f.name)).toEqual(["walkaround.mp4"]);
      expect((calls.messages[0] as { attachments: { type: string }[] }).attachments[0].type).toBe("file");
    });
  });

  it("carries the composer's line as the caption, and drops a blank one entirely", async () => {
    const withText = fakeChannel();
    await sendChatAttachment(withText.channel, fileOf("site.jpg", "image/jpeg"), "image", "  هذا موقع المشروع ");
    expect((withText.calls.messages[0] as { text?: string }).text).toBe("هذا موقع المشروع");
    // `undefined`, never `""` — an empty string renders as a blank line above the attachment.
    const blank = fakeChannel();
    await sendChatAttachment(blank.channel, fileOf("site.jpg", "image/jpeg"), "image", "   ");
    expect((blank.calls.messages[0] as { text?: string }).text).toBeUndefined();
  });

  it("posts exactly ONE attachment per message (app parity)", async () => {
    const { calls, channel } = fakeChannel();
    await sendChatAttachment(channel, fileOf("quote.pdf", "application/pdf"), "file");
    expect(calls.messages).toHaveLength(1);
    expect((calls.messages[0] as { attachments: unknown[] }).attachments).toHaveLength(1);
  });
});

describe("sendChatVoiceNote — the audio bubble", () => {
  it("posts `type: audio`, which is what makes the bubble a player rather than a file row", () => {
    const { calls, channel } = fakeChannel();
    return sendChatVoiceNote(channel, fileOf("voice-note.webm", "audio/webm", 4096)).then(() => {
      expect(calls.file.map((f) => f.name)).toEqual(["voice-note.webm"]);
      expect(calls.messages).toEqual([
        {
          attachments: [
            {
              type: "audio",
              asset_url: "https://cdn/file/voice-note.webm",
              title: "voice-note.webm",
              mime_type: "audio/webm",
              file_size: 4096,
            },
          ],
        },
      ]);
    });
  });

  it("carries no text at all — a voice note is the message", () => {
    const { calls, channel } = fakeChannel();
    return sendChatVoiceNote(channel, fileOf("voice-note.m4a", "audio/mp4")).then(() => {
      expect(calls.messages[0]).not.toHaveProperty("text");
    });
  });

  it("lets a failure out, so the caller can say so rather than clearing the composer", async () => {
    // Both surfaces word their own failure and keep what the renter composed. A helper that
    // swallowed the throw would have them clear the input on a message that never landed.
    const channel = { sendFile: async () => { throw new Error("network"); } } as unknown as Channel;
    await expect(sendChatVoiceNote(channel, fileOf("voice-note.webm", "audio/webm"))).rejects.toThrow("network");
  });
});
