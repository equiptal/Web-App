# Agent changes — matching a HIDDEN node, and saying so

**For:** whoever writes the tickets in `Normalization-Agent` (Mansour).
**Depends on:** `app-backend-changes.md` **B2** (which resolves visibility at read — no migration). Do not ship this first — see the warning at the end.

---

## What the agent does today

`getTaxonomyNodes` calls `GET /agents/taxonomy` with no `includeHidden`
(`src/external/agents-backend.ts:139`), and that endpoint excludes hidden nodes by default
(`getTaxonomy.ts:52-58`). So Mansour has never seen one, and a renter who types a machine that exists
in the catalogue **as hidden** gets `no-match` — case 2, the off-catalogue card.

That is why case 3 does not exist yet anywhere in the renter chain: not in the agent that matches, not
in the dropdown that picks, not in the card that would name it.

---

## What it must do

### 1 · See hidden nodes

Fetch with `includeHidden=true`. The endpoint already supports the flag and already returns
`visibility` on every node.

### 2 · Say which match is hidden

The `/rfq/jobs` and `/rfq/quick` line item must carry enough for the web to tell case 1 from case 3
without guessing. Cheapest shape that works:

```jsonc
{ "category_id": "…", "subtype_id": "…", "capacity_id": "…",
  "subtype_hidden": true,          // ← the new signal
  "category": "Lighting", "subtype": "Light tower", "capacity": "9 m" }
```

⚠️ **The NAMES matter as much as the flag.** The web's own taxonomy excludes hidden nodes, so it
cannot resolve a hidden id to a word — it would hold an id it cannot draw. It already keeps the
agent's names for display (`agentNames` on the draft item, used for «MATCHED TO»), so a hidden match
is renderable the moment the agent returns the same `category` / `subtype` / `capacity` strings it
returns for any other match. Nothing new is needed there beyond not omitting them.

### 3 · Leave everything else alone

`input_equipment` is already the machine name only, certificates stripped (2026-09-06). That string is
what seeds the renter's EQUIPMENT NAME box, so it stays exactly as it is.

---

## 🔴 Order — this must NOT ship before the backend's B2

`isUndefinedEquipment` is `!subtypeId` until B2 lands. So a hidden match that reaches a request today
reads as an **ordinary** line:

- `createRequest` dispatches it,
- `broadcastDispatchService` selects suppliers by `subtypeId` **with no visibility filter**,
- every supplier listing under that hidden node is notified.

Which is the precise outcome a hidden node exists to prevent. One repo's change, another repo's
damage — so B2 first, this second.

(Today the create endpoint refuses a hidden node outright, so nothing is broken while both are
pending. The danger begins the moment the agent can match one and the create stops refusing.)

---

## Test worth asking for

- A phrase that matches only a hidden node returns that node's ids, its names, and `subtype_hidden:
  true` — not `no-match`.
- A phrase matching a public node is unchanged in every field, `subtype_hidden` absent or false.
- `input_equipment` still carries the machine alone, with no certificate words.
