import { describe, expect, it } from "vitest";
import {
  chatAskAnswered,
  chatAskDeclined,
  chatAskFor,
  companyDocNames,
  hasOpenQuoteRequest,
  openCompanyDocAsks,
} from "@/lib/contract/chat-asks";

/**
 * The renter's chat-only asks (Moedatech-App release #548, alignment 1.1), the app's
 * `quote_request.dart` rule for rule: an ask is answered by a FILE sent as a reply to it, a company
 * ask once every paper it named has its own file, and «Not available» is a tagged text reply.
 */

const quote = { id: "q1", text: "I need the quotation for this request", kind: "quote_request" };
const company = { id: "c1", text: "I need the company's CR, VAT", kind: "company_docs_request", docs: ["cr", "vat_cert"] };
const file = (id: string, to: string, docKey?: string) => ({ id, quoted_message_id: to, attachments: [{ type: "file" }], ...(docKey ? { docKey } : {}) });

describe("a quotation ask", () => {
  it("is answered by a file replying to it, never by text", () => {
    expect(chatAskAnswered([quote, { id: "t", quoted_message_id: "q1", text: "tomorrow" }], "q1")).toBe(false);
    expect(chatAskAnswered([quote, file("f", "q1")], "q1")).toBe(true);
  });

  it("stays open on the ask bar until then", () => {
    expect(hasOpenQuoteRequest([quote])).toBe(true);
    expect(hasOpenQuoteRequest([quote, file("f", "q1")])).toBe(false);
  });
});

describe("a company papers ask", () => {
  it("is answered once every named paper has its own file", () => {
    expect(chatAskAnswered([company, file("f1", "c1", "cr")], "c1")).toBe(false);
    expect(chatAskAnswered([company, file("f1", "c1", "cr"), file("f2", "c1", "vat_cert")], "c1")).toBe(true);
  });

  it("counts an older file with no paper named as all of them", () => {
    expect(chatAskAnswered([company, file("f1", "c1")], "c1")).toBe(true);
  });

  it("keeps its papers open until a file or a decline closes it", () => {
    expect([...openCompanyDocAsks([company])].sort()).toEqual(["cr", "vat_cert"]);
    const decline = { id: "d", quoted_message_id: "c1", kind: "ask_declined", text: "Not available" };
    expect(chatAskDeclined([company, decline], "c1")).toBe(true);
    expect(openCompanyDocAsks([company, decline]).size).toBe(0);
  });

  it("names its papers in the reader's language", () => {
    expect(companyDocNames(["cr", "vat_cert"], false)).toBe("Commercial registration, VAT certificate");
    expect(companyDocNames(["cr", "saso"], true)).toBe("السجل التجاري، تسجيل ساسو");
  });
});

describe("which ask a message answers", () => {
  it("a file or a decline replying to a chat ask; nothing else", () => {
    const all = [quote, file("f", "q1"), { id: "t", quoted_message_id: "q1", text: "ok" }];
    expect(chatAskFor(all[1], all)?.id).toBe("q1");
    expect(chatAskFor(all[2], all)).toBeNull();
  });
});
