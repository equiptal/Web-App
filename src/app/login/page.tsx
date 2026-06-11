import { LoginFlow } from "./LoginFlow";

/**
 * Sign-in route (web-app/001). Standalone — no AppShell. Reads the `next` deep-link so the flow can
 * return the renter to where they were headed (AC-07) or to home (AC-08).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginFlow next={next ?? "/"} />;
}
