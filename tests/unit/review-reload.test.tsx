import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CreateSurface } from "@/components/CreateSurface";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { DRAFT_STORAGE_KEY, RfqProvider, useRfq } from "@/lib/store/rfq-store";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas, stubFetch } from "../setup/canvas";

/**
 * Refreshing «Review & send» refreshes it (owner, 2026-09-03).
 *
 * The review screen was a transient mode: `readyToSend` never rode with the persisted draft, so a
 * reload rehydrated the request and dropped the renter back on the canvas he had already finished —
 * the create flow's start, as far as he could tell. The position is part of the draft now.
 */

const answered = (store: ReturnType<typeof useRfq>) => {
  store.actions.touchField("line_items[a0].equipment_year");
  store.actions.touchField("line_items[a0].safety_certificates");
  store.actions.setChargedDaysUnderstood(true);
};

async function onReview() {
  const handle = await renderCanvas(<CreateSurface />, {
    draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    prepare: answered,
  });
  await handle.run(() => handle.store().actions.setReadyToSend(true));
  expect(screen.getByText("Ready to send")).toBeTruthy();
  return handle;
}

describe("the review screen survives a reload", () => {
  it("persists the review position with the draft", async () => {
    await onReview();
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(saved.readyToSend).toBe(true);
    expect(saved.phase).toBe("wizard");
  });

  it("comes back to the review, not to the canvas", async () => {
    const handle = await onReview();
    handle.view.unmount();

    // A reload: a fresh mount with nothing seeded, so the saved draft is all the store has.
    stubFetch();
    await act(async () => {
      render(
        <LocaleProvider initialLocale="en">
          <SessionProvider>
            <RfqProvider>
              <CreateSurface />
            </RfqProvider>
          </SessionProvider>
        </LocaleProvider>,
      );
    });

    expect(screen.getByText("Ready to send")).toBeTruthy();
    expect(screen.queryByText("The machine")).toBeNull();
  });
});

describe("Back still walks the chain after a reload", () => {
  it("keeps the reloaded entry's rung instead of rewriting it to the intake", async () => {
    await onReview();
    // The review is rung 2 of intake (0) → canvas (1) → review (2); a refresh must not restamp the
    // current entry as the baseline, or Back would leave the flow from the review screen.
    expect((window.history.state as { rfqOrd?: number } | null)?.rfqOrd).toBe(2);
  });
});
