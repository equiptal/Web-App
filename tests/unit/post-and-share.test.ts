import { describe, it, expect } from "vitest";
import { initialState, reducer } from "@/lib/store/rfq-store";

/**
 * Post, create, share — in one press.
 *
 * The link does not exist until the request does; it is minted from the uuid the backend answers
 * with. So the whole feature is an ORDER, and two things make that order possible:
 *
 *  1. `submit()` returns the ids it creates, because `SUBMIT_SUCCESS` unmounts the screen that
 *     pressed the button before the next line runs.
 *  2. the dialog's open flag lives on the STORE, so it survives that same unmount.
 *
 * Both are pinned here, because the failure they prevent is silent: the request posts, and the share
 * simply never happens.
 */

describe("the post-and-share flag survives the phase flip", () => {
  it("Given the dialog is open, When the post succeeds, Then it is still open", () => {
    /**
     * The failure this guards. `SUBMIT_SUCCESS` sets `phase: "confirmation"`, which swaps the screen
     * underneath — so a flag held in that screen's own `useState` would be destroyed halfway through
     * the one press it exists to serve, and the renter would post and never send.
     */
    const opened = reducer(initialState, { t: "SET_SHARE_ON_POST", value: true });
    expect(opened.shareOnPost).toBe(true);

    const afterPost = reducer(opened, {
      t: "SUBMIT_SUCCESS",
      requestId: "EXC-170845",
      requestIds: ["EXC-170845"],
      requestUuids: ["5cc5efdc-86ab-459e-a73e-564257e2cbd2"],
    });

    expect(afterPost.phase).toBe("confirmation");
    expect(afterPost.shareOnPost).toBe(true);
    // And the uuid the link is built from reaches the state the dialog reads.
    expect(afterPost.requestUuids[0]).toBe("5cc5efdc-86ab-459e-a73e-564257e2cbd2");
  });

  it("Given it was never opened, Then posting leaves it shut", () => {
    const afterPost = reducer(initialState, {
      t: "SUBMIT_SUCCESS",
      requestId: "EXC-170845",
      requestIds: ["EXC-170845"],
      requestUuids: ["5cc5efdc-86ab-459e-a73e-564257e2cbd2"],
    });
    expect(afterPost.shareOnPost).toBe(false);
  });

  it("Given a fresh store, Then the dialog is shut", () => {
    expect(initialState.shareOnPost).toBe(false);
  });

  it("Given it is closed, Then the flag goes down without touching the phase", () => {
    const opened = reducer(initialState, { t: "SET_SHARE_ON_POST", value: true });
    const shut = reducer(opened, { t: "SET_SHARE_ON_POST", value: false });
    expect(shut.shareOnPost).toBe(false);
    expect(shut.phase).toBe(initialState.phase);
  });
});
