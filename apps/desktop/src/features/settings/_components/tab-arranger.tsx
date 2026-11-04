import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Menu, MenuItem } from "../../../shared/components/menu";
import { TABS } from "../../../shared/components/tab-bar";
import { useSettings } from "../../../shared/context/settings-context";
import { digits } from "../../../shared/lib/numerals";
import {
  TAB_GROUPS as GROUPS,
  type TabGroup as Group,
  type TabGroups as Groups,
  moveTab,
  tabGroups,
  withTabGroups,
} from "../../../shared/lib/tab-arrange";
import { MAX_BAR_TABS } from "../../../shared/lib/tab-layout";

type Tab = (typeof TABS)[number];
const GROUP_ID = "group:";

function tabAt(to: string): Tab | undefined {
  return TABS.find((tab) => tab.to === to);
}

function groupOf(groups: Groups, id: string): Group | undefined {
  if (id.startsWith(GROUP_ID)) return id.slice(GROUP_ID.length) as Group;
  return GROUPS.find((group) => groups[group].includes(id));
}

/**
 * The tab bar, More and the hidden tabs as three rows of chips to drag
 * between: a tab
 * dragged onto the bar goes on it, into Hidden switches it off. The bar holds
 * Today and [`MAX_BAR_TABS`] more; a tab dropped past that pushes the last one
 * under More, which the chips past the limit show while dragging. A click on
 * a chip opens the same moves as a menu, for anyone who would rather not drag.
 */
