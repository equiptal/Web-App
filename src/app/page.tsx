import { AppShell } from "@/components/AppShell";
import { RfqProvider } from "@/lib/store/rfq-store";
import { CreateSurface } from "@/components/CreateSurface";

export default function Home() {
  return (
    <RfqProvider>
      <AppShell>
        <CreateSurface />
      </AppShell>
    </RfqProvider>
  );
}
