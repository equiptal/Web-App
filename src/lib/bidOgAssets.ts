/**
 * Assets for the generated bid-link card image (`/bid/[token]/og`).
 *
 * Everything here is INLINE on purpose. The image is rendered inside a Lambda in response to an unfurl
 * bot that will wait a second or two at most, and `public/` is not reliably readable from the filesystem
 * on Amplify's SSR runtime. A `fetch` back to our own origin would work but adds a round trip to the
 * one request that must not be slow. So the logo travels in the bundle as a string.
 */

/**
 * The wordmark from `public/moedatech-logo.svg`, with the fill left as a parameter.
 *
 * The source file is a single-colour mark (`var(--navy)`) drawn for light backgrounds. The card is navy,
 * so it is re-filled white here rather than shipping a second asset that could drift from the first.
 */
const LOGO_PATHS = [
  "M544.48235,139.19264c-10.66597-3.54671-38.23046-3.16793-48.69839,1.16213-14.97023,6.18953-20.14395,21.61598-18.89571,36.95636h-64.64133v-3.90825h49.37845v-34.5546l-1.35154-1.35154h-54.75877c-.72314,0-7.26559,1.83362-8.50522,2.26404-16.14097,5.71607-22.13252,21.96034-20.66906,38.12716h-29.06236v-10.8898c0-13.17964-15.69331-30.06955-29.17428-30.06955h-60.59532v35.89753h53.86345v4.49362h-53.86345v35.89753l279.99205.26686c33.65928,0,41.67381-62.7733,6.9815-74.2915ZM530.76898,177.5866h-17.94879v-4.49362h17.94879v4.49362Z",
  "M541.03685,99.23785h-13.35182v15.56422l-.75755-.18941h-14.31597c-3.69304,0-8.45352,5.1307-9.11639,10.53682h23.05358v.02585h23.17417v-17.25145c0-3.98575-4.70889-8.68602-8.68602-8.68602ZM539.35817,114.80207h-1.29989v-5.19096h1.29989v5.19096Z",
  "M332.78305,37.45733l-1.33192-5.96993,8.04267,1.44935,4.19553,13.10911c12.22308,1.58726,40.94335,11.37777,39.30227,32.71546-1.64108,21.3377-24.53061,36.0801-24.53061,36.0801,0,0-14.12832,7.47455-19.25582,10.61382,2.00743-4.07129,17.35417-54.26336-8.2033-75.09522l-42.62412-17.52376,5.51773-10.81331,38.88756,15.43438Z",
  "M228.94132,43.70562l-161.61386,95.10645h47.12141c12.90599,0,29.17224,16.14364,29.17224,29.16673l.02231,9.75195,19.09153-.14503v-40.38977h34.5553l1.34858,1.34865v74.93953L.0005,213.48213l.02434-35.18297h107.69797v-3.58882H0v-35.447C31.73005,123.48758,238.8893,0,238.8893,0l51.3064,19.55968c-.03901,0-5.65057,9.82433-6.16323,10.75503l-49.86867-15.0626-.06129-.01673.05571.02789,92.47076,40.0721c.64082,2.85865,4.37443,17.88791,4.37443,17.88791l-102.06209-29.51766Z",
  "M166.99182,100.99401h32.04549v24.18131h-52.75081v-3.47599c0-11.42758,9.27774-20.70532,20.70532-20.70532Z",
];

const LOGO_RECTS = [
  { x: 210.19428, y: 87.83419, width: 35.90615, height: 125.64995 },
  { x: 90.16372, y: 179.43285, width: 17.55908, height: 0.06136 },
];

const LOGO_POLYGONS = [
  "234.1638 16.44715 234.15822 16.45831 234.10251 16.43042 234.1638 16.44715",
  "512.02613 110.23168 512.02613 110.42109 511.26858 110.23168 512.02613 110.23168",
];

/** The wordmark as an SVG data URI in the given colour. Satori renders `<img>` from a data URI. */
export function logoDataUri(fill = "var(--surface)"): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 566.92913 213.48413">` +
    LOGO_PATHS.map((d) => `<path fill="${fill}" d="${d}"/>`).join("") +
    LOGO_RECTS.map((r) => `<rect fill="${fill}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join("") +
    LOGO_POLYGONS.map((p) => `<polygon fill="${fill}" points="${p}"/>`).join("") +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Brand palette, mirrored from `globals.css` (`--navy`, `--gold`, `--brand`). */
export const OG_COLORS = {
  navy: "var(--navy)",
  navyDeep: "var(--info-deep)",
  gold: "var(--gold)",
  amber: "var(--brand)",
  white: "var(--surface)",
} as const;
