# Renter Projects — UAT

Work top to bottom; each section leaves the state the next one needs. Sign in as a renter with no
projects to start.

**Where things live:** projects are a block on the **dashboard**, under *My Requests*. There is no
`/projects` page and no nav tab.

---

## A · Empty states

| # | Do | Expect |
|---|---|---|
| A1 | Sign out, open the dashboard | **No projects block at all.** Not an empty one — nothing. |
| A2 | Sign in with no projects yet | One dashed row: *Your projects* · *No projects yet…* · **New project** |
| A3 | Open `/create` | Intake looks exactly as it always has — **no chip row** |

---

## B · Create a project

| # | Do | Expect |
|---|---|---|
| B1 | Dashboard → **New project** | Form opens: *Where* (map first), then *When & terms* |
| B2 | Save with a blank address | **Save is disabled.** Address is the one required field |
| B3 | Drop a pin on the map | The address field fills itself from the pin |
| B4 | Leave the title blank | Hint reads *"Leave it blank and we call it 'Qiddiya Zone 4'"* |
| B5 | Fill basis · start · end · payment terms, Save | Modal: **"'Qiddiya Zone 4' is ready"** with two choices and *Not now* |
| B6 | Count the fields on the form | **Six, no more.** No hours/day, no budget, no payment method, no maintenance, no SLA, no supplier filters, no bid window, no terrain, no days-per-week |
| B7 | *Not now* | Dashboard now shows the board: rail on the left, the site selected |

---

## C · A request, with the site

| # | Do | Expect |
|---|---|---|
| C1 | `/create` — look under the textarea | Chip row **inside the card**, showing *Qiddiya Zone 4* |
| C2 | Click the chip | Chips are **replaced in place** by pills — nothing jumps |
| C3 | Read the pills | site · basis · dates · *+ more* · and the caption *"You type the machine…"* |
| C4 | Type `2 forklifts`, Continue | **Near-instant.** No processing screen. Canvas opens directly |
| C5 | On the canvas, check the dates | Filled, marked with a pin and **"From your project"** — not "AI selected". **Hours/day is NOT filled** — it stays in *More details* |
| C6 | Change the end date on a pill, then Continue | Canvas shows the new date, marked **"changed by you"**, not *from your project* |
| C7 | Reopen the project on the dashboard | Still the original end date. The pill edit never touched the site |
| C8 | `/create`, type `2 forklifts for two weeks` | Slower than C4 (one call, no poll) but still no processing screen |
| C9 | Type a full paragraph | Today's behaviour: processing screen after 8 s, full parse |
| C10 | Deselect the site with the ✕ | Every prefill disappears at once — no half state |

---

## D · Work order

| # | Do | Expect |
|---|---|---|
| D1 | Row menu on the board → *Add a work order*, or from B5's modal | Form: **equipment first**, supplier second |
| D2 | Category dropdown → pick one | Subtype enables. Size stays disabled until subtype is picked |
| D3 | Change the category | Subtype and size **clear** |
| D4 | Tick *Not in our catalogue* | Dropdowns swap for name + size. Save is allowed |
| D5 | Leave both empty and Save | **Save disabled** — a machine needs a name or a full match |
| D6 | Set dates different from the site | Warning naming the site's dates, saying both are kept |
| D7 | Add a supplier line, Save | Work order appears on the chart **already awarded** — never *awaiting award* |
| D8 | Leave the supplier blank, Save | Row appears with **no award** — that's your own fleet |
| D9 | Edit it, rename a machine, Save | Its award, marks and documents **all survive** |

---

## E · Awarding, marks, papers

| # | Do | Expect |
|---|---|---|
| E1 | An un-awarded request row → ⋮ | *Award* and *Review the bids*. **No marks** — nothing is supplied yet |
| E2 | *Award* → supplier, units 2 of 3, rate | Counter reads *"2 of 3 assigned"* |
| E3 | *Split across another supplier* → 2 more units | **Save disabled**, *"1 too many"* |
| E4 | Fix to 1 unit, Save | **Two rows** on the chart, one per supplier |
| E5 | ⋮ on an awarded row | Marks, *Attach a document*, *Open the request*, *Our quotation*, *Open the deal room*, *Change the award* |
| E6 | *Mark mobilized* | A **green pin** on the bar's top edge, today's date in the tooltip |
| E7 | Open ⋮ again | Now reads *Undo mobilized* — same entry, not a second one |
| E8 | *Attach a document* → pick a PO | Listed by name and kind. Orange marker in the row's corner |
| E9 | On a marketplace row, read the dialog | Says **our** quotation is generated, downloaded from the menu; this one is the supplier's |
| E10 | Remove a document | Button reads **"Remove PO-88213.pdf"** — the file's own name |
| E11 | ⋮ on a **work order** row | **No** *Open the request*, *Our quotation* or *Open the deal room* |

