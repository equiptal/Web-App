"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { DealRoom } from "@/components/deal-room/DealRoom";

/** /deal-room/[id] — the deal room (web-app/request-details-bids): price card + live chat. */
export default function DealRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  return (
    <AppShell title={title || (locale === "ar" ? "غرفة الصفقة" : "Deal Room")}>
      <DealRoom id={id} onTitle={setTitle} />
    </AppShell>
  );
}
