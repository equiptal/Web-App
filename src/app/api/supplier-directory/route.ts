import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier-directory?q=&page=&limit= — every supplier with a Moedatech account.
 *
 * SUP-T14. **Not `/api/stores`.** The picker read the shopfront list because this was thought not to
 * exist, and that quietly excluded every supplier who has an account but no store — the renter then
 * types them in by hand, which makes a second row for a company that already has one, and every match
 * after that runs against the wrong record.
 *
 * `/agents/suppliers` (backend S1) answers `id`, `firstName`, `lastName`, `companyName`, paginated and
 * searchable, over `users.is_supplier` — so a firm with no shopfront is listed like any other.
 *
 * ⚠️ It carries no city and no verification mark. The picker therefore shows neither, rather than
 * showing them for the subset that happens to have a store: half a column is worse than none.
 */
export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of ["q", "page", "limit"]) {
    const v = inUrl.searchParams.get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  if (useRealApp) return relayAsRenter(`/suppliers${suffix}`);
  return NextResponse.json({ data: [] });
}