---

## F · Edit the project, and what it reaches

| # | Do | Expect |
|---|---|---|
| F1 | Board → pencil beside the title → change the end date | List appears: *What is already on this site* |
| F2 | Read the rows | *no bids — free to edit* · *has bids — uses its one edit* · *edit already used* · *closed* · *work order — always editable* |
| F3 | Check what's pre-ticked | **Only** the free ones and work orders. A bid-bearing request is **tickable but not ticked** |
| F4 | Untick everything → *Project only* | The site changes. **Nothing else does** |
| F5 | Tick one → footer | A third button appears: *Save and apply to 1* |
| F6 | Try to tick an *edit already used* row | Disabled |

---

## G · Filing, moving, Unassigned

| # | Do | Expect |
|---|---|---|
| G1 | Post a request **without** picking a site | Confirmation shows the offer |
| G2 | If a site exists at that address | *"You already have a project at X"* — **no option to create a second** |
| G3 | If none does | Two labelled lists: *saved as the project* vs *stays with this request* |
| G4 | *Not now*, then post another projectless request | The offer **does not come back** — dismissal is permanent |
| G5 | Dashboard rail | **Unassigned** appears with a count |
| G6 | Unassigned row → ⋮ | Reads *File in a project*, **not** *Move to another project* |
| G7 | Click it | Sites at that request's own address shown **first, as cards** — the rest in a select below |
| G8 | Read the dialog | Says filing changes nothing on the request |
| G9 | File it | It leaves Unassigned; the view switches to that site |
| G10 | On a filed row → ⋮ → *Remove from the project* | Warns that **moving drops the awards recorded here** |

---

## H · Delete

| # | Do | Expect |
|---|---|---|
| H1 | Open a project **with** rows → the link below the form | Reads *This project is in use* |
| H2 | Click it | Lists what's filed, then three options — *finished*, *wrong place*, *made by mistake*. **No delete button anywhere** |
| H3 | Empty the project, reopen | Link now reads *Delete project* |
| H4 | Click → confirm | Gone |

---

## I · Conflicts

| # | Do | Expect |
|---|---|---|
| I1 | A group with its own dates → the **own dates** chip on its header | It's a **button** |
| I2 | Click it | Only the fields that **differ**, in two columns |
| I3 | Read the buttons | *Keep it different* first; *Match the project* second |
| I4 | On a bid-bearing request | Warning that matching spends its one remaining edit |
| I5 | On an edit-spent request | *Match the project* **disabled, with the reason shown** |
| I6 | On a work order | Never a location conflict — only dates |

---

## J · Language, and the chart

| # | Do | Expect |
|---|---|---|
| J1 | Switch to Arabic | Every string above in Arabic. Rail, pills and chart mirror |
| J2 | Chart bars in Arabic | Bars and pins run right-to-left; nothing overlaps |
| J3 | A machine with no award | One **hatched** row, *awaiting award*, no marks, no papers |
| J4 | A work order running past the site's end | Its bar is **visible**, not clipped at the right edge |
| J5 | A machine mobilized before the period opened | The bar **stretches back** to meet its pin |
| J6 | Count the meta bar | Requests and work orders shown **separately, never summed** |

---

## Known, not bugs

- **`2 excavators 20t` is not instant.** The catalogue has five excavator subtypes, so the bare word
  matches none and it falls to the model. `2 crawler excavators 20t` is instant.
- **Arabic never takes the instant path.** Refused until the Arabic index is proven at the same
  strictness.
- **Per-machine terms on the work order form is a placeholder** — it depends on the deferred
  operator rule.
- **An award has no dates of its own.** Its bar comes from the request or work order, widened by the
  marks. A hire renegotiated past a closed request's end shows the original end until it is
  demobilized.
