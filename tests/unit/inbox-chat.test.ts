import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inboxPreview,
  inboxTimeLabel,
  isDealActionMessage,
  summarizeChannelMessages,
  type SummarizableMessage,
} from "@/lib/contract/inbox-chat";

/**
 * **The inbox row's chat line**, ported from the app (owner, 2026-09-22: *"check the inbox changes
 * on the app and align the web with"*).
 *
 * 🔴 **The rule is written TWICE, in two products.** These fixtures ARE the contract: a case added
 * here must be added to the app's own inbox tests, exactly as `contact-guard.test.ts` says of its
 * list. Where a case pins something the app decided, the app's reason is quoted.
 */

const SRC = resolve(__dirname, "../../src");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const YOU = "You: ";
const UPDATE = "Update in the deal room";
const preview = (text: string | null | undefined, isMine = false) =>
  inboxPreview({ text, isMine, youPrefix: YOU, updateLabel: UPDATE });

describe("the row's preview line", () => {
  it("Given the counterparty spoke, Then it quotes him unprefixed", () => {
    expect(preview("Can you do 26,000?")).toBe("Can you do 26,000?");
  });

  it("Given the renter spoke, Then it is prefixed, so a row never reads as the supplier's words", () => {
    expect(preview("Can you do 26,000?", true)).toBe("You: Can you do 26,000?");
  });

  it("Given a structured card with no text, Then it reads the update line and is NEVER prefixed", () => {
    /**
     * Counter-offers and asks carry their payload in `extraData`, so their `text` is absent; a system
     * event drops its own deliberately. The app's reason for withholding «You:» here: the placeholder
     * is a system-shaped line, and a prefix made an EVENT read like quoted speech.
     */
    expect(preview(null)).toBe(UPDATE);
    expect(preview(null, true)).toBe(UPDATE);
    expect(preview("   ", true)).toBe(UPDATE);
  });

  it("Given newlines in the message, Then they collapse — the row is ONE line", () => {
    // A leading newline would otherwise blank a row that is clipped with an ellipsis.
    expect(preview("\n\nhello\n  there ")).toBe("hello there");
  });
});

describe("the row's time stamp", () => {
  const now = new Date(2026, 8, 22, 14, 30); // 22 Sep 2026, 14:30 local

  it("Given today, Then the time of day", () => {
    expect(inboxTimeLabel({ when: new Date(2026, 8, 22, 9, 5), now, ar: false, yesterdayLabel: "Yesterday" }))
      .toMatch(/^9:05\s?AM$/i);
  });

  it("Given yesterday, Then the word", () => {
    expect(inboxTimeLabel({ when: new Date(2026, 8, 21, 23, 59), now, ar: false, yesterdayLabel: "Yesterday" }))
      .toBe("Yesterday");
  });

  it("Given this year, Then a short date with no year", () => {
    const out = inboxTimeLabel({ when: new Date(2026, 8, 18), now, ar: false, yesterdayLabel: "Yesterday" });
    expect(out).toContain("18");
    expect(out).not.toContain("2026");
  });

  it("Given another year, Then the year is stated", () => {
    const out = inboxTimeLabel({ when: new Date(2025, 8, 18), now, ar: false, yesterdayLabel: "Yesterday" });
    expect(out).toContain("2025");
  });

  it("Given a stamp in the FUTURE, Then it counts as today rather than inventing a tomorrow", () => {
    // Clock skew between a device and Stream is real; «tomorrow» on a message already on screen is not.
    const out = inboxTimeLabel({ when: new Date(2026, 8, 23, 8, 0), now, ar: false, yesterdayLabel: "Yesterday" });
    expect(out).toMatch(/8:00/);
  });

  it("Given the Arabic build, Then the DIGITS are Latin", () => {
    /**
     * This product's own rule since 2026-09-04, and the app applies `toLatinDigits` at this exact
     * call. `ar-SA` would format «٩:٠٥», which disagrees with every other figure on the screen.
     */
    const out = inboxTimeLabel({ when: new Date(2026, 8, 18), now, ar: true, yesterdayLabel: "أمس" });
    expect(out).toMatch(/18/);
    expect(out).not.toMatch(/[٠-٩]/);
  });
});

describe("an EVENT is not speech", () => {
  it("Given a backend action line, Then it is recognised in both languages", () => {
    /**
     * 🔴 The backend bakes term events into the channel as fixed ARABIC text, so without this an
     * English renter reads untranslated Arabic attributed to the counterparty.
     */
    expect(isDealActionMessage("Ahmed countered the rate")).toBe(true);
    expect(isDealActionMessage("proposed a rate: 26,000")).toBe(true);
    expect(isDealActionMessage("اقترح سعراً جديداً")).toBe(true);
    expect(isDealActionMessage("أغلق غرفة التفاوض")).toBe(true);
  });

  it("Given an ordinary message, Then it is speech", () => {
    expect(isDealActionMessage("Can you do 26,000?")).toBe(false);
    expect(isDealActionMessage("هل يمكن تخفيض السعر؟")).toBe(false);
  });
});

