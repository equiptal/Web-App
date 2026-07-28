import { describe, it, expect } from "vitest";
import {
  extractStoreList,
  mapStoreCard,
  mapEquipment,
  mapStoreDetail,
  mapTaxonomy,
  mapEquipmentDetail,
  mediaUrl,
} from "@/lib/contract/stores";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

describe("stores mappers (web-app/004)", () => {
  it("maps a store card and exposes only the AC-16 fields (no rating/deals/tags)", () => {
    const card = mapStoreCard({
      id: "s1",
      name: "Al Rajhi Equipment",
      logoUrl: "https://x/logo.png",
      isVerified: true,
      activeEquipmentCount: 48,
      city: "Riyadh",
      rating: 4.5, // must be ignored
      completedDeals: 12, // must be ignored
    });
    expect(card).toEqual({
      id: "s1",
      name: "Al Rajhi Equipment",
      logoUrl: "https://x/logo.png",
      isVerified: true,
      activeEquipmentCount: 48,
      city: "Riyadh",
    });
    expect(Object.keys(card)).not.toContain("rating");
  });

  it("treats a non-verified supplier as New (isVerified false) and tolerates missing fields", () => {
    const card = mapStoreCard({ id: "s2", name: "New Co" });
    expect(card.isVerified).toBe(false); // → rendered as `New` (AC-13)
    expect(card.activeEquipmentCount).toBe(0);
    expect(card.logoUrl).toBeNull();
    expect(card.city).toBeNull();
  });

  it("extractStoreList handles bare array, {data}, and {stores}", () => {
    expect(extractStoreList([{ id: "a" }])).toHaveLength(1);
    expect(extractStoreList({ data: [{ id: "b" }], meta: {} })).toHaveLength(1);
    expect(extractStoreList({ stores: [{ id: "c" }, { id: "d" }] })).toHaveLength(2);
    expect(extractStoreList(null)).toEqual([]);
  });

  it("mediaUrl builds the shared-bucket URL for a raw key and passes http URLs through", () => {
    expect(mediaUrl("default/equipment/photos/x.jpg")).toBe(
      "https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment/photos/x.jpg",
    );
    expect(mediaUrl("https://signed.example/x.jpg?sig=1")).toBe("https://signed.example/x.jpg?sig=1");
    expect(mediaUrl(null)).toBeNull();
  });

  it("maps an equipment photo key (bare string) to a full media URL", () => {
    const e = mapEquipment({ id: "e0", photoKeys: ["default/equipment/photos/a.jpg"], verificationStatus: "VERIFIED" });
    expect(e.photoUrl).toBe("https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment/photos/a.jpg");
  });

  it("extracts .key from structured photoKeys objects and passes signed URLs through", () => {
    // The backend stores photoKeys as {key, slot} objects and signs .key into a full URL.
    const e = mapEquipment({
      id: "e0b",
      photoKeys: [{ key: "https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment/photos/a.jpg?X-Amz-Signature=abc", slot: "front" }],
    });
    expect(e.photoUrl).toBe("https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment/photos/a.jpg?X-Amz-Signature=abc");
  });

  it("maps equipment price → price-on-request when price is null, and the verification tick", () => {
    const withPrice = mapEquipment({ id: "e1", price: 500, priceUnit: "PER_DAY", verificationStatus: "VERIFIED" });
    expect(withPrice.price).toBe(500);
    expect(withPrice.isVerified).toBe(true);

    const noPrice = mapEquipment({ id: "e2", price: null, verificationStatus: "PENDING_REVIEW" });
    expect(noPrice.price).toBeNull(); // → price-on-request (AC-20)
    expect(noPrice.isVerified).toBe(false); // tick only when VERIFIED (AC-20)
  });

  it("carries equipment en + ar names and make/model", () => {
    const e = mapEquipment({
      id: "e3",
      categoryName: "Excavators",
      categoryNameAr: "حفارات",
      subcategoryName: "Crawler",
      subcategoryNameAr: "زاحف",
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2020,
      fuelType: "DIESEL",
    });
    expect(e.category).toBe("Excavators");
    expect(e.categoryAr).toBe("حفارات");
    expect(e.make).toBe("Caterpillar");
    expect(e.model).toBe("320D");
    expect(e.year).toBe(2020);
    expect(e.fuel).toBe("DIESEL");
  });

  it("maps store detail: city falls back to yards[0].city, equipment + count from meta", () => {
    const d = mapStoreDetail({
      store: { id: "s9", name: "Store 9", description: "desc", viewCount: 1234, isVerified: false, supplierName: "Ahmed" },
      yards: [{ id: "y1", name: "Main", city: "Jeddah" }],
      equipment: [{ id: "e1", price: 100, priceUnit: "PER_DAY", verificationStatus: "VERIFIED" }],
      equipmentMeta: { total: 7 },
    });
    expect(d.city).toBe("Jeddah"); // from yards (store.city absent)
    expect(d.viewCount).toBe(1234);
    expect(d.isVerified).toBe(false);
    expect(d.activeEquipmentCount).toBe(7); // from equipmentMeta.total
    expect(d.equipment).toHaveLength(1);
    expect(d.equipment[0].isVerified).toBe(true);
  });

  it("public projection: store card name falls back to companyName", () => {
    // Authed /stores sends `name`; the PII-safe public projection sends the supplier `companyName`.
    const card = mapStoreCard({ id: "s3", companyName: "Gulf Cranes Co", isVerified: true, city: "Dammam" });
    expect(card.name).toBe("Gulf Cranes Co");
    expect(card.isVerified).toBe(true);
    expect(card.city).toBe("Dammam");
  });

  it("public projection: store detail city derives from equipment[0].yard when store/yards omit it", () => {
    const d = mapStoreDetail({
      id: "s10",
      companyName: "Public Store",
      equipment: [
        { id: "e1", price: 100, priceUnit: "PER_DAY", verificationStatus: "VERIFIED", yard: { id: "y1", name: "North", city: "Mecca" } },
      ],
    });
    expect(d.name).toBe("Public Store"); // companyName fallback
    expect(d.city).toBe("Mecca"); // from the nested equipment yard
    expect(d.equipment).toHaveLength(1);
  });

  it("maps equipment detail: photo URLs from {key} objects, doc types (drops OTHER), price", () => {
    const d = mapEquipmentDetail({
      id: "eqd",
      categoryName: "Cranes",
      subcategoryName: "Mobile Crane",
      manufacturer: "SANY",
      modelName: "STC1000",
      year: 2023,
      fuelType: "diesel",
      operatingHours: 1500,
      price: 4500,
      priceUnit: "per_day",
      verificationStatus: "VERIFIED",
      photoKeys: [
        { key: "https://x/p1.jpg?sig=1", slot: "front" },
        { key: "https://x/p2.jpg?sig=2", slot: "serial" },
      ],
      documentKeys: [{ key: "https://x/d1?sig", type: "tuv" }, { key: "https://x/d2?sig", type: "OTHER" }],
      yardName: "Riyadh Yard",
      yardCity: "Riyadh",
      store: { id: "s1", name: "SANY Store" },
    });
    expect(d.photos).toEqual(["https://x/p1.jpg?sig=1", "https://x/p2.jpg?sig=2"]);
    expect(d.docTypes).toEqual(["tuv"]); // OTHER filtered out
    expect(d.isVerified).toBe(true);
    expect(d.price).toBe(4500);
    expect(d.storeName).toBe("SANY Store");
  });

  it("public projection: equipment detail takes yard name/city from the nested `yard` (guest path)", () => {
    // Shape of one item from `GET /public/stores/{id}/equipment` — the guest fallback for the
    // equipment modal (no public equipment-detail route). No flat yardName/yardCity, no `store`.
    const d = mapEquipmentDetail({
      id: "d499d708",
      categoryName: "Telehandler",
      categoryNameAr: "رافعة تلسكوبية",
      subcategoryName: "Telehandler",
      measurementName: "24 m",
      manufacturer: "Manitou",
      modelName: "manitou",
      year: 2024,
      fuelType: "DIESEL",
      price: null,
      priceUnit: null,
      verificationStatus: "VERIFIED",
      photoKeys: [{ key: "https://x/p1.jpg?sig=1", slot: "front" }],
      documentKeys: [],
      yard: { id: "y1", name: "riyadh", city: "Riyadh" },
    });
    expect(d.yardName).toBe("riyadh");
    expect(d.yardCity).toBe("Riyadh");
    expect(d.photos).toEqual(["https://x/p1.jpg?sig=1"]);
    expect(d.isVerified).toBe(true);
    expect(d.price).toBeNull(); // → price-on-request
    expect(d.operatingHours).toBeNull(); // not in the public projection
    expect(d.storeName).toBeNull(); // filled from the store page's own name
  });

  it("maps the taxonomy tree keeping id/name/nameAr/children", () => {
    const tree = mapTaxonomy([
      {
        id: "c1",
        name: "Excavators",
        nameAr: "حفارات",
        level: "CATEGORY",
        children: [{ id: "s1", name: "Crawler", nameAr: "زاحف", level: "SUBCATEGORY", children: [{ id: "m1", name: "20t", nameAr: "20 طن", children: [] }] }],
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("s1");
    expect(tree[0].children[0].children[0].nameAr).toBe("20 طن");
  });
});

describe("i18n parity for the web-app/004 blocks", () => {
  const blocks = ["shell", "home", "browse", "store"] as const;
  for (const b of blocks) {
    it(`en.${b} and ar.${b} have the same keys`, () => {
      expect(Object.keys(ar[b]).sort()).toEqual(Object.keys(en[b]).sort());
    });
  }
});
