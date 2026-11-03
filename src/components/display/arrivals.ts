"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

/**
 * Card entrances on a board screen.
 *
 * A card fades in when a post arrives on the board — once. It used to fade in
 * whenever its component mounted, and the shared screen remounts cards it has
 * already shown all the time: the balanced wall groups cards into rows, and a
 * new post moves cards from one row to the next (React cannot move a component
 * between parents, so it rebuilds it); past a dozen posts the wall switches to
 * its wrapping composition and rebuilds every card; a layout change does the
 * same. Each rebuild replayed the fade from transparent, so cards that were
 * already on the wall blinked out and back in — the whole wall at once on the
 * thirteenth post. The board looked like it was flickering.
 *
 * The screen now remembers which cards it has put up, and only a card it has
 * not shown yet gets the entrance. A card that leaves the board (hidden,
 * deleted) is forgotten, so it arrives again if it is restored.
 */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ShownCards = createContext<Set<string> | null>(null);

/** Scopes the memory of shown cards to one board screen. */
export const ShownCardsProvider = ShownCards.Provider;

/**
 * The set of cards this screen has shown, for `ShownCardsProvider`. `ids` is
 * every card currently on the board; any other id is forgotten after commit.
 */
export function useShownCards(ids: readonly string[]): Set<string> {
  const [shown] = useState(() => new Set<string>());
  const key = ids.join(",");
  // A parent's layout effects run after its children's, so the cards mounted
  // in this commit have already recorded themselves by the time this prunes.
  useIsoLayoutEffect(() => {
    const current = new Set(ids);
    for (const id of shown) if (!current.has(id)) shown.delete(id);
    // `key` is `ids` by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown;
}

/**
 * Whether this card should play its entrance: true when it arrives on the
 * screen, false when the layout merely rebuilt a card already shown. Decided
 * once per mount, so a card mid-fade keeps its animation through re-renders.
 * Outside a provider (the results export, the focus overlay) every mount
 * enters, as before.
 */
export function useCardEntrance(id: string): boolean {
  const shown = useContext(ShownCards);
  const [entering] = useState(() => !shown?.has(id));
  useIsoLayoutEffect(() => {
    shown?.add(id);
  }, [shown, id]);
  return entering;
}