export function TabArranger() {
  const { t, numerals, modules, setModules } = useSettings();
  const [menu, setMenu] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // The lists as they are mid-drag; saved only on the drop.
  const [moving, setMoving] = useState<Groups | null>(null);
  const movingRef = useRef<Groups | null>(null);
  const groups = moving ?? tabGroups(TABS, modules);

  const sensors = useSensors(
    // A few pixels of travel before it's a drag, so a click opens the menu.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const track = (next: Groups | null) => {
    movingRef.current = next;
    setMoving(next);
  };

  const save = (next: Groups) => setModules((current) => withTabGroups(current, TABS, next));

  const onDragStart = ({ active }: DragStartEvent) => {
    setMenu(null);
    setActive(String(active.id));
    track(tabGroups(TABS, modules));
  };

  // Across lists the row moves as it is dragged, so the lists open up for it.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const current = movingRef.current;
    if (!current || !over) return;
    const id = String(active.id);
    const from = groupOf(current, id);
    const to = groupOf(current, String(over.id));
    if (!from || !to || from === to) return;
    const at = current[to].indexOf(String(over.id));
    const target = current[to].filter((item) => item !== id);
    target.splice(at === -1 ? target.length : at, 0, id);
    track({ ...current, [from]: current[from].filter((item) => item !== id), [to]: target });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = movingRef.current;
    setActive(null);
    track(null);
    if (!current) return;
    const id = String(active.id);
    const group = groupOf(current, id);
    let next = current;
    if (over && group && groupOf(current, String(over.id)) === group) {
      const list = current[group];
      const to = list.indexOf(String(over.id));
      if (to !== -1) next = { ...current, [group]: arrayMove(list, list.indexOf(id), to) };
    }
    save(next);
  };

  const moveTo = (to: string, group: Group) => {
    setMenu(null);
    save(moveTab(tabGroups(TABS, modules), to, group));
  };

  const full = groups.bar.length >= MAX_BAR_TABS;
  const activeTab = active ? tabAt(active) : undefined;

  return (
    <section className="surface-card space-y-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="tab-editor__label">{t("settings.tab-bar")}</p>
        {/* The limit only matters once it is reached: "To tab bar" is gone
            from the menus then, and this says why. */}
        {full && (
          <p className="text-[10.5px] text-text-muted">
            {t("customize.bar-limit").replace("{n}", digits(MAX_BAR_TABS, numerals))}
          </p>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          track(null);
        }}
      >
        {GROUPS.map((group) => (
          <TabList
            key={group}
            group={group}
            ids={groups[group]}
            label={
              group === "bar"
                ? null
                : t(group === "more" ? "settings.tab-bar-in-more" : "customize.hidden")
            }
            empty={t("customize.drop-here")}
            // Empty lists fold to their title until a tab is being carried.
            dragging={moving !== null}
            // Past the limit, mid-drag: these go under More on the drop.
            spillFrom={group === "bar" && moving && groups.more.length > 0 ? MAX_BAR_TABS : null}
            menuOpen={(to) => menu === to}
            onChipClick={(to) => setMenu((open) => (open === to ? null : to))}
            renderRow={(to) => {
              const tab = tabAt(to);
              if (!tab || menu !== to) return null;
              return (
                <RowMenu
                  onClose={() => setMenu(null)}
                  items={[
                    ...(group !== "bar" && !full
                      ? [{ label: t("customize.to-bar"), run: () => moveTo(to, "bar") }]
                      : []),
                    ...(group !== "more"
                      ? [{ label: t("customize.to-more"), run: () => moveTo(to, "more") }]
                      : []),
                    ...(group !== "hidden" && tab.module
                      ? [
                          {
                            label: t("customize.hide"),
                            run: () => moveTo(to, "hidden"),
                            danger: true,
                          },
                        ]
                      : []),
                  ]}
                />
              );
            }}
          />
        ))}
        <DragOverlay dropAnimation={null}>
          {activeTab ? (
            <div className="tab-editor__row is-lifted">
              <Icon name={activeTab.icon} className="size-3" />
              <span>{t(activeTab.labelKey)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function TabList({
  group,
  ids,
  label,
  empty,
  dragging,
  spillFrom,
  renderRow,
  menuOpen,
  onChipClick,
}: {
  group: Group;
  ids: string[];
  label: string | null;
  empty: string;
  dragging: boolean;
  spillFrom: number | null;
  renderRow: (to: string) => React.ReactNode;
  menuOpen: (to: string) => boolean;
  onChipClick: (to: string) => void;
}) {
  const { t } = useSettings();
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP_ID}${group}` });

  const folded = ids.length === 0 && group !== "bar" && !dragging;
  return (
    <div className="space-y-1">
      {label && (
        <p className="tab-editor__label pt-1">
          {label}
          {folded && <span className="normal-case tracking-normal"> · {t("customize.none")}</span>}
        </p>
      )}
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={`tab-editor__list is-${group}${isOver ? " is-over" : ""}${folded ? " is-folded" : ""}`}
        >
          {ids.map((to, index) => (
            <SortableRow
              key={to}
              id={to}
              group={group}
              spill={spillFrom !== null && index >= spillFrom}
              open={menuOpen(to)}
              onClick={() => onChipClick(to)}
            >
              {renderRow(to)}
            </SortableRow>
          ))}
          {ids.length === 0 && group !== "bar" && dragging && (
            <li className="tab-editor__empty">{empty}</li>
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

function SortableRow({
  id,
  group,
  spill,
  open,
  onClick,
  children,
}: {
  id: string;
  group: Group;
  spill: boolean;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { t } = useSettings();
  const tab = tabAt(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  // A chip in the right half opens its menu leftward, so it stays in the card.
  const [leftward, setLeftward] = useState(false);
  const toggle = (chip: HTMLElement) => {
    const box = chip.getBoundingClientRect();
    const list = chip.parentElement?.getBoundingClientRect();
    setLeftward(Boolean(list && box.left - list.left > list.width / 2));
    onClick();
  };
  if (!tab) return null;
  return (
    <li
      ref={setNodeRef}
      onClick={(event) => {
        // Clicks inside the open menu belong to the menu.
        if ((event.target as HTMLElement).closest(".notes-menu")) return;
        toggle(event.currentTarget);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`tab-editor__row is-draggable${group === "bar" ? "" : " is-more"}${
        isDragging ? " is-dragging" : ""
      }${spill ? " is-spill" : ""}${leftward ? " menu-left" : ""}`}
      {...attributes}
      {...listeners}
      data-open={open || undefined}
      onKeyDown={(event) => {
        // Space and Enter pick the chip up; the menu key, or Shift+F10,
        // opens its moves.
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          toggle(event.currentTarget);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
    >
      <Icon name={tab.icon} className="size-3" />
      <span>{t(tab.labelKey)}</span>
      {children}
    </li>
  );
}

function RowMenu({
  items,
  onClose,
}: {
  items: { label: string; run: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <Menu onClose={onClose}>
      {items.map((item) => (
        <MenuItem key={item.label} label={item.label} danger={item.danger} onClick={item.run} />
      ))}
    </Menu>
  );
}
