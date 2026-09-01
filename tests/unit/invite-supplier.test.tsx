import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { InviteSupplierDialog } from "@/components/suppliers/InviteSupplierDialog";
import { JOIN_URL } from "@/lib/config/store-links";
import type { RenterSupplier } from "@/lib/contract/renter-suppliers";

/**
 * SUP-T42 — inviting an off-platform supplier.
 *
 * **One message, every channel.** A second body would be a second thing to keep true, and the first
 * time one of them changed the two would start saying different things about the same product. So
 * the test reads the body out of each channel's own target and compares them.
 */

const supplier = (over: Partial<RenterSupplier> = {}): RenterSupplier =>
  ({
    id: "s1",
    name: "Zahid Tractor",
    kind: "own",
    contactName: null,
    email: "bids@zahid.sa",
    phone: "+966551234567",
    vendorRegistered: true,
    groups: [],
    rollup: { bidsApp: 0, bidsLink: 0 },
    ...over,
  }) as RenterSupplier;

let href = "";
const opened: string[] = [];

beforeEach(() => {
  href = "";
  opened.length = 0;
  Object.defineProperty(window, "location", {
    value: {
      get href() {
        return href;
      },
      set href(v: string) {
        href = v;
      },
    },
    writable: true,
  });
  vi.stubGlobal("open", (u: string) => {
    opened.push(u);
    return null;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = (s: RenterSupplier) =>
  render(
    <LocaleProvider>
      <InviteSupplierDialog supplier={s} onClose={() => {}} />
    </LocaleProvider>,
  );

describe("InviteSupplierDialog", () => {
  it("Given a supplier who never bid, Then the body explains the app and ends at the join link", () => {
    open(supplier());
    const body = en.suppliers.inviteMessageCold.replace("{supplier}", "Zahid Tractor").replace("{url}", JOIN_URL);
    expect(screen.getByText(body)).toBeTruthy();
  });

  it("Given a supplier who already bid through the link, Then the body says so instead", () => {
    open(supplier({ rollup: { bidsApp: 0, bidsLink: 2 } } as Partial<RenterSupplier>));
    const body = en.workspace.inviteMessage.replace("{supplier}", "Zahid Tractor").replace("{url}", JOIN_URL);
    // Chosen for the renter — the list already knows which of the two is true.
    expect(screen.getByText(body)).toBeTruthy();
  });

  it("Given WhatsApp and e-mail, When each is used, Then the body is character-for-character the same", () => {
    open(supplier());
    fireEvent.click(screen.getByRole("button", { name: new RegExp(en.suppliers.inviteChannelWhatsApp) }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(en.suppliers.inviteChannelEmail) }));

    const wa = decodeURIComponent(opened[0].split("?text=")[1]);
    const mail = decodeURIComponent(href.split("&body=")[1]);
    expect(wa).toBe(mail);
    // Only the subject exists in one and not the other.
    expect(decodeURIComponent(href)).toContain(en.suppliers.inviteSubject);
  });

  it("Given no phone, Then WhatsApp and SMS are refused with the reason, and Copy still works", () => {
    open(supplier({ phone: null }));

    const wa = screen.getByRole("button", { name: new RegExp(en.suppliers.inviteChannelWhatsApp) }) as HTMLButtonElement;
    const sms = screen.getByRole("button", { name: new RegExp(en.suppliers.inviteChannelSms) }) as HTMLButtonElement;
    const copy = screen.getByRole("button", { name: new RegExp(en.suppliers.inviteChannelCopy) }) as HTMLButtonElement;

    expect(wa.disabled).toBe(true);
    expect(sms.disabled).toBe(true);
    expect(wa.title).toBe(en.suppliers.inviteNoPhone);
    // A renter who talks to this supplier somewhere we do not model still gets the words.
    expect(copy.disabled).toBe(false);
  });

  it("Given the channels differ in what they record, Then the dialog says which two leave a trace", () => {
    open(supplier());
    // SUP-BE-15 takes email | whatsapp only. Writing SMS as "email" would put a lie in an audit row,
    // so those two are sent and not recorded — and the renter is told, rather than finding a profile
    // missing an entry he remembers making.
    expect(screen.getByText(en.suppliers.inviteRecorded)).toBeTruthy();
  });
});
