/**
 * Per-device soft limit on AI-agent runs for signed-out visitors (public-web-auth-gate T10). A guest
 * has no account identity, so we can't cap "per user" server-side — instead we count runs per browser
 * in localStorage and, once the free allowance is used, prompt the visitor to create an account.
 *
 * Soft by design: clearing storage / incognito resets it. It's a conversion nudge, not hard abuse
 * enforcement (a hard per-IP cap would need a Mansour/agent-backend change). Signed-in users are never
 * limited — callers should only consult this when the session is anonymous.
 */
export const GUEST_AGENT_LIMIT = 3;

export type AgentKind = "create" | "compare";

const KEY = "mt-agent-uses";

function read(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** How many times this device has run the given agent. */
export function agentUses(kind: AgentKind): number {
  return read()[kind] ?? 0;
}

/** Record one run; returns the new count. */
export function bumpAgentUse(kind: AgentKind): number {
  const m = read();
  m[kind] = (m[kind] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — best-effort only */
  }
  return m[kind];
}

/** True once a guest has used up the free allowance for this agent on this device. */
export function guestLimitReached(kind: AgentKind): boolean {
  return agentUses(kind) >= GUEST_AGENT_LIMIT;
}
