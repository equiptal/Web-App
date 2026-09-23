# 007 Renter Projects — UAT, second pass

Everything changed on **2026-08-31**, in the order a renter meets it: the intake chips first, then the
work order, then the board.

Each case says what to do and what should happen. The marker says whether you can run it **now**:

| | |
|---|---|
| ✅ | live on staging — run it |
| ⏳ | waiting on a **web** deploy (last two commits) |
| ⛔ | waiting on the **backend** deploy (5 files uncommitted in `Moedatech-App`) |

---

## A · The intake — chips, pills, and the machine as text

**A1 ✅ The pills are inside the box.**
`/create`, tap a site chip. The site's values appear **inside the same bordered box as the textarea**,
above the line you type on — one border around both, a rule between them. Not a separate strip below.

**A2 ✅ The chips stay below.**
Before you pick a site, the chip row sits under the box. It is a picker, not a value.

**A3 ✅ Boxed, not capsule.**
The pills have the same square-ish corners as the fields in the project dialog — not fully rounded.

**A4 ✅ Extendable is a segmented toggle.**
`EXTENDABLE [ Yes | No ]` — both answers visible, the chosen one filled. One press to change, no menu.
Keyboard: tab to it once, then arrow keys move between the two.

**A5 ✅ The template list is per MACHINE.**
Open *Start from*. A site with a crane and a generator on ONE work order shows **two** entries, not
one. Each reads `machine · kind ref`.

**A6 ✅ Picking one copies its own terms. — VERIFIED 2026-08-31, after two fixes.**
Pick the generator. The terms that appear are the **generator's**, not the crane's.

It failed twice on the way here, and both failures were silent. First the group ids were lost, so the
lookup matched nothing and **no terms were ever copied** — the entire point of a template, and
nothing said so. Fixing that exposed a double conversion that answered a **blank** terms object, so
the pills rendered empty under a label reading *terms copied*, with OPERATOR showing *Yes* because
the pill treats a null as yes. Both fixed (`74c9219`, `6511153`); the values now come back as stored:
generator = delivery **Me**, year **2022**, operator **No**, no certificates.

**A7 ✅ The machine arrives as TEXT. — VERIFIED 2026-08-31.** The box read `2 × Generator 250 kVA`.
Picking a template writes `2 × Crawler Excavator 30 ton` into the **typing area**, not as a chip. You
can edit or delete the words. It is **appended** — anything you already typed stays.

**A8 ✅ The copied terms are editable, as pills.**
`DELIVERY [Me|Supplier]`, `RETURN`, `FUEL`, `OPERATOR` — segmented. `CERTIFICATES` reports only (its
set lives in *More details*). Changing one marks it as yours and it stops reading *from your project*.

**A9 ✅ Changing a term changes this request only.**
Change *Delivery* to `Me`. Reopen the work order it came from — its own delivery is unchanged.

**A10 ✅ The location is filled and confirmed.**
The site's address is present, marked **From your project**, and already confirmed — you are not asked
to confirm a pin you dropped when you made the site.

**A11 ✅ Location is the one pill you cannot edit.**
No control on it. A work order under a site has no location of its own — that is the padlock.

**A12 ✅ A short line still parses with no network call.**
Type `2 forklifts` and continue. No `/api/agent/*` request fires (Tier 0, in the browser).

**A13 ✅ A longer line is faster than it was.**
`excavators 30 ton with return and delivery on supplier` → about **2 seconds**, was 5. Same answer:
Crawler Excavator, 30 ton, and delivery + return on the supplier.

---

## B · The work order form

**B1 ✅ It asks for a name first.**
*Add work order* → the first field is **Name this order**. It used to be missing entirely, and every
order saved nameless.

**B2 ✅ Order: title → period → machines → suppliers.**

**B3 ✅ Machine 1's terms are open to fill; each machine's own block is collapsed.**
`▸ Terms for this order` on each machine card.

**B4 ✅ Machine 2 inherits machine 1's terms.**
Fill machine 1's terms. Add a machine. Open its terms — **already answered**, and it says *same as the
first machine*.

