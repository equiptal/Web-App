import { describe, it, expect } from "vitest";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * What a bid that came through the renter's shared link is CALLED (owner, 2026-09-06: *"offline /
 * added by you is not clear — do you suggest other text?"*).
 *
 * «Offline» was wrong twice over. This app already uses the word for **no connection** — four
 * strings in `en.ts` say "You appear to be offline" — so a bid was labelled with a network state.
 * And it described our plumbing rather than the renter's own act: he sent a link, somebody answered
 * it. The vocabulary is «Via your link» now, which sits beside «Via app» as its opposite and cannot
 * be misread.
 *
 * Pinned because copy drifts back, and because the collision is invisible in review: both sentences
 * are correct English about different things.
 */

/**
 * ── Only the CARD changed (owner, 2026-09-06) ──────────────────────────────────────────────────
 * *"OK, I want this on the bid card, but for the filter keep as before; even «offline · invite»
 * keep it, and the others — only change the bid card."* So the rename is one string wide: the line
 * on a bid card, and the rail row that is one bid. The filter tab, the comparison's supplier line
 * and the details count keep the word the renter has been reading.
 */
describe("the bid card names the link; everything else is unchanged", () => {
  it("says «Via your link» on the card, in both locales", () => {
    // «Offline» on a CARD collided with this app's own word for a lost connection, and said how our
    // plumbing works rather than what the renter did: he sent a link and this came back through it.
    expect(en.workspace.sourceOfflineLong).toBe("Via your link");
    expect(ar.workspace.sourceOfflineLong).toContain("رابطك");
    // Its opposite on the same line of the same card.
    expect(en.workspace.sourceAppLong).toContain("app");
  });

  it("leaves the FILTER, the invite line and the count exactly as they were", () => {
    expect(en.workspace.sourceOffline).toBe("Offline");
    expect(en.workspace.offlineInvite).toBe("Offline · invite ↗");
    expect(en.workspace.sourceOfflineShort).toBe("Offline · added by you");
    expect(en.workspace.bidsSplit).toContain("added offline");
    expect(ar.workspace.sourceOffline).toBe("خارج التطبيق");
    expect(ar.workspace.offlineInvite).toContain("دعوة");
  });

  it("still says «offline» where it means the connection", () => {
    // The control: the word keeps its real job elsewhere in the dictionary.
    expect(JSON.stringify(en)).toMatch(/you appear to be offline/i);
  });
});
