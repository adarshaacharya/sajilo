import { useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Segmented } from "../../../shared/components/segmented";
import type { KeeperPerson } from "../../../shared/lib/ipc";
import type { TFn } from "../_lib/shared";

/** Someone not yet in the family list, typed straight into a form and created
 * when that form is saved — adding Aama's passport is one save, not two. */
export type NewPerson = { name: string; relationship: string };

type Owner = "me" | "family";

/**
 * Whose it is. Most things are your own, so "Me" is the quiet default; picking
 * "Family" shows the people already added, one tap each, and a way to add
 * someone new in place — never a dropdown with an "add" row hidden in it.
 */
export function PersonSelect({
  value,
  people,
  newPerson,
  onChange,
  onNewPerson,
  t,
}: {
  value: string | null;
  people: readonly KeeperPerson[];
  /** Non-null while a new family member is being typed in. */
  newPerson: NewPerson | null;
  onChange: (personId: string | null) => void;
  onNewPerson: (person: NewPerson | null) => void;
  t: TFn;
}) {
  const [owner, setOwner] = useState<Owner>(value || newPerson ? "family" : "me");

  const choose = (next: Owner) => {
    setOwner(next);
    if (next === "me") {
      onChange(null);
      onNewPerson(null);
    } else if (people.length === 0) {
      // Nobody to pick from yet: go straight to adding someone.
      onNewPerson({ name: "", relationship: "" });
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
          {t("keeper.person.for")}
        </span>
        <Segmented
          label={t("keeper.person.for")}
          size="sm"
          value={owner}
          onChange={choose}
          scrollable={false}
          options={[
            { id: "me" as const, label: t("keeper.person.me") },
            { id: "family" as const, label: t("keeper.person.family") },
          ]}
        />
      </div>

      {owner === "family" && people.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {people.map((person) => {
            const selected = !newPerson && value === person.id;
            return (
              <Chip
                key={person.id}
                selected={selected}
                onClick={() => {
                  onNewPerson(null);
                  onChange(person.id);
                }}
              >
                {person.name}
                {person.relationship && (
                  <span className="text-text-muted"> · {person.relationship}</span>
                )}
              </Chip>
            );
          })}
          <Chip
            selected={Boolean(newPerson)}
            onClick={() => {
              onChange(null);
              onNewPerson(newPerson ?? { name: "", relationship: "" });
            }}
          >
            + {t("keeper.person.someone-new")}
          </Chip>
        </div>
      )}

      {owner === "family" && newPerson && (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-1.5">
          <input
            // biome-ignore lint/a11y/noAutofocus: the user just asked to add someone
            autoFocus
            value={newPerson.name}
            onChange={(event) => onNewPerson({ ...newPerson, name: event.target.value })}
            placeholder={t("keeper.family-name")}
            aria-label={t("keeper.family-name")}
            className={`${CONTROL} w-full`}
          />
          <input
            value={newPerson.relationship}
            onChange={(event) => onNewPerson({ ...newPerson, relationship: event.target.value })}
            placeholder={t("keeper.relationship-placeholder")}
            aria-label={t("keeper.relationship-placeholder")}
            className={`${CONTROL} w-full`}
          />
        </div>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${selected ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] text-accent-mark" : "border-control-border text-text-secondary hover:text-text"}`}
    >
      {children}
    </button>
  );
}
