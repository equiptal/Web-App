/* eslint-disable no-restricted-syntax -- Gmail's and WhatsApp's own brand values; see the note on
   the hexes at the foot of this comment. The same exemption, for the same reason, that
   `mail-chrome.tsx` carries for Outlook's and Gmail's compose chrome. */

/**
 * The real mark of a send channel: Outlook, Gmail, WhatsApp.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-12: *"add icons of outlook-gmail-whatsapp to any place mention them so use it as
 * global ui element"*.
 *
 * 🔴 **Three channels were drawn as three house glyphs**, and two of them said the same word. The
 * channel row offered `mail` for Outlook and `alternate_email` for Gmail: both are envelopes, both
 * are grey, and the only thing telling a renter which button sends through which account was the
 * label under his eye. WhatsApp had `chat`, which is every chat app there is.
 *
 * A brand mark answers that at a glance, and it is the one part of this row a renter already knows
 * before he reads anything. The logo also travels further than a glyph: the same three names appear
 * on the channel row, in the send confirmation's destination blocks and in the connect note, and
 * they were being drawn three different ways.
 *
 * ⚠️ **ONE component, so the three can never drift apart again.** Outlook already had a mark
 * (`/outlook-logo.webp`, added 2026-09-12) and it was being written out by hand at three call
 * sites, each with its own `className` and its own `eslint-disable`. Gmail and WhatsApp had none.
 *
 * ── Why the two new ones are INLINE, and Outlook is not ──────────────────────────────────────────
 *
 * ⚠️ Gmail's and WhatsApp's marks are simple geometry, so they are drawn as SVG in this file: they
 * scale to any size, they need no network round trip, and they cannot arrive late on the one row a
 * renter is reading while he decides where his request goes. Outlook's is a raster file already in
 * `public/` and re-drawing it by hand would be a second copy of somebody else's logo to maintain.
 *
 * ⚠️ **Full colour in every state, including on the navy chip.** A brand mark that recolours is not
 * that brand's mark. The channel chip inverts its own text and its own glyphs when picked; these
 * marks are deliberately left out of that, which is also how a person recognises them.
 *
 * ⚠️ The hexes here are third-party BRANDS, not this app's palette. `palette-drift.test.ts` allows
 * them by value in its `BRANDS` set, the same way it has always allowed WhatsApp's green and the
 * Google Play mark's yellow. Do not add a house colour to this file to get past that rule.
 */

export type ChannelName = "outlook" | "gmail" | "whatsapp";

export function ChannelMark({
  name,
  size = 16,
  className = "",
}: {
  name: ChannelName;
  /** Drawn to a SQUARE of this many pixels. Gmail's envelope is wider than it is tall and is
   *  letterboxed inside that square, so three marks in a row sit on one optical baseline. */
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (name === "outlook") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/outlook-logo.webp"
        alt="Outlook"
        style={box}
        className={`flex-none object-contain ${className}`}
      />
    );
  }

  if (name === "gmail") {
    return (
      <svg
        viewBox="0 0 512 384"
        style={box}
        role="img"
        aria-label="Gmail"
        className={`flex-none ${className}`}
      >
        {/* The envelope, in the order Google draws it: the two inner walls, the two flaps, then the
            fold that sits over both. Every fill is Gmail's own. */}
        <path fill="#4285f4" d="M34.9 384h81.5V186.2L0 98.9v250.2C0 368.4 15.7 384 34.9 384Z" />
        <path fill="#34a853" d="M395.6 384h81.5c19.3 0 34.9-15.6 34.9-34.9V98.9l-116.4 87.3V384Z" />
        <path fill="#fbbc04" d="M395.6 34.9v151.3L512 98.9V52.4c0-43.2-49.3-67.8-83.8-41.9l-32.6 24.4Z" />
        <path fill="#ea4335" d="M116.4 186.2V34.9L256 139.6 395.6 34.9v151.3L256 290.9 116.4 186.2Z" />
        <path fill="#c5221f" d="M0 52.4v46.5l116.4 87.3V34.9L83.8 10.5C49.2-15.4 0 9.2 0 52.4Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      style={box}
      role="img"
      aria-label="WhatsApp"
      className={`flex-none ${className}`}
    >
      {/* One path, one colour: the speech bubble with the handset inside it. `#25d366` is the value
          `palette-drift.test.ts` has allowed since 2026-09-06, for the button that opens WhatsApp. */}
      <path
        fill="#25d366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
      />
    </svg>
  );
}
