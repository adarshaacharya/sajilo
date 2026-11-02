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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
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
 * The tab bar, More and the hidden tabs as three lists to drag between: a tab
 * dragged onto the bar goes on it, into Hidden switches it off. The bar holds
 * Today and [`MAX_BAR_TABS`] more; a tab dropped past that pushes the last one
 * under More, which the rows past the limit show while dragging. Every row
 * also has a ⋯ menu, for the same moves without a drag.
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
    // A few pixels of travel before it's a drag, so the ⋯ button still clicks.
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
        <p className="text-[10.5px] text-text-muted">
          {t("customize.bar-limit").replace("{n}", digits(MAX_BAR_TABS, numerals))}
        </p>
      </div>
      <p className="text-[10.5px] leading-snug text-text-muted">{t("customize.drag-hint")}</p>

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
            // Past the limit, mid-drag: these go under More on the drop.
            spillFrom={group === "bar" && moving && groups.more.length > 0 ? MAX_BAR_TABS : null}
            renderRow={(to) => {
              const tab = tabAt(to);
              if (!tab) return null;
              return (
                <RowMenu
                  open={menu === to}
                  label={t(tab.labelKey)}
                  onToggle={() => setMenu((open) => (open === to ? null : to))}
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
                  optionsLabel={t("customize.options")}
                />
              );
            }}
          />
        ))}
        <DragOverlay dropAnimation={null}>
          {activeTab ? (
            <div className="tab-editor__row is-lifted">
              <Icon name="grip" className="size-3 text-text-muted" />
              <Icon name={activeTab.icon} className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{t(activeTab.labelKey)}</span>
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
  spillFrom,
  renderRow,
}: {
  group: Group;
  ids: string[];
  label: string | null;
  empty: string;
  spillFrom: number | null;
  renderRow: (to: string) => React.ReactNode;
}) {
  const { t } = useSettings();
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP_ID}${group}` });

  return (
    <div className="space-y-1">
      {label && <p className="tab-editor__label pt-1">{label}</p>}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`tab-editor__list is-${group}${isOver ? " is-over" : ""}`}>
          {group === "bar" && (
            <li className="tab-editor__row is-fixed">
              <span className="size-3" aria-hidden="true" />
              <Icon name="today" className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{t("tab.today")}</span>
            </li>
          )}
          {ids.map((to, index) => (
            <SortableRow
              key={to}
              id={to}
              group={group}
              spill={spillFrom !== null && index >= spillFrom}
            >
              {renderRow(to)}
            </SortableRow>
          ))}
          {ids.length === 0 && group !== "bar" && <li className="tab-editor__empty">{empty}</li>}
        </ul>
      </SortableContext>
    </div>
  );
}

function SortableRow({
  id,
  group,
  spill,
  children,
}: {
  id: string;
  group: Group;
  spill: boolean;
  children: React.ReactNode;
}) {
  const { t } = useSettings();
  const tab = tabAt(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  if (!tab) return null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`tab-editor__row is-draggable${group === "bar" ? "" : " is-more"}${
        isDragging ? " is-dragging" : ""
      }${spill ? " is-spill" : ""}`}
      {...attributes}
      {...listeners}
    >
      <Icon name="grip" className="size-3 text-text-muted" />
      <Icon name={tab.icon} className="size-3.5" />
      <span className="min-w-0 flex-1 truncate">{t(tab.labelKey)}</span>
      {children}
    </li>
  );
}

function RowMenu({
  open,
  label,
  optionsLabel,
  items,
  onToggle,
  onClose,
}: {
  open: boolean;
  label: string;
  optionsLabel: string;
  items: { label: string; run: () => void; danger?: boolean }[];
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <span className="relative">
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        // The row is the drag handle; a press on the menu isn't the start of one.
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={onToggle}
        aria-label={`${label}: ${optionsLabel}`}
      >
        <Icon name="ellipsis" className="size-3" />
      </button>
      {open && (
        <Menu onClose={onClose}>
          {items.map((item) => (
            <MenuItem key={item.label} label={item.label} danger={item.danger} onClick={item.run} />
          ))}
        </Menu>
      )}
    </span>
  );
}
