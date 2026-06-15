"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { GroupStrip } from "@/components/requests/RequestsList";
import { fetchRequestGroup, fetchBids, fetchRequestDetail } from "@/lib/api/client";
import { groupRequests, mapRequestListItem, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import { EquipImg, equipmentIcon } from "@/components/requests/EquipImg";
import { groupIdFromFileName } from "@/lib/compare/quotation-token";
import "@/components/requests/requests-proto.css";
import "@/components/compare/compare-proto.css";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** One supplier's offer on an item — a received bid, with its computed VAT-inclusive total. */
type Offer = { bid: BidCard; total: number };

/** One uploaded quotation's resolved data — its group + items + bids per item. */
type Loaded = { group: RequestGroup; items: RequestListItem[]; bidsByItem: Record<string, BidCard[]> };

export function CompareBids() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();

  // Each uploaded quotation → its group id (codes are deduped). Multiple files / groups allowed.
  const [entries, setEntries] = useState<{ code: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState<Record<string, Loaded | "error">>({});
  const [selKey, setSelKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const pending = entries.filter((e) => !(e.code in loaded));
    if (!pending.length) return;
    let active = true;
    setBusy(true);
    (async () => {
      for (const e of pending) {
        try {
          const { requests } = await fetchRequestGroup(e.code);
          let items: RequestListItem[] = requests;
          // Historical/solo requests have a null requestGroupId, so the stamped code is the request
          // id (not a group id) and the groupId filter returns nothing — fall back to that one request.
          if (!items.length) {
            const rec = await fetchRequestDetail(e.code).catch(() => null);
            if (rec) items = [mapRequestListItem(rec)];
          }
          if (!items.length) { if (active) setLoaded((p) => ({ ...p, [e.code]: "error" })); continue; }
          const [g] = groupRequests(items);
          const lists = await Promise.all(
            items.map((r) => fetchBids(r.id).then((d) => [r.id, d.bids] as const).catch(() => [r.id, [] as BidCard[]] as const)),
          );
          if (!active) return;
          setLoaded((p) => ({ ...p, [e.code]: { group: g, items, bidsByItem: Object.fromEntries(lists) } }));
        } catch {
          if (active) setLoaded((p) => ({ ...p, [e.code]: "error" }));
        }
      }
      if (active) setBusy(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function addCode(code: string, name: string) {
    setError(null);
    setEntries((prev) => (prev.some((e) => e.code === code) ? prev : [...prev, { code, name }]));
  }
  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    let added = false;
    for (const f of Array.from(files)) {
      const gid = groupIdFromFileName(f.name);
      if (gid) { addCode(gid, f.name); added = true; }
    }
    if (!added) setError(L("That file isn’t a Moedatech quotation — use the file you downloaded, or paste its comparison code.", "هذا الملف ليس عرض سعر من مودياتك — استخدم الملف الذي نزّلته أو الصق رمز المقارنة."));
  }
  function removeEntry(code: string) { setEntries((prev) => prev.filter((e) => e.code !== code)); }
  function clearAll() { setEntries([]); setLoaded({}); setSelKey(null); setError(null); }

  // Combine items + bids across every successfully-loaded quotation (different request ids never collide).
  const okGroups = entries.map((e) => loaded[e.code]).filter((d): d is Loaded => !!d && d !== "error");
  const allItems = okGroups.flatMap((d) => d.items);
  const bidsByItem: Record<string, BidCard[]> = Object.assign({}, ...okGroups.map((d) => d.bidsByItem));

  const lineTotal = (it: RequestListItem, b: BidCard) => {
    const dur = b.duration ?? it.durationDays ?? 1;
    const sub = (b.price ?? 0) * dur + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
    return sub + Math.round(sub * 0.15);
  };
  const offersFor = (it: RequestListItem): Offer[] => (bidsByItem[it.id] ?? []).map((b) => ({ bid: b, total: lineTotal(it, b) }));
  const selItem = allItems.find((i) => i.id === selKey) ?? allItems[0] ?? null;

  let basketTotal = 0, basketItems = 0;
  for (const it of allItems) {
    const offs = offersFor(it);
    if (offs.length) { basketTotal += Math.min(...offs.map((o) => o.total)); basketItems++; }
  }

  const stillLoading = busy && entries.some((e) => !(e.code in loaded));
  // No bids surfaced — either a quotation didn't resolve, or it resolved but no item has any bid.
  // The usual cause is a quotation from a different account, so guide the renter.
  const someNotFound = entries.some((e) => loaded[e.code] === "error");
  const noBidsFound = allItems.length > 0 && basketItems === 0;
  const showNoBidsNote = !stillLoading && entries.length > 0 && (someNotFound || noBidsFound);

  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {/* drop zone — stays visible so more quotations (even from other requests) can be added */}
      <div
        className={`dropzone${dragOver ? " over" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        <div className="dz-ic"><span className="material-icons-outlined">upload_file</span></div>
        <div className="dz-t">{L("Upload Moedatech quotations", "ارفع عروض أسعار مودياتك")}</div>
        <div className="dz-s">{L("Drop one or more quotation PDFs you downloaded — even from different requests. We compare every item across them.", "أسقط ملفًا أو أكثر من عروض الأسعار التي نزّلتها — حتى من طلبات مختلفة. نقارن كل عنصر عبرها.")}</div>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {error && <p className="cmp-error">{error}</p>}

      {/* uploaded tray — one chip per quotation */}
      {entries.length > 0 && (
        <div className="tray">
          <span className="tlab">{entries.length} {entries.length > 1 ? L("quotations", "عروض") : L("quotation", "عرض")}</span>
          {entries.map((e) => {
            const d = loaded[e.code];
            const err = d === "error";
            const g = d && d !== "error" ? d.group : null;
            return (
              <span key={e.code} className={`qchip${err ? " err" : ""}`}>
                <span className="av">{(g?.locationLabel ?? "?").charAt(0).toUpperCase()}</span>
                {err ? L("Not found", "غير موجود") : g ? g.locationLabel : L("Loading…", "جارٍ التحميل…")}
                <span className="fn">{e.name}</span>
                <span className="x" onClick={() => removeEntry(e.code)}><span className="material-icons-outlined">close</span></span>
              </span>
            );
          })}
          <span className="clear-all" onClick={clearAll}>{L("Clear all", "مسح الكل")}</span>
        </div>
      )}

      {stillLoading && <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div>}

      {showNoBidsNote && (
        <p className="cmp-note">
          <span className="material-icons-outlined">info</span>
          {L("No bids found for this quotation — make sure it was generated by your Moedatech account.", "لم يتم العثور على عروض لهذا العرض — تأكد من أنه صادر من حساب مودياتك الخاص بك.")}
        </p>
      )}

      {allItems.length > 0 && (
        <>
          {/* one request/bid-style header per uploaded quotation (same GroupStrip as Requests & Bids) */}
          {okGroups.map((d) => <GroupStrip key={d.group.id} group={d.group} ar={ar} L={L} router={router} />)}

          {/* cheapest basket — across every item from every uploaded quotation */}
          {basketItems > 0 && (
            <div className="basket">
              <span className="bk-ic"><span className="material-icons-outlined">shopping_basket</span></span>
              <div>
                <div className="bk-t">{L("Cheapest basket — lowest offer per item", "أرخص سلة — أقل عرض لكل عنصر")}</div>
                <div className="bk-s">{L("Lowest offer on", "أقل عرض على")} {basketItems} {L("of", "من")} {allItems.length} {L("items, combined (incl. VAT)", "عناصر، شامل الضريبة")}</div>
              </div>
              <span className="bk-v">{nf(basketTotal)} {L("SAR", "ر.س")}</span>
            </div>
          )}

          {/* item tabs — every item across all uploaded quotations */}
          <div className="item-tabs">
            <div className="flab"><span className="material-icons-outlined">view_module</span>{L("Item", "العنصر")}</div>
            <div className="itabs">
              {allItems.map((it) => {
                const cnt = offersFor(it).length;
                return (
                  <button key={it.id} className={`itab${it.id === selItem?.id ? " on" : ""}`} onClick={() => setSelKey(it.id)}>
                    <span className="material-icons-outlined">{equipmentIcon(it.item?.name)}</span>
                    {(ar ? it.item?.nameAr : it.item?.name) || it.displayId}
                    <span className="ct">{cnt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selItem && <ItemComparison item={selItem} offers={offersFor(selItem)} ar={ar} L={L} />}
        </>
      )}
    </div>
  );
}

/* ── one item's comparison — suppliers as columns, attributes as rows in 3 blocks ── */
function ItemComparison({ item, offers, ar, L }: { item: RequestListItem; offers: Offer[]; ar: boolean; L: (en: string, arr: string) => string }) {
  const title = (ar ? item.item?.nameAr : item.item?.name) || item.displayId;
  const head = (
    <div className="cmp-h">
      <span className="ci"><EquipImg src={item.item?.imageUrl ?? null} categoryId={item.item?.categoryId ?? null} name={item.item?.name} box="" img="h-7 w-7 object-contain" iconSize={22} /></span>
      <div>
        <div className="ct">{title}</div>
        <div className="cs">{(item.item?.qty ?? 1)} {L("units", "وحدة")} · {offers.length} {offers.length === 1 ? L("quotation", "عرض") : L("quotations", "عروض")} · {item.durationDays ? `${item.durationDays} ${L("days", "يوم")}` : item.rentalType ?? ""}</div>
      </div>
    </div>
  );

  if (offers.length === 0) {
    return <section className="cmp">{head}<div className="cmp-empty">{L("No bids on this item yet.", "لا توجد عروض على هذا العنصر بعد.")}</div></section>;
  }

  const n = offers.length;
  const gt = { gridTemplateColumns: `136px repeat(${n}, minmax(124px, 1fr))` };
  const yearOf = (o: Offer) => o.bid.equipment?.year ?? 0;
  const distOf = (o: Offer) => o.bid.distanceKm ?? Infinity;
  const minTotal = Math.min(...offers.map((o) => o.total));
  const maxYear = Math.max(...offers.map(yearOf));
  const minDist = Math.min(...offers.map(distOf));
  const reqMet = (o: Offer) => [o.bid.verified, o.bid.compliance.activityLicense, o.bid.compliance.taxNumber, o.bid.compliance.safety, o.bid.compliance.localContent, o.bid.compliance.saso, o.bid.eqVerified].filter(Boolean).length;
  const maxReq = Math.max(...offers.map(reqMet));

  const sar = L("SAR", "ر.س");
  const moneyOrState = (v: number | null) =>
    v == null ? <span className="csoft">{L("Not specified", "غير محدّد")}</span>
    : v === 0 ? <span className="csoft">{L("Included", "مشمول")}</span>
    : <span className="cmoney">{nf(v)} <span className="sar">{sar}</span></span>;
  const chk = (b: boolean) => <span className={`cchk ${b ? "ok" : "no"}`}>{b ? "✓" : "✕"}</span>;

  const Row = ({ label, cell }: { label: string; cell: (o: Offer) => ReactNode }) => (
    <div className="crow cgrid" style={gt}>
      <div className="clbl">{label}</div>
      {offers.map((o, i) => <div key={i} className="ccell">{cell(o)}</div>)}
    </div>
  );
  const RowWin = ({ label, win, cell }: { label: string; win: (o: Offer) => boolean; cell: (o: Offer) => ReactNode }) => (
    <div className="crow cgrid" style={gt}>
      <div className="clbl">{label}</div>
      {offers.map((o, i) => <div key={i} className={`ccell${win(o) ? " win" : ""}`}>{cell(o)}</div>)}
    </div>
  );

  return (
    <section className="cmp">
      {head}
      <div className="cmpx-scroll">
        <div className="cmpx" style={{ minWidth: 136 + n * 130 }}>
          {/* supplier strip */}
          <div className="cstrip cgrid" style={gt}>
            <div className="clbl" />
            {offers.map((o, i) => (
              <div key={i} className="csup">
                <div className="cava">{o.bid.supplierName.charAt(0).toUpperCase()}{o.bid.verified && <span className="ctick">✓</span>}</div>
                <div className="cname">{o.bid.supplierName}</div>
                {o.bid.status === "ACCEPTED" && <span className="cacc">{L("Accepted", "مقبول")}</span>}
              </div>
            ))}
          </div>

          {/* Price */}
          <div className="cblock b-price">
            <div className="cbhead"><span className="cdot" />{L("Price", "السعر")}</div>
            <RowWin label={L("Total incl. VAT", "الإجمالي شامل الضريبة")} win={(o) => o.total === minTotal} cell={(o) => <span className="cmoney big">{nf(o.total)} <span className="sar">{sar}</span></span>} />
            <Row label={`${L("Rate", "السعر")} / ${(item.rentalType ?? "day").toLowerCase()}`} cell={(o) => <span className="cmoney">{nf(o.bid.price ?? 0)} <span className="sar">{sar}</span></span>} />
            <Row label={L("Delivery to site", "التوصيل للموقع")} cell={(o) => moneyOrState(o.bid.mobPrice)} />
            <Row label={L("Pickup from site", "الاستلام من الموقع")} cell={(o) => moneyOrState(o.bid.demobPrice)} />
          </div>

          {/* Quality */}
          <div className="cblock b-qual">
            <div className="cbhead"><span className="cdot" />{L("Quality & suitability", "الجودة والملاءمة")}</div>
            <RowWin label={L("Year of manufacture", "سنة الصنع")} win={(o) => yearOf(o) === maxYear && maxYear > 0} cell={(o) => <span className="cval num">{o.bid.equipment?.year ?? "—"}</span>} />
            <Row label={L("Brand", "العلامة")} cell={(o) => <span className="cval">{o.bid.equipment?.make ?? "—"}</span>} />
            <Row label={L("Model", "الطراز")} cell={(o) => <span className="cval">{o.bid.equipment?.model ?? "—"}</span>} />
            <RowWin label={L("Distance from site", "المسافة من الموقع")} win={(o) => distOf(o) === minDist && Number.isFinite(minDist)} cell={(o) => <span className="cval">{o.bid.distanceKm != null ? `${Math.round(o.bid.distanceKm)} ${L("km", "كم")}` : "—"}</span>} />
            <Row label={L("Rating", "التقييم")} cell={(o) => <span className="cval">{o.bid.rating != null ? `★ ${o.bid.rating.toFixed(1)}` : "—"}</span>} />
          </div>

          {/* Compliance & documents */}
          <div className="cblock b-comp">
            <div className="cbhead"><span className="cdot" />{L("Compliance & documents", "الامتثال والمستندات")}</div>
            <Row label={L("Verification status", "حالة التوثيق")} cell={(o) => <span className={`cvpill ${o.bid.verified ? "ok" : "no"}`}>{o.bid.verified ? L("Verified", "موثّق") : L("Not verified", "غير موثّق")}</span>} />
            <Row label={L("Entity type", "نوع الكيان")} cell={(o) => <span className="cval">{o.bid.compliance.entityType === "company" ? L("Company", "شركة") : L("Individual", "فرد")}</span>} />
            <Row label={L("Activity license", "رخصة النشاط")} cell={(o) => chk(o.bid.compliance.activityLicense)} />
            <Row label={L("Tax number", "الرقم الضريبي")} cell={(o) => chk(o.bid.compliance.taxNumber)} />
            <Row label={L("Safety certifications", "شهادات السلامة")} cell={(o) => chk(o.bid.compliance.safety)} />
            <Row label={L("Local content certificate", "شهادة المحتوى المحلي")} cell={(o) => chk(o.bid.compliance.localContent)} />
            <Row label={L("SASO certificate", "شهادة ساسو")} cell={(o) => chk(o.bid.compliance.saso)} />
            <Row label={L("Equipment verification", "توثيق المعدة")} cell={(o) => chk(o.bid.eqVerified)} />
            <RowWin label={L("Requirements met", "المتطلبات المستوفاة")} win={(o) => reqMet(o) === maxReq && maxReq > 0} cell={(o) => <span className="cfrac">{reqMet(o)} / 7</span>} />
          </div>
        </div>
      </div>
    </section>
  );
}
