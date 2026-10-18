"use client";

import { useEffect, useLayoutEffect, useReducer, useState, type RefObject } from "react";

/**
 * Fit-to-screen for the shared screen.
 *
 * A projector is read by a room, not scrolled by it: the whole session should
 * be on the wall at once. The board's content area is sized in `em` of a
 * `--density` multiplier, and this picks the largest density at which every
 * scrolling region inside the board shows all of its content. Cards, gaps and
 * column widths shrink together, so a smaller density also fits more cards per
 * row rather than only making them shorter.
 *
 * It stops at a legibility floor. A session too large to fit above it scrolls,
 * which is the exception rather than the rule. The facilitator can still focus
 * any single card to show it full size.
 */

/**
 * The legibility floor: the smallest type unit before the board scrolls
 * instead. How readable text is from the room depends on its share of the
 * screen's height, so the floor is that share — 10px on a 1080p screen, where
 * card text is then ≈13.5px — and it scales with the screen. A laptop at 150%
 * scaling reports 1280×720 but sends a 1080p picture, so it gets the 1080p
 * composition rather than a needlessly large one.
 */
const MIN_UNIT_SHARE = 0.0093;
/** …but never below this many physical pixels, under which glyphs break up on a low-resolution projector. */
const MIN_UNIT_DEVICE_PX = 8;
/** Densities are whole steps, so one more card doesn't nudge every card by a pixel. */
const STEP = 0.02;

/** Marks a scrolling region whose content the fit must keep on screen. */
export const FIT_ATTR = { "data-fit": "" } as const;

/**
 * The header shrinks too, but gently and never below three quarters, so the
 * title and join code stay prominent.
 */
export const HEADER_FACTOR = "max(0.75, 0.5 + 0.5 * var(--density, 1))";

const MAX_STEP = Math.round(1 / STEP);
const atStep = (k: number) => Number((k * STEP).toFixed(2));

/**
 * Measure the board at candidate densities (by setting `--density` on `root`
 * directly, before paint) and return the largest one at which nothing inside a
 * `[data-fit]` region overflows. Leaves `--density` set to the result.
 *
 * Every candidate costs a full layout of the board, so the search starts from
 * `current`: after one card arrives or leaves the answer is almost always the
 * same density or the step next to it, which takes two or three layouts.
 */
export function fitDensity(root: HTMLElement, current: number): number {
  const regions = Array.from(root.querySelectorAll<HTMLElement>("[data-fit]"));
  const unit = parseFloat(getComputedStyle(root).fontSize);
  const settle = (d: number) => {
    root.style.setProperty("--density", String(d));
    return d;
  };
  if (regions.length === 0 || !unit) return settle(1);

  const minUnit = Math.max(MIN_UNIT_DEVICE_PX / (window.devicePixelRatio || 1), root.clientHeight * MIN_UNIT_SHARE);
  // Rounded up to a whole step, so text doesn't end up under the floor — give
  // or take a quarter step (≈0.5%), so a floor of 0.5005 is 0.5 and not a
  // whole step larger, which would cost a full screen a row of cards.
  const floor = Math.min(MAX_STEP, Math.ceil(minUnit / unit / STEP - 0.25));
  const fits = (k: number) => {
    root.style.setProperty("--density", String(atStep(k)));
    return regions.every((el) => el.scrollHeight <= el.clientHeight + 1);
  };

  if (floor >= MAX_STEP || fits(MAX_STEP)) return settle(1);
  const cur = Math.min(MAX_STEP - 1, Math.max(floor, Math.round(current / STEP)));
  let lo: number; // a step that fits
  let hi: number; // a step that doesn't
  if (fits(cur)) {
    if (cur + 1 === MAX_STEP || !fits(cur + 1)) return settle(atStep(cur)); // unchanged
    lo = cur + 1;
    hi = MAX_STEP;
  } else {
    if (cur > floor && fits(cur - 1)) return settle(atStep(cur - 1)); // one step smaller
    // Too much for one screen even at the smallest legible size: stay there and scroll.
    if (cur === floor || !fits(floor)) return settle(atStep(floor));
    lo = floor;
    hi = cur - 1;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return settle(atStep(lo));
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keep `root`'s content fitted. Re-fits when `layoutKey` changes (cards arrive
 * or leave, the layout or room state changes) and whenever the board area
 * resizes, the web font arrives or an image loads, all of which change how
 * much room the content takes. Runs before paint, so nobody sees the board
 * overflow and then shrink. Renders that change none of these (a clock tick, a
 * participant count) don't pay for a measurement.
 */
export function useFitDensity(enabled: boolean, rootRef: RefObject<HTMLElement | null>, layoutKey: string): number {
  const [density, setDensity] = useState(1);
  const [tick, remeasure] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(root);
    root.addEventListener("load", remeasure, true); // <img> load doesn't bubble; capture does
    let live = true;
    document.fonts?.ready.then(() => live && remeasure()).catch(() => {});
    return () => {
      live = false;
      ro.disconnect();
      root.removeEventListener("load", remeasure, true);
    };
  }, [enabled, rootRef]);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const next = fitDensity(root, density);
    if (next !== density) setDensity(next);
    // `density` is the search's starting point, not a reason to search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rootRef, layoutKey, tick]);

  return enabled ? density : 1;
}
