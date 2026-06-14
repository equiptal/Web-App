"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { RequestDetail } from "@/components/requests/RequestDetail";

/** /requests/[id] — full detail for one request (web-app/request-details-bids). */
export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  return (
    <AppShell title={title || (locale === "ar" ? "تفاصيل الطلب" : "Request details")}>
      <RequestDetail id={id} onTitle={setTitle} />
    </AppShell>
  );
}
