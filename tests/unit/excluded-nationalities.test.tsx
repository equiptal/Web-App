import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { ExcludedNationalities } from "@/components/create/ExcludedNationalities";
import {
  composeExcluded,
  excludedOfTerm,
  excludedText,
  excludedValueText,
  hydrateExcluded,
  parseExcludedNationalities,
  saveExcluded,
} from "@/lib/contract/nationality";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import { machineTermsOfRequestItem } from "@/lib/contract/project-apply";
import { bucketBidTerms, mapBid } from "@/lib/contract/bids";
import type { RfqRequestPayload } from "@/lib/contract";
import { makeAgentDraft, makeItem } from "../setup/canvas";

/**
 * Excluded operator nationalities (app parity, Moedatech-App release PR #548, 2026-10-09).
 * The rules are the app's and the backend's, so these cases are the ticket's own table.
 */

describe("the stored value", () => {
  it("joins picks in list order, then the Other names, with no space", () => {
    expect(composeExcluded(["Syrian", "Sudanese"], "")).toEqual(["Sudanese", "Syrian"]);
    expect(composeExcluded(["Sudanese"], "Somali, Eritrean").join(",")).toBe("Sudanese,Somali,Eritrean");
  });

  it("trims, drops empties and duplicates case-insensitively", () => {
    expect(parseExcludedNationalities(" Sudanese, ,sudanese,Somali ")).toEqual(["Sudanese", "Somali"]);
    expect(composeExcluded(["Sudanese"], "sudanese, Somali")).toEqual(["Sudanese", "Somali"]);
  });

  it("never stores more than 100 characters, cutting names from the end (check 5)", () => {
    const every = ["Egyptian", "Indian", "Pakistani", "Bangladeshi", "Filipino", "Sudanese", "Yemeni", "Syrian", "Jordanian", "Nepali"];
    const names = composeExcluded(every, "Somali, Eritrean, Ethiopian, Kenyan, Ugandan");
    expect(names.join(",").length).toBeLessThanOrEqual(100);
    expect(names[0]).toBe("Egyptian");
  });

  it("saves excluded + the list when something is picked", () => {
    expect(saveExcluded(["Sudanese", "Syrian"], { mode: null, custom: null })).toEqual({ mode: "excluded", custom: "Sudanese,Syrian" });
  });

  it("nothing picked on a new request saves nothing", () => {
    expect(saveExcluded([], { mode: null, custom: null })).toEqual({ mode: null, custom: null });
  });

  it("nothing picked keeps an OLDER value unchanged (check 3)", () => {
    expect(saveExcluded([], { mode: "restricted", custom: "Saudi" })).toEqual({ mode: "restricted", custom: "Saudi" });
    expect(saveExcluded([], { mode: "any", custom: null })).toEqual({ mode: "any", custom: null });
  });

  it("clearing an excluded list saves null for both (check 4)", () => {
    expect(saveExcluded([], { mode: "excluded", custom: "Sudanese" })).toEqual({ mode: null, custom: null });
  });
});

describe("loading a stored item (check 2)", () => {
  it("ticks list names and puts the rest in Other", () => {
    expect(hydrateExcluded("excluded", "Sudanese,somali,syrian")).toEqual({ picked: ["Sudanese", "Syrian"], other: "somali" });
  });

  it("ticks nothing for any other mode", () => {
    expect(hydrateExcluded("restricted", "Sudanese,Syrian")).toEqual({ picked: [], other: "" });
  });

  it("round-trips an app list unchanged when saved untouched", () => {
    const h = hydrateExcluded("excluded", "Sudanese,Syrian");
    expect(saveExcluded(composeExcluded(h.picked, h.other), { mode: "excluded", custom: "Sudanese,Syrian" })).toEqual({ mode: "excluded", custom: "Sudanese,Syrian" });
  });
});

describe("display", () => {
  it("reads a resolved term value and localizes known names only", () => {
    expect(excludedOfTerm("excluded:Sudanese,Somali")).toEqual(["Sudanese", "Somali"]);
    expect(excludedOfTerm("restricted")).toEqual([]);
    expect(excludedValueText(["Sudanese", "Somali"], "en")).toBe("Not: Sudanese, Somali");
    expect(excludedText(["Sudanese", "Saudi"], "ar")).toBe("سوداني، سعودي");
  });
});

