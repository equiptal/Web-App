# Multi-item requests: owner decisions (2026-10-11)

Release PR #548 alignment item 1.6 (`Moedatech-App/docs/handoffs/web-alignment-release-548.md`).
Reviewed on the prototype page https://claude.ai/artifact/8NofftXUcaA3J64QyGkzJf against the app's
`docs/handoffs/web-multi-item-reference.html`. Each entry is the owner's pick; rejected options are
named so they are not re-proposed.

| # | Part | Decision | Rejected |
|---|---|---|---|
| 0 | Selected circle | V1, the app's ring (`offers_filter_bar.dart`): selected 2.5 px navy ring + navy badge; others 1.5 px grey ring, grey badge, 55%. Reverses the 2026-08-27 and 2026-08-31 no-outline rulings for the rail. BUILT. | V2 ring on the selected only; V3 V1 + 8% lift |
| 1 | Combined image | Keep the CIRCLE. Lay the machines out by the app's rows (`equipment_collage.dart`: 2 side by side, 2 + 1, 2 × 2), shrunk so every tile sits fully inside the round edge (R1). In the request circles (52 px) and the request card (32 px). | Rounded square; slices of the circle (R2); small round machines (R3); today's overlap + fade |
| 2 | Request card | C2. Up to 3 machine names as PLAIN TEXT (never pill-shaped, the card is the one thing that opens), each with a fixed max width and cut only at its own end, «×N» kept with its name, sizes left to the full list; past 3, «+N more» in orange. | C1 first name + «+N more»; C3 two lines; today's one cut sentence |
| 3 | Items row | T3. Today's text tabs. The «Items» label carries the request's combined picture; every tab its own machine's picture before the name (no icons). Past 3 machines, an orange «+N more» pill listing the rest with picture, units and bid count. The selected machine is always among the 3 shown. | T1 photo tabs with counts; T2 all machines, wrapping |
| 4 | Switching views | P3. A «Suppliers» tile at the END of the request circles row. In suppliers mode the row shows supplier circles and a «Requests» tile in the same spot switches back. The request header is untouched in requests mode. | P1 switch at the start; P2 page tabs; P4 the app's strip |
| 5 | Suppliers mode | The EXISTING bid cards, same style, same size, in the same horizontal scrolling row; the only change is the card's top line names the MACHINE instead of the supplier. A supplier card replaces the request card. Bids on one request are grouped in a light-blue panel headed by that request. No Items row, no Cards/Compare in this mode. | Panels of smaller cards; one column per machine |
| 6 | Map and chat | M1. A machine bar under the back header, one chip per machine of the request with THIS supplier's price; a machine he did not bid on is dashed and inert. One press moves the panel, the map, the price footer and the chat together; the chat loses its own machine tabs. No «covers N of M» total. In the chat header, under the supplier's name, the machine being negotiated, shown only on a multi-item request where he has more than one bid. «Other bids» in the back header stays as it is (other suppliers on this machine). | M2 chat tabs drive the map; M3 separate with a notice; M4 list in the side panel; X2/X3 |

⚠️ Decision 6 REVERSES spec RM3-AC-49 («switching tabs does not move the map»), by the owner's
choice: the chat and the map showing different machines made no sense to him.

All six BUILT on `main` on 2026-10-11, not committed; see the matching `docs/CHANGELOG.md` entry.

2026-10-12, owner's UAT on staging: in suppliers mode a request panel's header is ONE line, «One request · N bids ›» (no request card); each card's second line is the city and units as in requests mode; the bids stay tickable with «Download quotation» on the right beside «All chats»; the «Requests» tile is a fixed picture of three small machine circles.
