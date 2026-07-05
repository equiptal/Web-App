import { redirect } from "next/navigation";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { LoginFlow } from "./LoginFlow";

/**
 * Sign-in route. In LEGACY mode (public-web flag OFF) this is the standalone OTP login (web-app/001).
 * In PUBLIC-WEB mode there is NO login page — auth is an in-app modal — so any hit here (deep link,
 * stale bookmark, an already-processed mobile handoff) just bounces to the intended page or home, where
 * the modal handles sign-in on the next gated action.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (PUBLIC_WEB_ENABLED) redirect(safeNext);
  return <LoginFlow next={next ?? "/"} />;
}
