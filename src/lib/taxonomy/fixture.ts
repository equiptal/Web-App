import { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * Fixture equipment taxonomy: category → subcategory → measurement.
 *
 * Per STANDARDS § Equipment taxonomy, broadened to the prototype's categories (Power, Haulage) —
 * see brief.md Open question on taxonomy scope (🟡 Q2 in plan.md). When the real taxonomy endpoint
 * lands, this is replaced wholesale; the shape (this file's exports) is the only contract.
 *
 * Subcategory ids `generators` / `compressors` / `light-towers` are load-bearing: they drive the
 * operator-need default (AC-24, src/lib/contract/options.ts).
 */
export const TAXONOMY: Taxonomy = [
  {
    id: "earthmoving",
    name: "Earthmoving",
    subcategories: [
      {
        id: "excavators",
        name: "Excavators",
        measurements: [
          { id: "exc-1-5t", name: "1.5 ton", unit: "ton" },
          { id: "exc-8t", name: "8 ton", unit: "ton" },
          { id: "exc-20t", name: "20 ton", unit: "ton" },
          { id: "exc-30t", name: "30 ton", unit: "ton" },
          { id: "exc-50t", name: "50 ton", unit: "ton" },
        ],
      },
      {
        id: "wheel-loaders",
        name: "Wheel loaders",
        measurements: [
          { id: "wl-1-5m3", name: "1.5 m³ bucket", unit: "m³" },
          { id: "wl-3m3", name: "3 m³ bucket", unit: "m³" },
          { id: "wl-5m3", name: "5 m³ bucket", unit: "m³" },
        ],
      },
      {
        id: "bulldozers",
        name: "Bulldozers",
        measurements: [
          { id: "bd-d6", name: "D6 class", unit: "class" },
          { id: "bd-d8", name: "D8 class", unit: "class" },
        ],
      },
      {
        id: "backhoe-loaders",
        name: "Backhoe loaders",
        measurements: [{ id: "bhl-std", name: "Standard", unit: "class" }],
      },
    ],
  },
  {
    id: "cranes-lifting",
    name: "Cranes & lifting",
    subcategories: [
      {
        id: "mobile-cranes",
        name: "Mobile cranes",
        measurements: [
          { id: "mc-25t", name: "25 ton", unit: "ton" },
          { id: "mc-50t", name: "50 ton", unit: "ton" },
          { id: "mc-100t", name: "100 ton", unit: "ton" },
          { id: "mc-200t", name: "200 ton", unit: "ton" },
        ],
      },
      {
        id: "telehandlers",
        name: "Telehandlers",
        measurements: [
          { id: "th-14m", name: "14 m lift height", unit: "m" },
          { id: "th-17m", name: "17 m lift height", unit: "m" },
        ],
      },
      {
        id: "forklifts",
        name: "Forklifts",
        measurements: [
          { id: "fl-3t", name: "3 ton", unit: "ton" },
          { id: "fl-5t", name: "5 ton", unit: "ton" },
          { id: "fl-10t", name: "10 ton", unit: "ton" },
        ],
      },
    ],
  },
  {
    id: "power",
    name: "Power",
    subcategories: [
      {
        id: "generators",
        name: "Generators",
        measurements: [
          { id: "gen-100kva", name: "100 kVA", unit: "kVA" },
          { id: "gen-250kva", name: "250 kVA", unit: "kVA" },
          { id: "gen-500kva", name: "500 kVA", unit: "kVA" },
          { id: "gen-1000kva", name: "1000 kVA", unit: "kVA" },
        ],
      },
      {
        id: "compressors",
        name: "Compressors",
        measurements: [
          { id: "cmp-185cfm", name: "185 cfm", unit: "cfm" },
          { id: "cmp-375cfm", name: "375 cfm", unit: "cfm" },
          { id: "cmp-750cfm", name: "750 cfm", unit: "cfm" },
        ],
      },
      {
        id: "light-towers",
        name: "Light towers",
        measurements: [{ id: "lt-std", name: "Standard 4×1000W", unit: "unit" }],
      },
    ],
  },
  {
    id: "haulage",
    name: "Haulage",
    subcategories: [
      {
        id: "tippers",
        name: "Tippers",
        measurements: [
          { id: "tip-20t", name: "20 ton payload", unit: "ton" },
          { id: "tip-30t", name: "30 ton payload", unit: "ton" },
        ],
      },
      {
        id: "water-trucks",
        name: "Water trucks",
        measurements: [
          { id: "wt-10000l", name: "10,000 L", unit: "L" },
          { id: "wt-20000l", name: "20,000 L", unit: "L" },
        ],
      },
      {
        id: "trailers",
        name: "Trailers",
        measurements: [
          { id: "tr-12m", name: "12 m flatbed", unit: "m" },
          { id: "tr-low-bed", name: "Low-bed", unit: "type" },
        ],
      },
    ],
  },
  {
    id: "access",
    name: "Access",
    subcategories: [
      {
        id: "scissor-lifts",
        name: "Scissor lifts",
        measurements: [
          { id: "sl-8m", name: "8 m platform", unit: "m" },
          { id: "sl-12m", name: "12 m platform", unit: "m" },
        ],
      },
      {
        id: "boom-lifts",
        name: "Boom lifts",
        measurements: [
          { id: "bl-16m", name: "16 m working height", unit: "m" },
          { id: "bl-28m", name: "28 m working height", unit: "m" },
        ],
      },
    ],
  },
  {
    id: "concrete",
    name: "Concrete",
    subcategories: [
      {
        id: "concrete-pumps",
        name: "Concrete pumps",
        measurements: [
          { id: "cp-36m", name: "36 m boom", unit: "m" },
          { id: "cp-truck-mounted", name: "Truck-mounted", unit: "type" },
        ],
      },
      {
        id: "concrete-mixers",
        name: "Concrete mixers",
        measurements: [
          { id: "cm-6m3", name: "6 m³ drum", unit: "m³" },
          { id: "cm-10m3", name: "10 m³ drum", unit: "m³" },
        ],
      },
    ],
  },
];
