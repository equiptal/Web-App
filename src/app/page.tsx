import { AppShell } from "@/components/AppShell";
import { HomeHub } from "@/components/home/HomeHub";

/**
 * / — the renter web home hub (web-app/004). Inside the app shell; the RFQ create flow now lives at
 * /create (reached via the home banner and the sidebar Request action).
 */
export default function Home() {
  return (
    <AppShell>
      <HomeHub />
    </AppShell>
  );
}
