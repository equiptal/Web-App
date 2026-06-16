"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { RequestGroupDetail } from "@/components/requests/RequestGroupDetail";

/** /requests/group/[groupId] — multi-item detail for one submission group (web-app/multi-item-requests). */
export default function RequestGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  return (
    <AppShell title={title || (locale === "ar" ? "تفاصيل الطلب" : "Request details")}>
      <RequestGroupDetail groupId={decodeURIComponent(groupId)} onTitle={setTitle} />
    </AppShell>
  );
}
