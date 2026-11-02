import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useCallback, useState } from "react";
import { useSettings } from "../context/settings-context";
import { moveTab, tabGroups, withTabGroups } from "../lib/tab-arrange";
import { Icon } from "./icon";
import { TABS } from "./tab-bar";

/**
 * Drag a tab between the tab bar and More, where they are: a tab on the bar
 * dropped on the More button or the More list goes under More; a tab from
 * More dropped on the bar takes that place, pushing the bar's last tab under
 * More when it is full. Today and the More button stay where they are.
 *
 * A drop target's id says where a drop lands: `bar:/news` and `more:/radio`
 * are "before this tab"; anything else after the prefix (`more:button`,
 * `more:list`) is the end of that list.
 */
export const DROP_BAR = "bar:";
export const DROP_MORE = "more:";

/** Whatever the pointer is over wins; between targets, the nearest. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

export function TabDragProvider({ children }: { children: ReactNode }) {
  const { t, setModules } = useSettings();
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    // A tab is a link: a click without travel still opens it.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = useCallback(({ active }: DragStartEvent) => {
    setDragging(String(active.id));
  }, []);

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setDragging(null);
      if (!over) return;
      const to = String(active.id);
      const target = String(over.id);
      const group = target.startsWith(DROP_BAR)
        ? "bar"
        : target.startsWith(DROP_MORE)
          ? "more"
          : null;
      if (!group) return;
      const place = target.slice(group === "bar" ? DROP_BAR.length : DROP_MORE.length);
      if (place === to) return;
      setModules((current) => {
        const groups = tabGroups(TABS, current);
        // Today is first whatever happens: dropped on it, a tab goes first after it.
        const before = !place.startsWith("/") ? undefined : place === "/" ? groups.bar[0] : place;
        return withTabGroups(current, TABS, moveTab(groups, to, group, before));
      });
    },
    [setModules],
  );

  const tab = dragging ? TABS.find((item) => item.to === dragging) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {tab ? (
          <div className="tab-drag-chip">
            <Icon name={tab.icon} className="size-3.5" />
            <span>{t(tab.labelKey)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * A tab that can be picked up and dropped on: the ref goes on its element,
 * the listeners too. `drag` false for Today and More, which only take drops.
 */
export function useTabDrag(to: string, dropId: string, drag = true) {
  const draggable = useDraggable({ id: to, disabled: !drag });
  const droppable = useDroppable({ id: dropId });
  const ref = useCallback(
    (node: HTMLElement | null) => {
      draggable.setNodeRef(node);
      droppable.setNodeRef(node);
    },
    [draggable.setNodeRef, droppable.setNodeRef],
  );
  const lifted = draggable.active !== null;
  return {
    ref,
    // Listeners only: the attributes would make a link read as a button.
    handlers: drag ? (draggable.listeners ?? {}) : {},
    isDragging: draggable.isDragging,
    // Lit only for another tab coming in, not the one held over its own place.
    isOver: droppable.isOver && lifted && draggable.active?.id !== to,
    lifted,
  };
}

export function useTabDropZone(id: string) {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  return { ref: setNodeRef, isOver: isOver && active !== null };
}
