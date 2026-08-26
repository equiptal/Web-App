import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * The design system, enforced.
 *
 * `src/app/globals.css` names every value a screen may use and `src/lib/ds.ts` every combination of
 * them. These rules are what stops the next edit from writing a thirteenth blue or a seventh way of
 * marking a selected chip — the app had 171 distinct hex colours and 20 font sizes before it had
 * these. `DESIGN.md` explains what to reach for instead in each case.
 *
 * Each rule names its replacement in the message, because a rule that only says "no" gets disabled.
 */
const designSystem = {
  files: ["src/**/*.{ts,tsx}"],
  // The two files that ARE the system, plus the one that mirrors it as literals for the surfaces
  // with no stylesheet (the OG image, the clipboard card, the printed quotation).
  ignores: ["src/lib/ds.ts", "src/lib/ds-colors.ts", "src/app/globals.css"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/#(?![0fF]{3}\\b)(?![0fF]{6}\\b)[0-9a-fA-F]{3,8}\\b/]",
        message:
          "No raw hex colours. Use a token: text-navy, bg-surface2, border-border, or var(--brand) in a style. The full palette is in src/app/globals.css.",
      },
      {
        selector: "TemplateElement[value.raw=/#(?![0fF]{3}\\b)(?![0fF]{6}\\b)[0-9a-fA-F]{3,8}\\b/]",
        message:
          "No raw hex colours. Use a token: text-navy, bg-surface2, border-border, or var(--brand) in a style. The full palette is in src/app/globals.css.",
      },
      // White and black are exempt. A grid line at 4% white over a navy block, or a mask gradient in
      // black, is not a palette colour, and a token for it would only ever mean "white" or "black".
      {
        selector: "Literal[value=/\\brgba?\\((?!\\s*255\\s*,\\s*255\\s*,\\s*255)(?!\\s*0\\s*,\\s*0\\s*,\\s*0)\\s*\\d/]",
        message:
          "No raw rgba() colours. For a token at an alpha, use color-mix(in srgb, var(--brand) 12%, transparent) or Tailwind's border-warn/40.",
      },
      {
        selector: "TemplateElement[value.raw=/\\brgba?\\((?!\\s*255\\s*,\\s*255\\s*,\\s*255)(?!\\s*0\\s*,\\s*0\\s*,\\s*0)\\s*\\d/]",
        message:
          "No raw rgba() colours. For a token at an alpha, use color-mix(in srgb, var(--brand) 12%, transparent) or Tailwind's border-warn/40.",
      },
      {
        selector: "Literal[value=/\\btext-\\[[0-9.]+(px|rem)\\]/]",
        message:
          "No arbitrary font sizes. The scale is six steps: text-label 11 · text-meta 12.5 · text-body 13 · text-subhead 15 · text-title 17 · text-display 22, plus text-hero 32 for display copy only.",
      },
      {
        selector: "TemplateElement[value.raw=/\\btext-\\[[0-9.]+(px|rem)\\]/]",
        message:
          "No arbitrary font sizes. The scale is six steps: text-label 11 · text-meta 12.5 · text-body 13 · text-subhead 15 · text-title 17 · text-display 22, plus text-hero 32 for display copy only.",
      },
      {
        selector: "Literal[value=/\\brounded(-[a-z]+)?-\\[[0-9.]+px\\]/]",
        message:
          "No arbitrary radii. Four steps: rounded-sm 8 · rounded-md 10 · rounded-lg 14 · rounded-full.",
      },
      {
        selector: "TemplateElement[value.raw=/\\brounded(-[a-z]+)?-\\[[0-9.]+px\\]/]",
        message:
          "No arbitrary radii. Four steps: rounded-sm 8 · rounded-md 10 · rounded-lg 14 · rounded-full.",
      },
      {
        selector: "Literal[value=/\\bshadow-(\\[|2xs|xs|sm|md|lg|xl|2xl|inner)/]",
        message:
          "This app has no shadows. A card is its border; a floating layer is separated by the scrim behind it. See OVERLAY and SCRIM in src/lib/ds.ts.",
      },
      {
        selector: "TemplateElement[value.raw=/\\bshadow-(\\[|2xs|xs|sm|md|lg|xl|2xl|inner)/]",
        message:
          "This app has no shadows. A card is its border; a floating layer is separated by the scrim behind it. See OVERLAY and SCRIM in src/lib/ds.ts.",
      },
      {
        selector: "Property[key.name='boxShadow']",
        message:
          "This app has no shadows. For a focus ring use :focus-visible, which globals.css already applies to everything focusable.",
      },
      {
        selector: "Literal[value=/\\bhover:(brightness|opacity|-?translate)-/]",
        message:
          "Hover is a colour, not a filter or a lift. brightness() does nothing to a white or transparent element. Use the hover classes on a btn() variant, or hover:bg-surface2.",
      },
      {
        selector: "TemplateElement[value.raw=/\\bhover:(brightness|opacity|-?translate)-/]",
        message:
          "Hover is a colour, not a filter or a lift. brightness() does nothing to a white or transparent element. Use the hover classes on a btn() variant, or hover:bg-surface2.",
      },
      {
        selector: "Literal[value=/\\bdisabled:opacity-/]",
        message:
          "Disabled has its own colours, not a faded copy: disabled:bg-disabled-bg disabled:text-disabled-fg. opacity-50 over an orange fill lands under the 3:1 floor WCAG 1.4.11 sets for a control.",
      },
      {
        selector: "TemplateElement[value.raw=/\\bdisabled:opacity-/]",
        message:
          "Disabled has its own colours, not a faded copy: disabled:bg-disabled-bg disabled:text-disabled-fg. opacity-50 over an orange fill lands under the 3:1 floor WCAG 1.4.11 sets for a control.",
      },
      {
        selector: "Literal[value=/\\bfont-(medium|bold|black|thin|light)\\b/]",
        message:
          "Three weights: font-normal 400 · font-semibold 600 · font-extrabold 800. Anything else is a fourth guess.",
      },
      {
        selector: "TemplateElement[value.raw=/\\bfont-(medium|bold|black|thin|light)\\b/]",
        message:
          "Three weights: font-normal 400 · font-semibold 600 · font-extrabold 800. Anything else is a fourth guess.",
      },
    ],
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  designSystem,
];

export default eslintConfig;