**B5 ✅ Editing machine 2 does not touch machine 1.**
Change machine 2's delivery. Machine 1 keeps its own. The badge on machine 2 reads **1 different**.

**B6 ✅ Operator is last, behind a toggle.**
Turn it off and its four sub-questions (nationality, food, accommodation, certificates) disappear.

**B7 ✅ Night shift and fuel are gone.**

**B8 ✅ Units, not "how many".**
Both counts — the machine's and each supplier line's — say **Units**.

**B9 ✅ The supplier row has headings and three money boxes.**
`SUPPLIER · UNITS · RATE / MONTHLY · MOBILIZATION · DEMOBILIZATION`, with a per-line and per-machine
total of `(rate + mob + demob) × units`.

**B10 ✅ Units cannot outrun the machine.**
Machine quantity 3, promise 2 + 2 → *"4 of 3 assigned — 1 too many"* and **Save is held**.

**B11 ✅ A work order with suppliers saves.**
This was the `422` that lost the whole order. Fill a supplier and save → it appears on the chart.

**B12 ✅ Reopening does not wipe the terms. — VERIFIED 2026-08-31. No backend deploy needed.**
Save an order with terms, reopen it from ⋮ → *Edit the work order*. The terms come back **as you left
them**.

This was marked as blocked on the backend and was not. `getChart` sends no terms, but the
**work-orders** endpoint does, and that is what the edit path reads — proven by a live round trip:
two machines on one order given deliberately different terms, written and read back distinctly.

On staging the form reopened with delivery **Supplier**, return **Me**, year **2019**, **TÜV** only,
operator on, nationality **Restricted / "Saudi only"**, food and transport **Me** — every value as
written. Machine 2's badge read **6 different**, counting the six it genuinely differs by.

---

## C · The board and the chart

**C1 ✅ The header states the site, right-aligned actions, pen only.**
`PROJECT · LOCATION 🔒 · START · END · FILED HERE`, then `[✏] [🔧 Add work order] [+ Add request]`.

**C2 ✅ The address is an underlined link.**
Clicking it opens Google Maps on the pin you dropped.

**C3 ⛔ START and END show the real span, with a note.**
A work order running past the site's end → END shows the **later** date and a second line reads *site
says 2026-10-07* in amber. Nothing is written; the site keeps its own dates. Needs the terms deploy to
be fully visible with a work order on the site.

**C4 ✅ One request button.**
*Add request* opens a picker: **New request** orange at the top, then *or one you already posted* with
your unfiled requests under it.

**C5 ✅ A request from elsewhere is flagged.**
One posted for a different city shows *Posted for somewhere else* in amber, on the row.

**C6 ✅ Picking it asks before filing.**
*This request is for Riyadh, not Qiddiya* → **File it here anyway** · **Change the request's
location** · Cancel. A matching request files on one click with no question.

**C7 ✅ The edit option respects the one-edit rule.**
On a request with bids and its edit spent, the panel says *its location can no longer be changed*
instead of offering a button that would refuse you.

**C8 ✅ Unassigned is gone.**
No `Unassigned · 23` entry in the site rail.

**C9 ✅ Rows can be renamed.**
✏ beside a row on the chart. A work order renames now.

**C10 ⛔ A request can be renamed.** Same pen. Confirmed still blocked 2026-08-31: `labels` is
refused the same way as `marks` — `422 Unrecognized key(s) in object: 'labels'`.

**C11 ✅ The own-dates warning only appears on a real difference.**
A request whose dates match its site shows **no** *own dates* chip. It used to show on every request
and open a comparison with no rows in it.

**C12 ✅ An unawarded row reads *pending*, not *not awarded yet*.**

**C13 ⛔ The machine row is wider and shows its terms.** Confirmed still blocked 2026-08-31: the
chart payload carries no `terms` at item level. The work-orders endpoint has them; `getChart` is the
one that does not, and it is the one the chart reads.
`TÜV + Aramco · with operator · year 2019` under the machine name, and only what is set. Work orders
only; requests keep their answers in other columns and show one line.

---

## D · Award, arrive, leave

