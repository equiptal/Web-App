/**
 * The going rate per equipment subtype, measured once against the production database.
 *
 * ── Why a frozen table and not an endpoint ──────────────────────────────────────────────────
 *
 * The governance board compares what a renter paid against "the going rate". It was computing
 * that from the renter's OWN bids for the machine type, three bids minimum, which answers "what
 * was I quoted" and not "what does this cost". On a subtype where he asked three suppliers and
 * all three were dear, the card told him he was at market when he was not.
 *
 * A platform-wide median is the honest number and no endpoint returns one. Rather than leave the
 * card wrong, it was measured once, read-only, through `scripts/data-job/` in the backend repo
 * (the only in-VPC path to the database) and the result is below.
 *
 * ── What it is, exactly ─────────────────────────────────────────────────────────────────────
 *
 * Measured 3 October 2026 against `moedatech_prod`. Every priced bid on the platform, reduced to a
 * per-day rate with the app's own divisors (PER_DAY 1, PER_WEEK 6, PER_MONTH 26), grouped by the
 * request's taxonomy subtype. 2,864 priced bids read; 23 subtypes published, 21 held back.
 *
 *   `med`   the median per-day rate
 *   `n`     how many bids it was taken over
 *   `firms` how many distinct supplier companies those bids came from
 *   `lo` / `hi`  the QUARTILES, not the extremes
 *
 * ⚠️ **It is a SNAPSHOT, and the board must say so.** A market rate from a fixed date is a
 * different claim from a live one, and a card that blurs the two is worse than one that admits
 * the gap. {@link MARKET_RATES_MEASURED} is exported so every surface that reads this can date it.
 *
 * ⚠️ **A band is published only at 8+ bids from 3+ separate companies.** At five bids and one
 * company the first run returned entries like `n: 9, firms: 1, lo: 1, hi: 15000` — not a market
 * rate, one firm quoting nonsense into an empty category. And the band is the QUARTILES because
 * at the deciles one subtype came back `lo: 288, hi: 12000` around a median of 538, a band forty
 * times its own middle, which squashes every real bid into the first pixel of the price rail.
 *
 * ⚠️ **It is keyed by taxonomy subtype id.** A subtype that is renamed keeps its rate; a subtype
 * that is SPLIT silently inherits its parent's, which is the way this file goes quietly wrong.
 * Re-measure rather than hand-edit.
 */

/** One subtype's band, as measured. */
export interface MarketRate {
  med: number;
  n: number;
  firms: number;
  lo: number;
  hi: number;
}

/** The date the table below was measured. Printed wherever the band is shown. */
export const MARKET_RATES_MEASURED = "2026-10-03";

export const MARKET_RATES: Record<string, MarketRate> = {
  "9eadefb3-d967-4d6e-9d8a-32e6af50f243": { med: 692, n: 666, firms: 55, lo: 577, hi: 846 },
  "0f58872b-1bfa-4b84-86db-efe647390586": { med: 1385, n: 589, firms: 47, lo: 885, hi: 1731 },
  "fc2c6a32-8661-40a2-8454-98b13198bd0a": { med: 538, n: 363, firms: 27, lo: 500, hi: 700 },
  "67ee5062-4067-44b3-8008-91b694a8ae1b": { med: 631, n: 232, firms: 26, lo: 538, hi: 769 },
  "b844e747-e033-447c-b6f1-4012ebe9dfc8": { med: 490, n: 188, firms: 22, lo: 346, hi: 635 },
  "883db2ef-685c-4c8c-8f69-e55295ed00d4": { med: 267, n: 94, firms: 12, lo: 135, hi: 538 },
  "2cc1fd8b-ea29-4768-b3ab-4e42261daedf": { med: 400, n: 85, firms: 14, lo: 327, hi: 600 },
  "4ce04c7d-62df-4d42-940b-8b4cedc06cae": { med: 1000, n: 72, firms: 9, lo: 97, hi: 1731 },
  "1668518a-98af-466d-8713-2f8af1fa2dd7": { med: 269, n: 68, firms: 12, lo: 154, hi: 385 },
  "ec7a4c78-09a0-4f21-967c-6f4f37443da2": { med: 558, n: 65, firms: 12, lo: 346, hi: 825 },
  "6cd38327-5b86-4fd0-bde5-1a5af22c423e": { med: 692, n: 62, firms: 9, lo: 68, hi: 1000 },
  "c8dfc2ad-675b-4e88-a6f1-5c3d42cedf3a": { med: 587, n: 44, firms: 8, lo: 538, hi: 700 },
  "8a2bfda7-94ce-4ccb-a4f5-086c03a4d124": { med: 923, n: 43, firms: 10, lo: 885, hi: 1000 },
  "474099fc-dd2b-484f-804b-55f2855f03b7": { med: 538, n: 35, firms: 8, lo: 481, hi: 600 },
  "996cf1b0-c10b-498c-9d1e-ca6c57d5a782": { med: 990, n: 26, firms: 7, lo: 60, hi: 1500 },
  "534a4e3b-75bc-4d7f-8d29-93d140732eae": { med: 962, n: 24, firms: 10, lo: 65, hi: 1654 },
  "4bf507b6-ac46-4562-a301-7779ff286d3a": { med: 846, n: 23, firms: 3, lo: 731, hi: 1038 },
  "dbf784b9-716f-40be-ad72-297be6565e4a": { med: 202, n: 20, firms: 5, lo: 67, hi: 360 },
  "d5121356-a620-475d-9cb0-f58605f94984": { med: 1279, n: 18, firms: 3, lo: 53, hi: 5769 },
  "8531fcb5-df56-4129-9d23-2fe3492b9d0f": { med: 101, n: 18, firms: 9, lo: 88, hi: 173 },
  "17025de0-be4e-457b-a0da-10b98cb9f623": { med: 2885, n: 15, firms: 4, lo: 192, hi: 4423 },
  "dfeae322-78bf-4460-9132-4fe4090b5a38": { med: 769, n: 13, firms: 8, lo: 577, hi: 846 },
  "532dece8-ec83-45bd-a694-da1d26eaeaff": { med: 538, n: 11, firms: 4, lo: 250, hi: 1269 },
};
