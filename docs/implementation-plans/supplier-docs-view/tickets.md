
# Tickets — Supplier doc view (bid-scoped documents endpoint)

Plan: bid-scoped `GET /agents/bids/{bidId}/documents` (backend-agents) returning the supplier's
company-verification docs + equipment docs as presigned URLs, consumed by the web comparison so
company-doc chips go "green if the doc exists" and open the actual file — no deal room required.

Repos: `Moedatech-App` (branch `marketplace/supplier-docs-view`, app **backend-agents**) + `Web-App`.

## Backend — agents (Moedatech-App / apps/backend-agents)

### T1 — getBidDocuments handler + route
**Scope:** backend-agents
**Description:** New `GET /agents/bids/{bidId}/documents?userId=<renterId>` (service-token authorizer
`agentServiceAuthorizer`). Reads the bid (`prisma.bid.findFirst` incl. `supplier.supplierProfile`,
`equipment`, `request`); optional owner guard (when `userId` given: must equal `bid.supplierId` or
`bid.request.renteeId`). Presigns:
- **companyDocuments** from `supplierProfile`: `crDocKey`→`commercial_register`,
  `vatDocKey`→`vat_certificate`, `nationalAddressDocKey`→`national_address`,
  `sasoHeavyEquipDocKey`→`saso_registration`, `localContentDocKey`→`local_content`, plus each
  `heldCertDocs` entry.
- **equipmentDocuments** from `equipment.documentKeys` (parse JSON; entries `{type,key}` or string).
Returns `{ companyDocuments, equipmentDocuments }` (each `{ type, label, labelAr?, url, fileType }`).
Register the function in `serverless.yml` (Prisma + SharedDeps layers).

**Given/When/Then:**
- Given a bid whose supplier uploaded a CR + national-address doc, When the renter's web calls the
  endpoint, Then `companyDocuments` contains `commercial_register` + `national_address` with presigned `url`s.
- Given a supplier with no SASO doc, Then no `saso_registration` entry is returned (presence = exists).
- Given equipment with a TÜV doc key, Then `equipmentDocuments` contains a `tuv` entry with a presigned url.
- Given `userId` that is neither the bid's supplier nor the request's rentee, Then 403.

## Web — BFF (Web-App)

### T2 — repoint the bid-documents BFF route to the agents endpoint
**Scope:** BFF
**Description:** `src/app/api/me/bids/[id]/documents/route.ts` now calls the agents backend
(`agentsGet('/agents/bids/{id}/documents?userId=...')`, renter id from `sessionUserId()` ??
`agentsTestUserId`) instead of `withAuthedBackend`. Map the response via `mapDealRoomDocuments`.

**Given/When/Then:**
- Given a signed-in renter, When the comparison fetches a bid's docs, Then the route forwards to the
  agents backend with the renter's `userId` and returns `{ companyDocuments, equipmentDocuments }`.
- Given the agents backend errors, Then the route returns a clean JSON error (no 500 leak).

### T3 — (already done) comparison consumes the shape
**Scope:** Web UI / Contract — `fetchBidDocuments` → `DealRoomDocuments`, `mapDoc` tolerant of
`url`|`key`, `companyDocChips` green-if-exists via eager fetch, `openDoc` renders from both groups.
_Implemented in a prior change set; this run only verifies it against the live shape._
