# Supplier directory: ranking the first rows (backend)

**Raised:** 2026-09-03, by the owner — *"it will show the first 5 with scrolling across all our
suppliers; the first 5 are verified, have a store, and have the largest number of equipment."*

**Endpoint:** `GET /agents/suppliers?q=&page=&limit=` (backend S1), reached from the web through
`/api/supplier-directory`, read by `searchSupplierDirectory` in `src/lib/api/client.ts` and drawn by
`AddFromMoedatechDialog`.

## What it answers today

Probed against staging (`kge3xspt36`, page 1, limit 20) on 2026-09-03:

```json
{ "data": [ { "id": 638, "name": "…", "company_name": null, "city": "Riyadh",
              "is_verified": false, "has_store": false } ],
  "meta": { "page": 1, "limit": 20, "total": 1492, "totalPages": 75 } }
```

Ordered alphabetically by `name`. 1,492 accounts, 75 pages.

## What the web can and cannot do with that

Fixed on the web the same day: the mapper read only `firstName`/`lastName` and `company_name`, so
eighteen of every twenty rows were dropped as nameless and the dialog showed **2 rows out of 1,492**.
It now reads `name`, and a full page arrives.

The ordering cannot be fixed here, for two separate reasons:

1. **There is no equipment count on the row.** Nothing in the payload says how many machines a
   supplier lists, so there is nothing to sort on.
2. **A page is not a directory.** The client holds the twenty rows of the page it asked for. Sorting
   those puts the best of *those twenty* first; a verified firm with fifty machines sitting on page
   60 stays on page 60. A "top five" is a statement about all 1,492 rows, and only the query that
   reads them can make it.

The client currently floats verified rows, then rows with a shopfront, within the page in hand. That
is a local tidy, deliberately not presented to the renter as a recommendation.

## What the backend needs to add

1. **`equipment_count`** on each row: how many equipment listings the supplier has.
2. **A default ordering** for the directory, applied before pagination:
   `is_verified DESC, has_store DESC, equipment_count DESC, name ASC`.
   Alphabetical order is the one thing nobody is looking for here.
3. Keep `q`, `page` and `limit` exactly as they are. The dialog pages through the same endpoint after
   the first screen, so the ranking must hold across pages rather than being a separate "featured"
   call — otherwise row 6 on page 1 and row 1 on page 2 are the same firm.

Optional, and only if the ordering is wanted in more than one place: `?sort=featured|name`, with
`featured` as the default for this dialog.

## Why it matters

The renter opens this dialog to find firms he can send requests to. The first screen is the only one
most people read. Alphabetically, that screen is whoever happens to start with "A" — today, seven
individual accounts with no company name, no shopfront and no machines listed.
