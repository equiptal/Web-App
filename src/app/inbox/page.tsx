"use client";

import { AppShell } from "@/components/AppShell";
import { InboxView } from "@/components/inbox/InboxView";
import { useT } from "@/lib/i18n";

export default function InboxPage() {
  const t = useT();
  return (
    <AppShell title={t.shell.inbox}>
      <InboxView />
    </AppShell>
  );
}
