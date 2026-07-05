import { describe, it, expect, beforeEach } from "vitest";

// The quota util reads/writes localStorage and guards on `typeof window`. In the node test env we
// provide both so the real counting logic runs (rather than the SSR no-op fallback).
const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { agentUses, bumpAgentUse, guestLimitReached, GUEST_AGENT_LIMIT } from "@/lib/access/agent-quota";

describe("agent-quota (T10 per-device soft limit)", () => {
  it("starts at zero and not limited", () => {
    expect(agentUses("create")).toBe(0);
    expect(agentUses("compare")).toBe(0);
    expect(guestLimitReached("create")).toBe(false);
  });

  it("bump increments and returns the new count, persisting across reads", () => {
    expect(bumpAgentUse("create")).toBe(1);
    expect(bumpAgentUse("create")).toBe(2);
    expect(agentUses("create")).toBe(2);
  });

  it("counts each agent kind independently", () => {
    bumpAgentUse("create");
    bumpAgentUse("create");
    bumpAgentUse("compare");
    expect(agentUses("create")).toBe(2);
    expect(agentUses("compare")).toBe(1);
  });

  it("reaches the limit exactly at GUEST_AGENT_LIMIT", () => {
    for (let i = 0; i < GUEST_AGENT_LIMIT - 1; i++) bumpAgentUse("compare");
    expect(guestLimitReached("compare")).toBe(false); // one below
    bumpAgentUse("compare");
    expect(guestLimitReached("compare")).toBe(true); // at the limit
    bumpAgentUse("compare");
    expect(guestLimitReached("compare")).toBe(true); // and beyond
  });

  it("tolerates corrupt storage without throwing (treats as zero)", () => {
    store["mt-agent-uses"] = "{not json";
    expect(agentUses("create")).toBe(0);
    expect(() => bumpAgentUse("create")).not.toThrow();
  });
});
