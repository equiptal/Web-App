import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";
import { getProjectFixture, updateProjectFixture, deleteProjectFixture } from "@/lib/projects/fixture";

export const dynamic = "force-dynamic";

/**
 * GET · PATCH · DELETE /api/projects/:id
 *
 * `PATCH` edits the site's own values and **propagates nothing on its own**: whether the change also
 * reaches what is already filed under it is the renter's explicit tick, sent in the body and decided
 * by the backend (PROJ-AC-31). This route does not interpret it.
 *
 * `DELETE` is refused while anything is filed — 409, not a cascade. A site with requests under it is
 * not something to lose by mis-clicking; the renter unfiles first.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(PROJECT(id));
  const p = getProjectFixture(id);
  return p ? NextResponse.json(p) : NextResponse.json({ code: "not_found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(PROJECT(id), { method: "PATCH", body });
  const p = updateProjectFixture(id, JSON.parse(body ?? "{}"));
  return p ? NextResponse.json(p) : NextResponse.json({ code: "not_found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(PROJECT(id), { method: "DELETE" });
  const result = deleteProjectFixture(id);
  if (result === "not_found") return NextResponse.json({ code: "not_found" }, { status: 404 });
  if (result === "not_empty") return NextResponse.json({ code: "PROJECT_NOT_EMPTY" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

const PROJECT = (id: string) => `/projects/${encodeURIComponent(id)}`;
