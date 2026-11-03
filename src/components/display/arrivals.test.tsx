import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShownCardsProvider, useCardEntrance, useShownCards } from "./arrivals";

function Card({ id }: { id: string }) {
  const entering = useCardEntrance(id);
  return <div data-testid={id} data-entering={entering ? "yes" : "no"} />;
}

/** Cards grouped into rows keyed by position, as the balanced projector wall does. */
function Wall({ rows }: { rows: string[][] }) {
  const shown = useShownCards(rows.flat());
  return (
    <ShownCardsProvider value={shown}>
      {rows.map((row, i) => (
        <div key={i}>
          {row.map((id) => (
            <Card key={id} id={id} />
          ))}
        </div>
      ))}
    </ShownCardsProvider>
  );
}

const wall = (rows: string[][]) => (
  <StrictMode>
    <Wall rows={rows} />
  </StrictMode>
);
const entering = (id: string) => screen.getByTestId(id).dataset.entering;

afterEach(cleanup);

describe("card entrances", () => {
  it("lets every card on a freshly opened board enter", () => {
    render(wall([["a", "b"], ["c"]]));
    expect(["a", "b", "c"].map(entering)).toEqual(["yes", "yes", "yes"]);
  });

  it("doesn't replay the entrance of a card rebuilt in another row", () => {
    const { rerender } = render(wall([["a", "b"], ["c", "d"]]));
    const before = screen.getByTestId("b");

    // A new post at the front pushes "b" into the second row.
    rerender(wall([["n", "a"], ["b", "c", "d"]]));

    expect(screen.getByTestId("b")).not.toBe(before); // really rebuilt
    expect(entering("b")).toBe("no");
    expect(entering("n")).toBe("yes");
  });

  it("keeps a card's entrance through re-renders while it is still on the board", () => {
    const { rerender } = render(wall([["a"]]));
    rerender(wall([["a"]]));
    expect(entering("a")).toBe("yes");
  });

  it("lets a card that left the board enter again when it comes back", () => {
    const { rerender } = render(wall([["a", "b"]]));
    rerender(wall([["a"]])); // hidden
    rerender(wall([["b"], ["a"]])); // restored, pushing "a" to the next row
    expect(entering("b")).toBe("yes");
    expect(entering("a")).toBe("no");
  });

  it("enters on every mount outside a board screen", () => {
    const { unmount } = render(<Card id="a" />);
    unmount();
    render(<Card id="a" />);
    expect(entering("a")).toBe("yes");
  });
});
