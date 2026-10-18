import { afterEach, describe, expect, it } from "vitest";
import { fitDensity } from "./fit";

/**
 * jsdom has no layout, so each fitted region gets a scripted one: its content
 * height at a given density. Wrapping layouts shrink in both directions as the
 * density drops, so content height falls with its square.
 */
function board({ unit = 20, height = 1080, regions }: { unit?: number; height?: number; regions: ((d: number) => number)[] }) {
  const root = document.createElement("div");
  root.style.fontSize = `${unit}px`;
  Object.defineProperty(root, "clientHeight", { value: height });
  const density = () => Number(root.style.getPropertyValue("--density") || 1);
  const layouts = { count: 0 };
  regions.forEach((contentAt, i) => {
    const el = document.createElement("div");
    el.setAttribute("data-fit", "");
    Object.defineProperty(el, "clientHeight", { value: 800 });
    Object.defineProperty(el, "scrollHeight", {
      get: () => {
        if (i === 0) layouts.count++;
        return Math.max(800, Math.ceil(contentAt(density())));
      },
    });
    root.appendChild(el);
  });
  document.body.appendChild(root);
  return { root, layouts, applied: density };
}

const area = (base: number) => (d: number) => base * d * d;

afterEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
});

describe("fitDensity", () => {
  it("keeps full size while everything fits", () => {
    const { root, applied } = board({ regions: [area(700)] });
    expect(fitDensity(root, 1)).toBe(1);
    expect(applied()).toBe(1);
  });

  it("shrinks to the largest whole step at which everything fits", () => {
    // 2000·d² ≤ 800 holds up to d ≈ 0.632.
    const { root, applied } = board({ regions: [area(2000)] });
    expect(fitDensity(root, 1)).toBe(0.62);
    expect(applied()).toBe(0.62);
    // The answer doesn't depend on where the search starts.
    expect(fitDensity(root, 0.54)).toBe(0.62);
    expect(fitDensity(root, 0.9)).toBe(0.62);
  });

  it("keeps every fitted region on screen, not just the first", () => {
    const { root } = board({ regions: [area(500), (d) => (d <= 0.7 ? 800 : 2000)] });
    expect(fitDensity(root, 1)).toBe(0.7);
  });

  it("stops at the legibility floor and leaves the rest to scroll", () => {
    // 1080p: the floor is ~10px of type (0.93% of the height), so 20px × 0.5.
    const { root } = board({ regions: [area(50000)] });
    const d = fitDensity(root, 1);
    expect(d).toBe(0.5);
    expect(20 * d).toBeGreaterThanOrEqual(0.99 * 1080 * 0.0093);
  });

  it("scales the floor with the screen, so a 4K wall isn't shrunk to 1080p pixel sizes", () => {
    const { root } = board({ unit: 34, height: 2160, regions: [area(50000)] });
    expect(fitDensity(root, 1)).toBe(0.6); // 20px of type on a 2160px-high screen
  });

  it("never goes below 8 physical pixels on a low-resolution projector", () => {
    const { root } = board({ unit: 15, height: 720, regions: [area(50000)] });
    expect(fitDensity(root, 1)).toBe(0.54); // 8px, not 0.93% × 720 = 6.7px
  });

  it("lets a scaled laptop screen reach the 1080p composition", () => {
    // 150% scaling reports 1280×720 but drives 1920×1080 physical pixels.
    Object.defineProperty(window, "devicePixelRatio", { value: 1.5, configurable: true });
    const { root } = board({ unit: 15, height: 720, regions: [area(50000)] });
    expect(fitDensity(root, 1)).toBe(0.46);
  });

  it("re-checks an unchanged board in a few layouts, and one more card in a few more", () => {
    const { root, layouts } = board({ regions: [area(2000)] });
    fitDensity(root, 1);

    layouts.count = 0;
    expect(fitDensity(root, 0.62)).toBe(0.62);
    expect(layouts.count).toBeLessThanOrEqual(3);

    // One more card: the answer drops a step.
    const more = board({ regions: [area(2100)] });
    more.layouts.count = 0;
    expect(fitDensity(more.root, 0.62)).toBe(0.6);
    expect(more.layouts.count).toBeLessThanOrEqual(3);
  });
});
