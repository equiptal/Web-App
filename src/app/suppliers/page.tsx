import { AppShell, PageBack } from "@/components/AppShell";
import { SuppliersPage } from "@/components/suppliers/SuppliersPage";

/**
 * /suppliers — the renter's own list of the firms he works with (SUP-T13).
 *
 * Not the platform's directory: Stores is that, and Stores looks the same for every renter. This one
 * starts empty and only ever holds rows he created — which is why the empty state says so rather than
 * apologising for having nothing in it.
 */
export default function Suppliers() {
  return (
    <AppShell>
      <PageBack fallback="/" />
      <SuppliersPage />
    </AppShell>
  );
}
