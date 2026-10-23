import { useRef } from "react";

/**
 * Whether the game was already over when its screen opened. Play from the
 * start screen then means a new game, with its level to choose, not the last
 * finished board; a game that ends while the screen is open still shows its
 * result. `over` is `undefined` while the game is loading; `forget` is for
 * starting a new one.
 */
export function useOverOnOpen(over: boolean | undefined) {
  const opened = useRef<boolean | null>(null);
  if (opened.current === null && over !== undefined) opened.current = over;
  return {
    overOnOpen: opened.current === true,
    forget: () => {
      opened.current = false;
    },
  };
}
