/* eslint-disable no-restricted-syntax -- Mansour's own four colours, copied byte for byte from
   the `Mansour Kit` rig that runs on moedatech.net. They are deliberately outside this app's
   palette (the kit: he is *"grey on purpose so he sits on any brand colour"*), and
   `palette-drift.test.ts` exempts this file by name for the same reason. See the note below. */

"use client";

import "@/components/mansour.css";

/**
 * **Mansour** - the Moedatech agent, as the marketing site draws him.
 *
 * Owner, 2026-09-13: *"can u use this mansour kit that represent the agent, use it in the
 * processing and use it here for typing when u select a project and it auto fills the equipment
 * name, make it like this mansour is writing it"*.
 *
 * The path is the kit's `mansour look.svg` verbatim and the stylesheet is its `mansour.css`
 * verbatim - see the head of that file. This component is the thin part: the wrapper the CSS
 * expects, the size, and which of the three states he is in.
 *
 * ── The rules, from the kit's README, and where each is kept ────────────────────────────────────
 *  · INLINE, never an `<img>` - so it is a `<svg>` in this file's JSX and not a `next/image`.
 *  · `overflow: visible` on the svg - the sway rotates the whole body and the gear teeth leave the
 *    120x120 box. The stylesheet sets it; nothing here may clip him.
 *  · `aria-hidden` - he is decoration. Whatever he stands next to keeps its own label.
 *  · sized for 20px and up; 38px is what visitors meet on the home page.
 *  · reduced motion is already handled in the stylesheet, for every animation he has.
 *
 * ⚠️ **His four colours are the kit's and are written here as literals** (#9AA3AE gear, #6B737E
 * gear edge, #6E7075 body, #f3efea eyes). They are deliberately OUTSIDE this app's palette - he is
 * grey so that he sits on any brand colour - which is why `palette-drift.test.ts` exempts this file
 * by name, the same way it exempts the Gmail and WhatsApp marks. Do not "fix" them to tokens: a
 * recoloured Mansour is a different character from the one on moedatech.net.
 */
/**
 * The kit's four gaze POSES, `mansour-poses.json` verbatim - one matrix per eye.
 *
 * The kit's third way of using him (README): *"pause the idle animation on `.v4m-eye0` /
 * `.v4m-eye1` and animate their `transform` to the pose matrix"*. `viewer` = looks at the user,
 * `words` = reads along a line, `send` = looks down at a button, `rest` = neutral.
 *
 * ⚠️ **Copied, not derived.** These sixteen numbers are the rig's output; there is no formula here
 * to re-derive them from, and a matrix that is a digit out puts his eyes somewhere on his cheek.
 *
 * ⚠️ **`rest` is the same pair as the SVG's own `transform` attributes**, which is also where the
 * `v4mGaze0` / `v4mGaze1` keyframes start and end. If one of the three ever moves, all three move.
 */
const POSES = {
  viewer: ["matrix(0.964, 0, 0, 1, 49.871, 70)", "matrix(0.964, 0, 0, 1, 70.129, 70)"],
  words: [
    "matrix(0.713, 0.162, 0.03, 0.965, 33.379, 77.833)",
    "matrix(0.972, 0.033, 0.03, 0.965, 51.084, 79.888)",
  ],
  send: [
    "matrix(0.978, 0.09, 0.017, 0.865, 52.103, 88.772)",
    "matrix(0.946, -0.177, 0.017, 0.865, 72.322, 87.853)",
  ],
  rest: [
    "matrix(0.887, -0.318, 0.42, 0.855, 67.182, 54.457)",
    "matrix(0.664, -0.063, 0.42, 0.855, 83.49, 50.456)",
  ],
} as const;

export type MansourPose = keyof typeof POSES;

export function Mansour({
  size = 38,
  state,
  pose,
  className = "",
}: {
  /** Both sides of his box, in CSS pixels. 20 is his floor; 38 is the home page's. */
  size?: number;
  /**
   * `live` - working, a small bob. `waiting` - waiting on the renter, a slow lean-in.
   * `aiming` - eyes locked on a target, idle gaze paused. Absent: he simply idles.
   */
  state?: "live" | "waiting" | "aiming";
  /**
   * Hold his eyes on one of the kit's four poses instead of letting them wander.
   *
   * ⚠️ It is set as an inline STYLE and not by swapping the SVG's `transform` attribute: a style
   * wins over a presentation attribute, so the rest pose stays in the markup where the keyframes
   * expect it. `animation: "none"` beside it is the other half - without it the idle wander goes on
   * running and overrides the transform on its very next frame, which reads as him twitching back.
   */
  pose?: MansourPose;
  className?: string;
}) {
  const is = state ? ` is-${state}` : "";
  const held = (i: 0 | 1) => (pose ? { transform: POSES[pose][i], animation: "none" as const } : undefined);
  return (
    <span
      aria-hidden="true"
      className={`v4m-man${is}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
    >
      <span className="v4m-man-in">
        {/* ⚠️ The two `transform` attributes on the eyes are the REST pose, and the stylesheet's
            `v4mGaze0` / `v4mGaze1` keyframes start and end on exactly these matrices. Changing one
            without the other makes him jump at the loop point. */}
        <svg className="v4m-man-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <g className="v4m-man-body">
            <path
              className="v4m-gear"
              fillRule="evenodd"
              d="M101.69 61.44 L111.98 63.06 L111.98 76.94 L101.69 78.56 A42.56 42.56 0 0 1 97.44 90.24 L104.28 98.10 L95.36 108.72 L86.44 103.35 A42.56 42.56 0 0 1 75.67 109.57 L75.86 119.99 L62.20 122.39 L58.81 112.54 A42.56 42.56 0 0 1 46.57 110.38 L40.02 118.48 L28.00 111.55 L31.74 101.83 A42.56 42.56 0 0 1 23.75 92.30 L13.53 94.30 L8.78 81.26 L17.90 76.22 A42.56 42.56 0 0 1 17.90 63.78 L8.78 58.74 L13.53 45.70 L23.75 47.70 A42.56 42.56 0 0 1 31.74 38.17 L28.00 28.45 L40.02 21.52 L46.57 29.62 A42.56 42.56 0 0 1 58.81 27.46 L62.20 17.61 L75.86 20.01 L75.67 30.43 A42.56 42.56 0 0 1 86.44 36.65 L95.36 31.28 L104.28 41.90 L97.44 49.76 A42.56 42.56 0 0 1 101.69 61.44 Z M96.48 70.00 A36.48 36.48 0 1 0 23.52 70.00 A36.48 36.48 0 1 0 96.48 70.00 Z"
              fill="#9AA3AE"
              stroke="#6B737E"
              strokeWidth="1.14"
              strokeLinejoin="round"
            />
            <circle cx="60" cy="70" r="38" fill="#6E7075" />
            <g className="v4m-eye v4m-eye0" style={held(0)} transform="matrix(0.887, -0.318, 0.42, 0.855, 67.182, 54.457)">
              <g className="v4m-lid">
                <rect x="-3.534" y="-7.828" width="7.068" height="15.656" rx="3.534" fill="#f3efea" />
              </g>
            </g>
            <g className="v4m-eye v4m-eye1" style={held(1)} transform="matrix(0.664, -0.063, 0.42, 0.855, 83.49, 50.456)">
              <g className="v4m-lid">
                <rect x="-3.534" y="-7.828" width="7.068" height="15.656" rx="3.534" fill="#f3efea" />
              </g>
            </g>
          </g>
        </svg>
      </span>
    </span>
  );
}
