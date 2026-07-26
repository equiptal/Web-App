import { NextResponse } from "next/server";
import { companyAction, companyDeleteAction } from "@/lib/api/company-server";

/**
 * POST /api/me/company/members/:id/(approve|remove|promote|demote) — the owner roster actions
 * (docs/plans/company-shared-visibility.md). `:id` is the TARGET member's user id; the acting owner
 * is the session.
 *
 * One route for all four because they're the same call with a different verb, and each maps 1:1 onto
 * an agents endpoint. The action is whitelisted below, so an unknown segment 404s here rather than
 * being interpolated into a backend path.
 *
 * Ownership is NOT decided here — the backend checks the actor's own membership row, so a forged
 * request can't grant itself owner powers. Notable refusals the UI reacts to:
 *   - `CO1004` the actor isn't an active owner
 *   - `CO1006` the change would leave the firm with no owner (demote/remove the last one)
 *   - `CO1009` approving someone who isn't pending
 */
const ACTIONS = {
  approve: "approve",
  remove: "remove",
  promote: "promote",
  demote: "demote",
} as const;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const verb = ACTIONS[action as keyof typeof ACTIONS];
  if (!verb) return NextResponse.json({ code: "not_found" }, { status: 404 });

  const memberUserId = Number(id);
  if (!Number.isInteger(memberUserId) || memberUserId <= 0) {
    return NextResponse.json({ code: "CO1005" }, { status: 400 });
  }

  const route = `POST /api/me/company/members/${memberUserId}/${verb}`;
  // Remove is a DELETE upstream (app parity); the other three are POSTs.
  return verb === "remove"
    ? companyDeleteAction((actor) => `/agents/companies/members/${memberUserId}?userId=${actor}`, route)
    : companyAction(`/agents/companies/members/${memberUserId}/${verb}`, route);
}