**D1 ✅ Awarding works.**
⋮ on a machine → *Award* → supplier, units, rate, mobilization, demobilization → the row appears
awarded. **Verified end to end on staging, 2026-08-31.**

**D2 ✅ Award is offered on a work-order machine. — VERIFIED 2026-08-31, end to end.**
Make an order and leave the supplier section **blank**. ⋮ on the machine → *Award* is there. It used
to be marketplace-only, which left a blank order with no way to name a supplier afterwards.

**D3 ✅ Over-awarding is refused.**
Award 2 of 2, then try 1 more → `UNITS_EXCEED_QUANTITY`, and the dialog says *1 too many*.

**D4 ✅ Mobilize and demobilize. — RE-VERIFIED 2026-08-31 through the UI.**
⋮ on an **awarded** row → *Mark mobilized* / *Mark demobilized*. Green pin on the bar, date in the
tooltip.

**D5 ✅ Undo clears only the one you undid. — RE-VERIFIED 2026-08-31 through the UI.**
Mark both, then *Undo mobilized* → mobilize clears, **demobilize stays**. Verified on staging.

**D6 ◑ Marks need no award, on either kind.** The menu half is **done and verified**: ⋮ on a row
nobody has awarded offers *Mark mobilized* and *Mark demobilized*, with no sequence to follow. The
write half is **still blocked** — `PATCH /api/projects/:id` answers `422 Unrecognized key(s) in
object: 'marks'`, confirmed against the deployed backend on 2026-08-31.

**D7 ✅ Papers hang on an award.**
*Attach a document* appears only on an awarded row — there is no id to file one under before that.
PDF, JPG, PNG or WEBP only; Word and Excel are not offered, because storage refuses them.

---

## E · Editing a site, and removing rows

**E1 ✅ Editing a site is editing the site.**
✏ on the header → six fields and one **Save**. No list of requests and work orders to review.

**E2 ✅ It asks only about a real disagreement.**
Change the end date so something under it now runs past → *"2 things here keep different dates"*, with
**Keep their dates** or **Change N too**.

**E3 ✅ A row that cannot change is told, not offered.**
A closed request, or one whose single edit is spent, is listed with the reason and no control.

**E4 ✅ Save says Save.**
On a site with nothing filed under it the button reads **Save**, not *Project only*.

**E5 ✅ Delete is in the row, in red.**
`🗑 Delete project` beside Cancel and Save, not a grey link below them.

**E6 ✅ The delete confirmation names the creator.**
*Created by Yara.* On a shared board, deleting your own draft and a colleague's are the same two
clicks otherwise.

**E7 ✅ One red door for removing a row.**
⋮ → last entry, red. A work order no longer carries both *Remove from the project* and *Delete*.

**E8 ⏳ Moving carries the awards.**
The dialog reads *Its awards and papers move with it — nothing is lost*, with no red warning. Awaiting
the web deploy for the copy and the backend deploy for the behaviour.

**E9 ⛔ Moving a work order.**
Needs the backend field; `updateWorkOrder` took no `projectId`.

**E10 ✅ Unfiling a request still scrubs its awards, and says so.**
There is no destination for them to follow.

---

---

## Found while running this pass — fixed, and worth a case of their own

**F1 ✅ The row menu's last two entries were invisible.**
⋮ on an awarded work-order machine, six entries. *Change the award* and the red *Remove from the
project* were rendered, focusable by keyboard, and **below the chart's scroll box** — 725px and 756px
against a container ending at 702px. The red remove is the entry that was asked for by name, so it
was built and then hidden. Flipping upward could not fix it: a 207px list fits on neither side of a
box leaving ~155px below the row and ~81px above. The menu is now a fixed layer that escapes the
scroll box entirely (`1a51baf`). Re-check: open ⋮ on the **last** row of a full chart and count six.

