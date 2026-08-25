"use client";

/**
 * The behaviour lifted out of `ItemRow` (MREQ §6).
 *
 * The old per-item editor was 635 lines of markup wrapped around four genuinely load-bearing pieces:
 * taxonomy resolution, the attachment fetch and its pre-selected defaults, the request-wide override
 * fallbacks, and the verdict states. Only the markup was wrong for the canvas. These keep the parts
 * that were right, so the redesign doesn't quietly lose the edge cases they already handle.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import type { SubtypeAttachmentOption } from "@/lib/contract/app";
import {
  fieldSource,
  itemFieldKey,
  resolveRef,
  taxName,
  type EquipmentItem,
  type FieldSource,
  type Party,
  type ProjectDetails,
  type Taxonomy,
} from "@/lib/contract";

export interface TaxonomyOption {
  value: string;
  label: string;
}

/**
 * Category, type and size for one item — the resolved names plus the option list at each level.
 *
 * Levels cascade: a subtype list is meaningless before a category is chosen, and the store's
 * `SET_ITEM_CATEGORY` / `SET_ITEM_SUBCATEGORY` already clear the levels below on a change, so the
 * lists here simply narrow rather than trying to preserve an impossible selection.
 */
export function useItemTaxonomy(item: EquipmentItem, taxonomy: Taxonomy) {
  const { locale } = useLocale();
  return useMemo(() => {
    const { category, subcategory, measurement } = resolveRef(taxonomy, item.ref);
    const categories: TaxonomyOption[] = taxonomy.map((c) => ({ value: c.id, label: taxName(c, locale) }));
    const subtypes: TaxonomyOption[] = (category?.subcategories ?? []).map((s) => ({ value: s.id, label: taxName(s, locale) }));
    const sizes: TaxonomyOption[] = (subcategory?.measurements ?? []).map((m) => ({ value: m.id, label: taxName(m, locale) }));
    /**
     * Every subtype across every category, each carrying the parent it belongs to.
     *
     * The renter picks a TYPE and nothing else: category is derived from whatever they chose, so the
     * list cannot be scoped to a category that has not been picked yet. Choosing from here sets both
     * ids at once.
     */
    const allSubtypes: (TaxonomyOption & { categoryId: string })[] = taxonomy.flatMap((c) =>
      c.subcategories.map((sub) => ({ value: sub.id, label: taxName(sub, locale), categoryId: c.id })),
    );

    return {
      category,
      subcategory,
      measurement,
      categories,
      subtypes,
      allSubtypes,
      sizes,
      /**
       * What the CATEGORY box shows: the taxonomy's `tag` — its canonical grouping, e.g.
       * "Earthmoving" or "Lifting, Cranes & Aerial". Tags live on CATEGORY rows and a subcategory
       * inherits its parent's, so this reads off whichever is resolved. Falls back to the category's
       * own name for a taxonomy row that carries no tag.
       */
      tagName: subcategory?.tag ?? category?.tag ?? taxName(category, locale),
      categoryName: taxName(category, locale),
      subtypeName: taxName(subcategory, locale),
      sizeName: taxName(measurement, locale),
      /**
       * Part 1 parity with `equipment_step.dart` `_isCraneSelected`: the optional free-text work type
       * is a crane-only field, gated on the subtype's ENGLISH name so the check doesn't depend on the
       * viewer's locale.
       */
      isCrane: (subcategory?.name ?? "").toLowerCase().includes("crane"),
    };
  }, [taxonomy, item.ref, locale]);
}

/**
 * The admin-defined attachment list for this item's subtype (MREQ-AC-22).
 *
 * Choose-from-set only — there is no free-text path, and `options` coming back empty means the
 * subtype has none configured, which is the signal to hide the control entirely rather than show an
 * empty one. A failed fetch lands in the same place, which is deliberate: a renter who cannot see
 * the list cannot be asked to choose from it (MREQ-AC-52).
 */
