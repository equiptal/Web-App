# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both primary, weighted toward the second:

- **The site side** — a site engineer or foreman who needs equipment, raising the
  request on a phone, often at the site itself.
- **The procurement side** — the buyer who compares the bids that come back,
  reads the terms and the documents, negotiates, and awards. Desktop, in an
  office. This is the heavier user of the two, and the surfaces they live in
  (compare, deal room, quotation) are the ones that carry the most weight.

One request may cross both: raised on a phone, awarded on a desktop. No surface
may be mobile-only or desktop-only.

## Product Purpose

A renter describes one equipment need once, that request reaches many suppliers,
and the bids come back onto one screen where they can be compared side by side —
priced, dated, and on the same terms — instead of living in three phone calls and
a memory of what each supplier said.

## Positioning

**Competing bids, side by side.** The mechanism is comparison: one request, many
suppliers, and a single surface that puts their real priced bids next to each
other. A renter phoning three suppliers gets three conversations and no
comparison; the value here is that the comparison exists at all, and that it is
on like-for-like terms.

## Operating Context

- **The request** (`/create`) — what equipment, how many, where, when, on what
  payment and response terms. Multi-unit and multi-type requests are normal, and
  a supplier may bid on some units and not all.
- **The share** — the request goes out to suppliers as a link to a bid form
  (`/bid/[token]`); the supplier does not have to hold an account to answer.
- **The comparison** (`/requests`, the map workspace) — bids grouped by supplier
  and by item, on a map where distance is part of the price. A quote can arrive
  as an uploaded document and be transformed into a comparable bid, which the
  renter verifies field by field before it enters the matrix.
- **The deal room** (`/deal-room/[id]`) — the negotiation: chat, terms, rate
  proposals, documents, and the quotation.
- **The quotation** — the one document the renter keeps, printed or saved.
- **The company** (`/company`) — renters belong to companies; members join,
  leave, and are approved.

## Capabilities and Constraints

- **Stack** — Next.js 15 (App Router), React 19, Tailwind 4, Leaflet for the map,
  Stream Chat for the deal room. Deployed on Amplify.
- **Two backends** — an app backend (accounts, companies, requests, deal rooms,
  notifications) and an agents backend (quote parsing, transform, recommend,
  award learning). The web is a client of both, not the owner of their rules.
- **Public by default** — the site is browsable without a session; auth is an
  in-app modal (phone or email, then OTP), not a page. Held behind
  `NEXT_PUBLIC_PUBLIC_WEB_ENABLED`, which defaults on.
- **Feature flags are real** — `PUBLIC_WEB_ENABLED`, `BID_VERIFY_ENABLED`,
  `EMAIL_FIRST_AUTH_ENABLED`. A surface may exist in two shapes at once, and both
  have to be designed.
- **Languages** — English and Arabic. The preference is persisted per user
  (`PATCH /users/me/language`) so backend-sent content follows it; the UI locale
  is client-side (`src/lib/i18n`).

## Brand Commitments

- **Arabic and RTL are first class.** Every layout must survive mirroring, and
  type must work in both scripts. This is not a later localisation pass.
- **`DESIGN.md` is binding.** Four files hold the design system —
  `src/app/globals.css`, `src/lib/ds.ts`, `src/lib/ds-colors.ts`, and the eslint
  rule that enforces them. Nothing is written at a call site; if a value is
  missing, it is added to those files.
- **Parity with the Moedatech mobile app, where the app already has it.** The app
  is the reference for any flow it already implements — the web does not invent a
  different shape for the same thing, and a defect in the app is reported rather
  than silently improved here. Where the app has nothing, the web is free.

## Evidence on Hand

- `DESIGN.md` — the design system, with the counted evidence for why it exists.
- `docs/` — surface briefs for the map, the deal room, the create flow, and the
  requests workspace; `docs/ui-pins.md` for pinned UI decisions.
- `ui.md` — the product owner's own running notes on what the requests and bids
  surfaces should become. Working notes, not a spec.
- No testimonials, customer names, benchmarks, pricing, or press are on hand.
  Future work must not invent any.

## Product Principles

1. **Comparison is the product.** If a screen makes two bids harder to compare,
   it is wrong, however good it looks.
2. **Both hands, both widths.** Raised on a phone at a site, awarded on a desktop
   in an office. Neither is a fallback.
3. **The app decides what already exists.** Parity first; invention only where
   the app is silent.
4. **Mirroring is not a variant.** Arabic is one of the two ways the app is read,
   so a layout that only works one way round is unfinished.
5. **The four files own the look.** A new value goes into the design system or it
   does not exist.

## Accessibility & Inclusion

Bidirectional text (en/ar) is the established requirement. No standard beyond
that has been set; the site side is used outdoors on a phone, so contrast and
target size matter more than the office context suggests.
