import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Where the auto-filer is RENDERED, which turned out to be the whole of whether it runs.
 *
 * 🔴 **`ProjectFiled` lived inside `Confirmation`, and `CreateSurface` stopped rendering that
 * screen.** On 2026-09-03 the confirmation page was replaced by the share card for any post made
 * from it (`state.shareOnPost ? <ReadyToSend /> : <Confirmation />`), which is the right call for
 * the renter and quietly took the filing with it: every request posted that way was assigned to no
 * project, and no project was created for it either. Not a wrong project. None.
 *
 * It was invisible from every side. The request posts, the link appears, the share works, and the
 * only symptom is a chart with nothing on it weeks later.
 *
 * ── Why this test reads the SOURCE ──────────────────────────────────────────────────────────────
 *
 * ⚠️ The behaviour it protects is "this component is mounted on both branches", and both branches
 * are decided by a `phase` the store owns. Rendering the surface twice to prove a dialog mounted
 * would test the store's phase machine, not the placement — and it was the PLACEMENT that was
 * wrong while every behavioural test around it stayed green.
 *
 * So it asserts the structural fact directly: the filer sits outside the phase switch, in the one
 * file that owns both branches. Crude, and it fails the moment somebody moves it back.
 */

const read = (p: string) => readFileSync(p, "utf8");

const SURFACE = "src/components/CreateSurface.tsx";
const CONFIRMATION = "src/components/screens/Confirmation.tsx";

describe("the auto-filer outlives the question of which screen won", () => {
  it("Given CreateSurface, Then it renders ProjectFiled itself", () => {
    const src = read(SURFACE);
    expect(src).toContain('from "@/components/create/ProjectFiled"');
    expect(src).toContain("<ProjectFiled");
  });

  it("Given Confirmation, Then it does NOT — one home, not two", () => {
    /**
     * ⚠️ Rendered in both, a renter on the ordinary confirmation path would mount two of them: two
     * reads of his project list and two `assignToProject` calls for one request.
     */
    const src = read(CONFIRMATION);
    expect(src).not.toContain("<ProjectFiled");
  });

  it("Given the filer, Then it sits OUTSIDE the phase switch", () => {
    /**
     * 🔴 This is the bug in one line. Inside the switch it belongs to whichever screen won, and the
     * share card wins for every post made from it. Outside, it runs either way.
     *
     * `ShareOnPost` is rendered outside for the same reason and is the anchor here: the filer has
     * to appear after it, in the shared tail of the component.
     */
    const src = read(SURFACE);
    const switchEnds = src.indexOf("  })();");
    const filer = src.indexOf("<ProjectFiled");

    expect(switchEnds).toBeGreaterThan(-1);
    expect(filer).toBeGreaterThan(switchEnds);
  });

  it("Given a draft already filed under a site, Then the filer is not drawn at all", () => {
    // A renter who chose a project has been asked nothing and is asked nothing now.
    expect(read(SURFACE)).toContain("!state.draft.projectId");
  });

  it("Given the review, Then it waits for the post — it is gated on `confirmation`", () => {
    // There is no request to file until one exists, and no id to hand it.
    const src = read(SURFACE);
    const filer = src.indexOf("<ProjectFiled");
    const gate = src.lastIndexOf('state.phase === "confirmation"', filer);

    expect(gate).toBeGreaterThan(-1);
    // The gate is the filer's own, not a leftover from the block above it.
    expect(filer - gate).toBeLessThan(700);
  });
});