**F2 ✅ The award dialog could not record haulage money.**
It asked for supplier, units, rate, basis. The work order's supplier row asks for rate,
**mobilization** and **demobilization** with a line total. Same stored record, two entry paths, one
lossy — and lossy exactly where it matters, because the chart's Award is the only path for a machine
whose supplier section was left blank. Both boxes and the line total are there now (`d615634`), using
the work order's own arithmetic so the two cannot drift. The deployed backend already stores them:
`201`, read back `mobAmt=1200 demobAmt=800`.

**F3 — three money defects, outside this feature.** The golden pricing set is red on three
assertions, all predating renter-projects: the comparison prorates over calendar days (93,000 against
the 81,000 every other surface shows, and it feeds `recommendBids`); `vatLines` derives VAT from a
stored gross against ruling R-01b; cycle totals round each component then sum. See **FINDINGS.md ·
Run 2026-08-31 · pricing golden set**. Not fixed — pricing moves every surface's numbers and the
RMAP-AC-216 retirement rides with it, which is the owner's call.

**F4 ✅ The marks are events, not a new period. — VERIFIED LIVE 2026-08-31.**
Mark a machine arrived on a date outside its period. The bar keeps printing the **agreed** dates and
the diamond sits at the mark's own date, outside the bar. Before this, marking arrival on the 31st
made a work order starting on the 1st read *2026-08-31 → 2026-12-31* — a period nobody agreed to.
Checked on staging with a mark on each row: both bars read `2026-09-01 → 2026-12-31`.

**F5 ✅ Diamonds, two colours, and a legend. — VERIFIED LIVE.**
Green **Arrived**, orange **Left**, sharp-cornered diamonds rather than dots, and one line under the
rows: *Arrived · Left · what happened — the bar is what was agreed*. The legend swatches are the
marks themselves at the same size, so there is nothing to translate.

**F6 ✅ Attach a document is always offered.** ⏮ on a row nobody has awarded → *Attach a document*
sits with the two marks. An unawarded row files against the **site**, which the dialog states in one
line. Verified end to end against the deployed backend: presign → PUT → `POST /awards/-/documents`
→ `201`, and the paper appears in the chart's own documents. No backend deploy needed for this.

**F7 ✅ A paper shows its name, and ⛔ opens.**
The chart row and the dialog both show one document icon plus the **filename**, and both are
pressable. Pressing **needs the backend deploy** — there was no download endpoint at all, anywhere:
the chart publishes `{ id, kind, filename }` and never the S3 key, so every attached paper was
write-only. `GET /agents/projects/{id}/documents/{docId}/url` is written and uncommitted. Until it
lands, a press says *Could not open that paper. Try again.* rather than doing nothing — verified.

**F8 ✅ A new paper appears in the open dialog at once.**
Attach one; it is in the list without closing the dialog. It used to appear only on reopen, because
the code read React state that the same tick had not updated yet.

**F9 ✅ Mobilization and demobilization on the award. — VERIFIED LIVE.**
⏮ → *Award* now reads `SUPPLIER · UNITS · RATE · MOBILIZATION · DEMOBILIZATION · PER`, with the
line's total, using the work order's own arithmetic. The deployed backend stores both.

## What is blocked, and on what

**Backend — 5 files uncommitted in `Moedatech-App/apps/backend-agents`:**

| file | unblocks |
|---|---|
| `validators/project.schema.ts` | C10, D6 (`labels`, `marks`). **Not** the haulage amounts — those are already deployed and verified. |
| `handlers/agents/projects/updateProject.ts` | C10, D6 (the merge patches) |
| `handlers/agents/projects/documents/getDocumentUrl.ts` **(new)** | F7 — opening a paper. Nothing else in the platform presigns a project document on read. |
| `handlers/agents/projects/getChart.ts` | C3, C13 (terms on the row). **Not B12** — the edit path reads the work-orders endpoint, which already carries terms. |
| `handlers/agents/work-orders/updateWorkOrder.ts` | E9 (the move) |
| `services/project-awards.service.ts` | E8 (`moveAwardsTo`) |

Typecheck clean, 0 backend test failures.

**Web — deployed.** `9bb7f08` and `42f16cb` are live (D2 verified end to end; the move copy is in the
served chunk). Since then: `74c9219`, `1a51baf`, `d615634`, `6511153`.