describe("summarising a channel", () => {
  const msg = (over: Partial<SummarizableMessage> = {}): SummarizableMessage => ({
    type: "regular",
    text: "hello",
    createdAt: new Date(2026, 8, 22, 10, 0),
    user: { id: "them" },
    ...over,
  });

  it("Given a deleted last message, Then it walks BACK to the newest survivor", () => {
    // A tombstone still arrives in channel state, so `.last` is not the answer.
    const out = summarizeChannelMessages({
      messages: [msg({ text: "kept" }), msg({ text: "gone", deletedAt: new Date() })],
      reads: [],
      otherMemberIds: new Set(["them"]),
      currentUserId: "me",
    });
    expect(out?.text).toBe("kept");
  });

  it("Given an action line, Then it is nobody's message: no text, no tick, not mine", () => {
    const out = summarizeChannelMessages({
      messages: [msg({ text: "اقترح سعراً جديداً", user: { id: "me" } })],
      reads: [],
      otherMemberIds: new Set(["them"]),
      currentUserId: "me",
    });
    expect(out?.text).toBeNull();
    expect(out?.isMine).toBe(false);
  });

  it("Given a Stream system message, Then the same", () => {
    const out = summarizeChannelMessages({
      messages: [msg({ type: "system", text: "joined" })],
      reads: [],
      otherMemberIds: new Set(["them"]),
      currentUserId: "me",
    });
    expect(out?.text).toBeNull();
  });

  it("Given EVERY other member is past it, Then read", () => {
    const at = new Date(2026, 8, 22, 10, 0);
    const out = summarizeChannelMessages({
      messages: [msg({ user: { id: "me" }, createdAt: at })],
      reads: [
        { userId: "them", lastRead: new Date(at.getTime() + 1000) },
        { userId: "colleague", lastRead: new Date(at.getTime() + 2000) },
      ],
      otherMemberIds: new Set(["them", "colleague"]),
      currentUserId: "me",
    });
    expect(out?.isMine).toBe(true);
    expect(out?.readByOther).toBe(true);
  });

  it("Given ONE colleague has not read it, Then not read", () => {
    /**
     * 🔴 `every`, not `some`. A company-shared room has colleagues on the far side, and claiming
     * «read» while one of them has not opened it would be a lie the renter acts on.
     */
    const at = new Date(2026, 8, 22, 10, 0);
    const out = summarizeChannelMessages({
      messages: [msg({ user: { id: "me" }, createdAt: at })],
      reads: [{ userId: "them", lastRead: new Date(at.getTime() + 1000) }],
      otherMemberIds: new Set(["them", "colleague"]),
      currentUserId: "me",
    });
    expect(out?.readByOther).toBe(false);
  });

  it("Given a member with NO read state at all, Then they have read nothing", () => {
    /**
     * 🔴 The check is against the MEMBER list, never against the read states that happen to exist —
     * an absent state would otherwise let `every` claim read over an empty set.
     */
    const out = summarizeChannelMessages({
      messages: [msg({ user: { id: "me" } })],
      reads: [],
      otherMemberIds: new Set(["them"]),
      currentUserId: "me",
    });
    expect(out?.readByOther).toBe(false);
  });

  it("Given no other members at all, Then not read — the fail-safe grey tick", () => {
    const out = summarizeChannelMessages({
      messages: [msg({ user: { id: "me" } })],
      reads: [],
      otherMemberIds: new Set(),
      currentUserId: "me",
    });
    expect(out?.readByOther).toBe(false);
  });

  it("Given nothing but tombstones, Then null — the row keeps its equipment subtitle", () => {
    const out = summarizeChannelMessages({
      messages: [msg({ deletedAt: new Date() })],
      reads: [],
      otherMemberIds: new Set(["them"]),
      currentUserId: "me",
    });
    expect(out).toBeNull();
  });
});

describe("the reader degrades rather than throwing", () => {
  it("Given the module, Then the query is CHUNKED at Stream's own ceiling", () => {
    /**
     * 🔴 Stream caps a channel query's `limit` at 30 and the inbox loads every received bid, so
     * without slicing, rooms 31 and after would silently keep the pre-chat subtitle for ever. The
     * app shipped the single-query version first and records the same trap.
     */
    const code = strip(read("lib/chat/inbox-chat-summary.ts"));
    expect(code).toContain("CHANNEL_PAGE_LIMIT = 30");
    expect(code).toMatch(/for \(let start = 0; start < channelIds\.length; start \+= CHANNEL_PAGE_LIMIT\)/);
  });

  it("Given Stream is unreachable, Then the failure is swallowed", () => {
    // The list paints BEFORE this read and never waits for it: the chat line is decoration over a
    // list that already works, so a throw here must never reach the screen.
    expect(strip(read("lib/chat/inbox-chat-summary.ts"))).toMatch(/\}\s*catch\s*\{/);
  });
});
