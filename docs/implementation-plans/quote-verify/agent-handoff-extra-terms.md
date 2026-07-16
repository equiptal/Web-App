# Agent handoff — `/bids/transform` must emit `extra_terms`

**Context:** the web quote→verify→compare flow is live on staging. The renter verify screen renders the
transformed quote in our bid-form template, and the comparison table has a new **"Notes"** row (last row)
that shows each bid's free text. For app + shared-link bids that's their existing `note`; for an **uploaded
quote** it's the quote's notes **plus `extra_terms`**.

**The ask (agent / Mansour):** so that *nothing from the quote is ignored*, `/bids/transform` must emit an
**`extra_terms`** array on the returned `NormalizedBid` — every field / clause / fee / condition the quote
contains that is **not** one of the standard fields or the 9 canonical terms:

```jsonc
// POST /bids/transform → data.bid (NormalizedBid), addition:
"extra_terms": [
  { "label": "Warranty",        "value": "90 days" },
  { "label": "Payment",         "value": "Cash on delivery" },
  { "label": "Mobilization SLA","value": "within 3 days" }
]
```

- `label` + `value` are free text, in the quote's language (the web shows them verbatim; the renter can
  edit/clear each in the verify screen's "Additional notes & terms" section).
- Emit `[]` (or omit) when the quote has no extra content.
- Canonical terms (the 9 `term_matches` keys) and standard fields (price, mob/demob, CR/VAT/address,
  units, valid_until, notes, equipment year/fuel/condition…) stay where they are — `extra_terms` is only
  for what would otherwise be **dropped**.

**Web side is ready** (no further web change needed for this to light up):
- `NormalizedBid.extra_terms?: { label; value }[]` is in the contract (`src/lib/contract/agent-bids.ts`).
- `bidQuoteToFormDraft` surfaces them in the verify screen (editable); the renter's edits round-trip via
  `bidFormDraftToNormalized` back into `extra_terms` on commit.
- `normalizedBidToBidCard` folds `notes` + `extra_terms` into the bid's `note`, which the comparison
  **Notes row** renders. So the moment the agent populates `extra_terms`, uploaded-quote Notes cells fill.

**Out of scope for now (agreed):** extracting `extra_terms` from app-bid / shared-link **notes** (the
"normalized key across all sources → aligned extra rows" model). Current model is the single Notes row +
each source's own free text. Revisit if we want extras compared column-by-column.
