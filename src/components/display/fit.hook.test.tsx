import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useFitDensity } from "./fit";

/**
 * The fit sets `--density` on the board, and the board's padding follows it.
 * Watching the board for resizes therefore re-ran the fit after each of its
 * own changes; where two densities each pushed the other, that never ended
 * and the shared screen jittered every frame. The observer must watch the
 * frame around the board, whose size the fit cannot change.
 */
function Board() {
  const ref = useRef<HTMLDivElement>(null);
  useFitDensity(true, ref, "k");
  return (
    <div className="ngg-stage" data-testid="stage">
      <div ref={ref} data-testid="board" />
    </div>
  );
}

const observed: Element[] = [];
class FakeResizeObserver {
  observe(el: Element) {
    observed.push(el);
  }
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  observed.length = 0;
  vi.unstubAllGlobals();
});

describe("useFitDensity", () => {
  it("watches the frame around the board, not the board it resizes", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { getByTestId } = render(<Board />);
    expect(observed).toEqual([getByTestId("stage")]);
  });
});
