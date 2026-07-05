import type { RenterUser } from "@/lib/contract/auth";

/**
 * The procurement dashboard is a DEMO surface. It is OFF unless the environment opts in
 * (`NEXT_PUBLIC_DASHBOARD_ENABLED=1`, set only on staging), AND then only for the CCC mock account
 * (matched by phone). Production leaves the flag unset → the dashboard is off for EVERY account,
 * including the `966503695664` number (prod's CCC account uses a different phone). Same env-flag
 * pattern as PUBLIC_WEB_ENABLED / LOGO_UPLOAD_ENABLED. Read at call time so tests can toggle it.
 */
const CCC_DASHBOARD_PHONE = "966503695664";
const dashboardEnabled = () => process.env.NEXT_PUBLIC_DASHBOARD_ENABLED === "1";

const digits = (p: string | null | undefined): string => (p ?? "").replace(/\D/g, "");

export function canSeeProcurementDashboard(user: RenterUser | null | undefined): boolean {
  if (!dashboardEnabled()) return false; // off in prod (flag unset) → no account can see it
  return digits(user?.phone) === CCC_DASHBOARD_PHONE;
}
