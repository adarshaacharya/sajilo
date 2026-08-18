import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const HeaderSlotContext = createContext<{
  slot: ReactNode;
  setSlot: (node: ReactNode) => void;
} | null>(null);

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot }}>{children}</HeaderSlotContext.Provider>
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
