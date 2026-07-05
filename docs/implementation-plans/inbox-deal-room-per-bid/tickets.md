# Inbox / deal-room-per-bid — tickets (web-only)

Source: `/web:link-backend` alignment (this session). Reuse app-backend; no backend changes. Renter web
only (supplier side is mobile). Builds on the redesigned My Requests (Screen 1).

## T1 — Contract: InboxBid + mapper · Contract
`src/lib/contract/inbox.ts`: lean `InboxBid` type + `mapReceivedBids(raw)` from `GET /marketplace/received-bids`
(per-bid `bidId`, `status`, `dealRoomId`, `dealRoomStatus`, `unreadCount`, `currentPrice`, `agreedUnits`,
`unitsOffered`, `supplierDisplayName`, `supplierLogoUrl`, nested `request`{shortCode,displayId,...} +
`equipment`). Paginated (`meta`).

## T2 — BFF + client: received-bids + unread-count · BFF + Contract
- `src/app/api/me/received-bids/route.ts` (GET → `/marketplace/received-bids`, force rentee, pass `?status=`/page).
- `src/app/api/me/deal-rooms/unread-count/route.ts` (GET → `/api/deal-rooms/unread-count`, map `data.total`).
- `client.ts`: `fetchReceivedBids(filter?)`, `fetchDealRoomUnread()`.

## T3 — DealRoomView += supplierFirstEntry · Contract + Web UI
Add `supplierFirstEntry: boolean` to `DealRoomView` + map in `mapDealRoom`. In `DealRoom.tsx`, when
`supplierFirstEntry` (supplier opened/chatted first), show a "Supplier started this conversation" banner.

## T4 — Unread badge · Web UI
Topbar badge (like the survey dot) from `fetchDealRoomUnread().total` — a count/dot indicating unread
deal-room activity. Mounts in `AppShell` chrome.

## T5 — Inbox list · Web UI
A received-bids inbox surface (component + route, e.g. `/inbox`): list bids across all RFQs grouped by
request, each row showing supplier (name/logo), equipment, `dealRoomStatus`, unread, price; CTA opens/
creates the deal room (`startDealRoom`) or "reply" when supplier-initiated (`OPEN` + unread). **Merge in
shared-link (off-platform) bids** so the inbox is complete. Sidebar entry.

Backend-dependency tickets: none.
