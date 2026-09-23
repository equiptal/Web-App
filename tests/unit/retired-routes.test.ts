import { describe, it, expect } from "vitest";
import { isRetiredCompanyRoute, isRetiredRequestsRoute } from "@/middleware";

/**
 * Routes the product no longer has, and where each one sends the renter (owner, 2026-09-04 for the
 * organization page; docs/requests-workspace-disabled.md for the request pages).
 *
 * The matches are deliberately narrow, and that is the part worth pinning: `/requests` is the
 * workspace and must NOT redirect, only what sits below it; and `/company` goes but nothing that
 * merely starts with those letters does.
 */

describe("the organization page, now a block on the profile", () => {
  it("redirects the page and its subtree", () => {
    expect(isRetiredCompanyRoute("/company")).toBe(true);
    expect(isRetiredCompanyRoute("/company/documents")).toBe(true);
  });

  it("leaves a route that only begins with the same letters alone", () => {
    expect(isRetiredCompanyRoute("/companies")).toBe(false);
    expect(isRetiredCompanyRoute("/profile")).toBe(false);
  });
});

describe("the request pages the workspace replaced", () => {
  it("still redirects below /requests, and never /requests itself", () => {
    expect(isRetiredRequestsRoute("/requests/abc")).toBe(true);
    expect(isRetiredRequestsRoute("/compare")).toBe(true);
    expect(isRetiredRequestsRoute("/requests")).toBe(false);
  });
});