describe("what is posted", () => {
  it("sends the list with excluded (check 1), and nothing without an operator (check 6)", () => {
    const op = { ...makeItem().operator, nationality: "excluded", nationalityCustom: "Sudanese,Somali" };
    const withOp = draftToCreateRequest(makeAgentDraft({ items: [makeItem({ operatorNeeded: "yes", operator: op })] }) as RfqRequestPayload, "46").equipmentItems[0];
    expect(withOp.operatorNationality).toBe("excluded");
    expect(withOp.operatorNationalityCustom).toBe("Sudanese,Somali");
    const noOp = draftToCreateRequest(makeAgentDraft({ items: [makeItem({ operatorNeeded: "no", operator: op })] }) as RfqRequestPayload, "46").equipmentItems[0];
    expect(noOp.operatorNationality).toBeUndefined();
    expect(noOp.operatorNationalityCustom).toBeUndefined();
  });

  it("a past request used as a template keeps its list", () => {
    const terms = machineTermsOfRequestItem({ operatorIncluded: "YES", operatorNationality: "excluded", operatorNationalityCustom: "Sudanese" });
    expect(terms.operator.nationalityCustom).toBe("Sudanese");
  });
});

describe("<ExcludedNationalities>", () => {
  afterEach(cleanup);
  const draw = (mode: string | null, custom: string | null, onChange = vi.fn()) => {
    localStorage.setItem("moedatech.locale", "en");
    render(
      <LocaleProvider initialLocale="en">
        <ExcludedNationalities mode={mode} custom={custom} onChange={onChange} />
      </LocaleProvider>,
    );
    return onChange;
  };
  const openList = () => fireEvent.click(screen.getByRole("combobox", { name: "Restricted operator nationalities" }));

  it("picks several, and keeps the list open between picks", () => {
    const onChange = draw(null, null);
    openList();
    fireEvent.click(screen.getByRole("option", { name: "Syrian" }));
    fireEvent.click(screen.getByRole("option", { name: "Sudanese" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "excluded", custom: "Sudanese,Syrian" });
  });

  it("Other opens a 40-character box whose names are saved after the list", () => {
    const onChange = draw("excluded", "Sudanese");
    openList();
    fireEvent.click(screen.getByRole("option", { name: "Other" }));
    const box = screen.getByRole("textbox", { name: "Type the operator nationality" });
    expect(box.getAttribute("maxlength")).toBe("40");
    fireEvent.change(box, { target: { value: "Somali" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "excluded", custom: "Sudanese,Somali" });
  });

  it("shows an app list's Other names in the box on load", () => {
    draw("excluded", "Sudanese,Somali");
    expect((screen.getByRole("textbox", { name: "Type the operator nationality" }) as HTMLInputElement).value).toBe("Somali");
  });
});

describe("the bid comparison", () => {
  const bid = (item: Record<string, unknown>, t3: Record<string, unknown> = {}) =>
    mapBid({ id: "b1", supplier: { id: "u1", name: "Ali" }, request: { id: "r1", equipmentItems: [item] }, t3Declarations: t3 }, false);

  it("carries a read-only «Not: …» row that no tally counts", () => {
    const card = bid({ operatorIncluded: "YES", operatorNationality: "excluded", operatorNationalityCustom: "Sudanese,Syrian" });
    const row = card.negotiableTerms?.find((r) => r.key === "excluded_nationalities");
    expect(row?.state).toBe("grey");
    expect(row?.detail).toEqual({ en: "Not: Sudanese, Syrian", ar: "ليس من: سوداني، سوري" });
    for (const all of [false, true]) {
      expect(bucketBidTerms(card.terms, card.negotiableTerms, { all }).rows.some((r) => r.key === "excluded_nationalities")).toBe(false);
    }
  });

  it("shows the list the bid echoed when it declared one", () => {
    const card = bid({ operatorIncluded: "YES", operatorNationality: "excluded", operatorNationalityCustom: "Sudanese" }, { operator_nationality: "excluded:Sudanese,Somali" });
    expect(card.negotiableTerms?.find((r) => r.key === "excluded_nationalities")?.detail?.en).toBe("Not: Sudanese, Somali");
  });

  it("has no row for any other shape, or without an operator", () => {
    for (const item of [
      { operatorIncluded: "YES", operatorNationality: "restricted", operatorNationalityCustom: "Saudi" },
      { operatorIncluded: "NO", operatorNationality: "excluded", operatorNationalityCustom: "Sudanese" },
    ]) {
      expect(bid(item).negotiableTerms?.some((r) => r.key === "excluded_nationalities")).toBe(false);
    }
  });
});
