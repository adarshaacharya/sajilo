import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

/** A screen nested inside a tab (an open tool, a Keeper editor). While one is
 * set, the header shows its title and the back button closes it, instead of
 * leaving the tab. */
export type HeaderInner = { title: string; onBack: () => void };

const HeaderSlotContext = createContext<{
  slot: ReactNode;
  setSlot: (node: ReactNode) => void;
  inner: HeaderInner | null;
  setInner: (inner: HeaderInner | null) => void;
} | null>(null);

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);
  const [inner, setInner] = useState<HeaderInner | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot, inner, setInner }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

/** Mount a route-specific control in the header bar (e.g. refresh). */
export function useHeaderSlot(node: ReactNode) {
  const ctx = useContext(HeaderSlotContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSlot(node);
    return () => ctx.setSlot(null);
  }, [ctx, node]);
}

export function useHeaderSlotContent(): ReactNode {
  return useContext(HeaderSlotContext)?.slot ?? null;
}

/** Declare the inner screen currently open, or `null` for the tab's root.
 * `onBack` may be a fresh closure every render: it is read through a ref, so
 * only the title decides when the header updates (and a render can't loop). */
export function useHeaderInner(inner: HeaderInner | null) {
  const setInner = useContext(HeaderSlotContext)?.setInner;
  const onBack = useRef(inner?.onBack);
  onBack.current = inner?.onBack;
  const title = inner?.title ?? null;
  useEffect(() => {
    if (!setInner) return;
    setInner(title === null ? null : { title, onBack: () => onBack.current?.() });
    return () => setInner(null);
  }, [setInner, title]);
}

export function useHeaderInnerContent(): HeaderInner | null {
  return useContext(HeaderSlotContext)?.inner ?? null;
}
