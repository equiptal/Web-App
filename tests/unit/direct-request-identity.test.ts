import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { directTarget } from "@/lib/contract/requests";

/**
 * ── A DIRECT request names the FIRM, everywhere it is described (owner, 2026-09-13) ─────────────
 *
 * On the details drawer: *"i want to remove these pills, just keep the open or status of request at
 * top in the title header. but in case it is a direct request, instead of these pills will show the
 * store logo and the name, «direct to Sigma store (logo)» for example"*.
 * On the send confirmation: *"in direct, language must change - it is not to all suppliers, i will
 * show here the store logo instead of Moedatech"*.
 *
 * 🔴 **The name and the logo are not on the wire for a POSTED request.** `GET /rentees/me/requests/
 * {id}` spreads the request row, so `supplierId` arrives and nothing else; `getMyRequests` selects
 * no supplier at all. A store cannot be resolved from that id either - `/api/stores/:id` is keyed on
 * the STORE and the list takes no supplier filter. So the drawer says «Direct request» today and
 * fills itself the day the field lands, which is what these cases pin.
 *
 * The CREATE flow is different and is fully built: the draft holds `DirectTarget`, so the
 * confirmation has the name and can fetch the logo by `storeId`.
 */
const MODAL = readFileSync("src/components/workspace/RequestDetailsModal.tsx", "utf8");
const PANEL = readFileSync("src/components/share/ShareRequestPanel.tsx", "utf8");
const POST = readFileSync("src/components/create/ShareOnPost.tsx", "utf8");

describe("reading the target off a request record", () => {
  it("is null when nothing names a supplier — a broadcast has no firm", () => {
    expect(directTarget({ id: "r1" })).toBeNull();
    expect(directTarget(null)).toBeNull();
    expect(directTarget({ supplierId: null })).toBeNull();
  });

  it("Given only the id — TODAY's payload — Then the id, and no name to print", () => {
    // The honest answer: there IS a firm, and we cannot name it. The chip says «Direct request».
    expect(directTarget({ supplierId: 42 })).toEqual({ id: "42", name: null, logoUrl: null });
  });

  it("reads whichever spelling the two services land on", () => {
    /**
     * Tolerant on purpose, the `DirectorySupplier.equipmentCount` pattern of 2026-09-08: render it
     * now, and the field starts working the day it arrives with no second web change.
     */
    expect(directTarget({ supplierId: 7, storeName: "Sigma Store" })?.name).toBe("Sigma Store");
    expect(directTarget({ supplierId: 7, supplier: { name: "Sigma" } })?.name).toBe("Sigma");
    expect(directTarget({ supplierId: 7, supplierCompanyName: "Sigma Co." })?.name).toBe("Sigma Co.");
    expect(directTarget({ supplierId: 7, store: { logoUrl: "https://x/l.png" } })?.logoUrl).toBe("https://x/l.png");
  });

  it("prefers the STORE's name, which is the one he pressed to start the request", () => {
    const t = directTarget({ supplierId: 7, storeName: "Sigma Store", supplierName: "Sigma Trading LLC" });
    expect(t?.name).toBe("Sigma Store");
  });

  it("treats an empty string as no name, never as a name", () => {
    expect(directTarget({ supplierId: 7, storeName: "   " })?.name).toBeNull();
  });
});

describe("the details drawer", () => {
  it("keeps the STATUS and drops the rest of the pill row", () => {
    // Reference and bid count both repeated what was already on screen — the subtitle, and the cards
    // the reader is scrolling to.
    expect(MODAL).toMatch(/statusMeta\(subject\.status\)/);
    expect(MODAL).not.toMatch(/Open to the market/);
    expect(MODAL).not.toMatch(/t\.workspace\.bidsSplit/);
  });

  it("no longer takes the bids at all, so the dashboard stopped fetching them", () => {
    // A prop nothing reads is the next agent's reason to put the row back.
    expect(MODAL).not.toMatch(/bids: WorkspaceBid\[\]/);
    expect(readFileSync("src/components/home/HomeRequests.tsx", "utf8")).not.toMatch(/setOpenBids/);
  });

  it("draws the firm's chip only on a DIRECT request", () => {
    expect(MODAL).toMatch(/=== "DIRECT" \? directTarget\(subjectRecord\) : null/);
  });
});

describe("the send confirmation", () => {
  it("says the ONE firm instead of promising the marketplace", () => {
    // «Every supplier there can bid on it» is the broadcast promise, and this is the last screen
    // before the request leaves.
    expect(PANEL).toMatch(/c\.destDirectLine/);
    expect(PANEL).toMatch(/direct\.supplierName \?\? c\.destDirectFallback/);
  });

  it("fetches the store's logo by the id the DRAFT carries, and survives its failure", () => {
    expect(PANEL).toMatch(/\/api\/stores\/\$\{encodeURIComponent\(id\)\}/);
    // A picture that does not load must not stop a send: the block still says where it goes.
    const at = PANEL.indexOf("const id = direct?.storeId");
    expect(PANEL.slice(at, at + 500)).toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it("only the CREATE flow can pass it, because only the draft knows", () => {
    expect(POST).toMatch(/direct=\{state\.direct \?/);
  });
});