export function useItemAttachments(item: EquipmentItem) {
  const { locale } = useLocale();
  const { actions } = useRfq();
  // Keyed by the app's "subtype" — the SUBCATEGORY id in the 3-level taxonomy, or the CATEGORY id in
  // the canonical 2-level one. Mirrors the mobile `type.key` fallback so pre-selected attachments
  // resolve in both taxonomy shapes.
  const subtypeId = item.ref.subcategoryId || item.ref.categoryId;
  const [options, setOptions] = useState<SubtypeAttachmentOption[]>([]);
  const initedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!subtypeId) {
      setOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/equipment/attachments/${encodeURIComponent(subtypeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SubtypeAttachmentOption[]) => {
        if (!active) return;
        const arr = Array.isArray(list) ? list : [];
        setOptions(arr);
        // Admin "pre-selected" defaults, applied once per subtype and only when nothing is chosen.
        if (initedFor.current !== subtypeId) {
          initedFor.current = subtypeId;
          if ((item.attachmentIds ?? []).length === 0) {
            const pre = arr.filter((a) => a.preSelected).map((a) => a.id);
            if (pre.length) actions.patchItem(item.id, { attachmentIds: pre });
          }
        }
      })
      .catch(() => {
        if (active) setOptions([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtypeId]);

  const selected = item.attachmentIds ?? [];
  return {
    options: options.map((a) => ({ value: a.id, label: locale === "ar" ? a.nameAr || a.name : a.name })),
    selected,
    hasOptions: options.length > 0,
    toggle: (id: string) =>
      actions.patchItem(item.id, {
        attachmentIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
      }),
  };
}

/**
 * The three request-wide-with-per-item-override fields, read exactly as submit reads them
 * (`app-adapters.ts`): the item's own value when it has one, else the shared one.
 *
 * Reading them any other way is how the canvas would end up showing a different answer from the one
 * it sends.
 */
export function useItemOverrides(item: EquipmentItem, project: ProjectDetails) {
  return useMemo(
    () => ({
      delivery: (item.deliveryOverride ?? project.deliveryToSite) as Party | null,
      returnFromSite: (item.returnOverride ?? project.returnFromSite) as Party | null,
      fuelResponsibility: (item.fuelResponsibilityOverride ?? project.fuelResponsibility) as Party | null,
      /** Per-item year, else the request-wide one. `"any"` is a real answer; `null` is no answer. */
      equipmentYear: item.equipmentYear ?? project.advanced.equipmentYear ?? null,
      /** Per-item certificate list, else the request-wide one. */
      safetyCerts: item.safetyCertsOverride ?? project.certificates.safety,
      safetyCertsOther:
        item.safetyCertsOtherText ?? (item.safetyCertsOverride ? "" : project.certificates.safetyOther ?? ""),
    }),
    [item, project],
  );
}

/** The item's display state — matched, still needing a size, or not available at all. */
export function useItemVerdict(item: EquipmentItem) {
  return useMemo(() => {
    const notAvailable = item.verdict === "no-match";
    return {
      notAvailable,
      sourcingRequested: !!item.sourcingRequested,
      /** A no-match item never blocks and never posts, so the canvas shows it without gating on it. */
      blocks: !notAvailable && !item.removed,
    };
  }, [item]);
}

/**
 * Provenance for the canvas (MREQ-AC-57/58/59).
 *
 * Returns a reader so a card can ask about any field without each one re-deriving the agent snapshot
 * and the touched list, and a `touch` writer so answering a control records it in the same call that
 * changes the value.
 */
export function useProvenance(itemId: string | null) {
  const { state, actions } = useRfq();
  const draft = state.draft;
  const agentItem = itemId ? state.agentOrigin?.items.find((i) => i.id === itemId) : undefined;
  const agentProject = state.agentOrigin?.project;

  return useMemo(() => {
    const key = (field: string) => (itemId ? itemFieldKey(itemId, field) : field);
    return {
      key,
      /** Where an ITEM field's current value came from. */
      itemSource: (field: string, current: unknown, agentField?: keyof EquipmentItem, seeded = false): FieldSource =>
        fieldSource({
          current,
          agentOriginal: agentField && agentItem ? agentItem[agentField] : undefined,
          key: key(field),
          draft: draft ?? { touchedFields: [] },
          seeded,
        }),
      /** Where a REQUEST-WIDE field's current value came from. */
      projectSource: (field: string, current: unknown, agentOriginal?: unknown, seeded = false): FieldSource =>
        fieldSource({ current, agentOriginal, key: field, draft: draft ?? { touchedFields: [] }, seeded }),
      agentProject,
      touch: (field: string) => actions.touchField(key(field)),
      touchRaw: (fullKey: string) => actions.touchField(fullKey),
    };
    // `actions` is rebuilt each render but only wraps dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, agentItem, agentProject, draft]);
}
