import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import type { KeeperItem } from "../../shared/lib/ipc";
import { track } from "../../shared/lib/usage";
import {
  BillEditor,
  BillGroupList,
  BillGroupRows,
  BillPicker,
  billGroupName,
  groupBills,
  type NewPerson,
  type ReminderTemplate,
  useBillReminders,
} from "../keeper/bill-reminders";
import { ElectricityPage, ElectricityRow } from "./_components/electricity";
import { InternetPage, InternetRow } from "./_components/internet";
import { useElectricity } from "./electricity-due";
import { useInternet } from "./internet-due";

/** A bill Sajilo can look up for itself, with the account number. */
type Checked = "electricity" | "internet";

/** Bills' own navigation: a small stack, so back is always the screen before. */
type Screen =
  /** For internet, which account; `null` adds one. */
  | { name: "checked"; which: Checked; username?: string | null }
  | { name: "add" }
  | { name: "how"; which: Checked; template: ReminderTemplate }
  | { name: "group"; key: string }
  | { name: "edit"; draft: KeeperItem; newPerson: NewPerson | null };

const CHECKED_ICONS: Record<Checked, IconName> = { electricity: "bolt", internet: "wifi" };

/**
 * Every bill the household pays, in one list. Electricity and internet can be
 * looked up with the account number (NEA, WorldLink); everything else, and
 * those too if preferred, is a reminder on the day it is due. How Sajilo
 * knows is a detail of each row, not a second place to look.
 */
export function Bills() {
  const { t } = useSettings();
  const { search } = useLocation();
  const bills = useBillReminders(t);
  const electricity = useElectricity();
  const internet = useInternet();
  const [stack, setStack] = useState<Screen[]>(() => {
    const linked = new URLSearchParams(search).get("open");
    const params = new URLSearchParams(search);
    if (linked === "electricity") return [{ name: "checked", which: linked }];
    if (linked === "internet") {
      return [{ name: "checked", which: linked, username: params.get("username") }];
    }
    return [];
  });
  const screen = stack.at(-1) ?? null;
  const push = (next: Screen) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => current.slice(0, -1));
  const replace = (next: Screen) => setStack((current) => [...current.slice(0, -1), next]);

  useEffect(() => {
    if (screen?.name === "checked") track(`tab.bills.${screen.which}`);
  }, [screen]);

  const groups = groupBills(bills.items);
  const group = screen?.name === "group" ? groups.find((g) => g.key === screen.key) : undefined;
  const internetAccounts = internet.data ?? [];
  const named = internetAccounts.length > 1;
  const internetTitle = (username: string | null | undefined) => {
    const account = internetAccounts.find((entry) => entry.username === username);
    return account && named
      ? t("internet.title-named").replace("{name}", account.name)
      : t("internet.title");
  };
  const isSetUp = {
    electricity: !!electricity.data && electricity.data.status !== "unavailable",
    internet: internetAccounts.length > 0,
  };

  useHeaderInner(
    screen === null
      ? null
      : {
          title:
            screen.name === "checked"
              ? screen.which === "electricity"
                ? t("electricity.title")
                : internetTitle(screen.username)
              : screen.name === "add"
                ? t("bills.add")
                : screen.name === "how"
                  ? screen.template.title
                  : screen.name === "group"
                    ? group
                      ? billGroupName(group)
                      : t("screen.bills")
                    : screen.draft.createdAt
                      ? t("keeper.edit-title")
                      : screen.draft.title || t("bills.add"),
          onBack: back,
        },
  );

  const edit = (draft: KeeperItem) => push({ name: "edit", draft, newPerson: null });
  /** Picking electricity or internet asks how first; anything else is a
   * reminder straight away. */
  const pick = async (template: ReminderTemplate | null) => {
    const which = template?.id;
    if ((which === "electricity" || which === "internet") && template) {
      replace({ name: "how", which, template });
      return;
    }
    replace({ name: "edit", draft: await bills.draft(template), newPerson: null });
  };

  const checkedList = (["electricity", "internet"] as const).filter((which) => isSetUp[which]);
  const empty = bills.loaded && checkedList.length === 0 && groups.length === 0;

  let body: ReactNode;
  if (screen?.name === "checked") {
    body =
      screen.which === "electricity" ? (
        <ElectricityPage t={t} />
      ) : (
        <InternetPage
          username={screen.username ?? null}
          onAdded={(username) => replace({ name: "checked", which: "internet", username })}
          onRemoved={back}
          t={t}
        />
      );
  } else if (screen?.name === "add") {
    body = <BillPicker onPick={pick} t={t} />;
  } else if (screen?.name === "how") {
    body = (
      <How
        which={screen.which}
        onChecked={() => replace({ name: "checked", which: screen.which })}
        onRemind={async () =>
          replace({ name: "edit", draft: await bills.draft(screen.template), newPerson: null })
        }
        t={t}
      />
    );
  } else if (screen?.name === "group" && group) {
    const which = group.template;
    const canCheck =
      (which === "electricity" || which === "internet") && !isSetUp[which] ? which : null;
    body = (
      <div className="space-y-2.5">
        <BillGroupList
          group={group}
          people={bills.people}
          onOpen={edit}
          onToggle={bills.toggle}
          t={t}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            onClick={async () => group.items[0] && edit(await bills.another(group.items[0]))}
            className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
          >
            <Icon name="plus" className="size-2.5" />
            {t("keeper.add-another").replace("{type}", billGroupName(group))}
          </button>
          {canCheck && (
            <button
              type="button"
              onClick={() => push({ name: "checked", which: canCheck })}
              className="text-[10px] font-medium text-accent-mark hover:underline"
            >
              {t(canCheck === "electricity" ? "bills.check-nea" : "bills.check-worldlink")}
            </button>
          )}
        </div>
      </div>
    );
  } else if (screen?.name === "edit") {
    body = (
      <BillEditor
        item={screen.draft}
        people={bills.people}
        onChange={(draft) => replace({ ...screen, draft })}
        onSave={async () => {
          if (await bills.save(screen.draft, screen.newPerson)) back();
        }}
        onCancel={back}
        onDelete={
          screen.draft.createdAt
            ? async () => {
                if (await bills.remove(screen.draft)) back();
              }
            : undefined
        }
        newPerson={screen.newPerson}
        onNewPerson={(newPerson) => replace({ ...screen, newPerson })}
        t={t}
      />
    );
  } else {
    body = empty ? (
      <section className="space-y-2">
        <div className="px-0.5">
          <h2 className="text-[12px] font-semibold">{t("bills.empty-title")}</h2>
          <p className="mt-0.5 text-[10px] text-text-muted">{t("bills.empty-body")}</p>
        </div>
        <BillPicker
          onPick={(template) => {
            push({ name: "add" });
            void pick(template);
          }}
          t={t}
        />
      </section>
    ) : (
      <>
        {checkedList.includes("electricity") && (
          <ElectricityRow onOpen={() => push({ name: "checked", which: "electricity" })} t={t} />
        )}
        {internetAccounts.map((account) => (
          <InternetRow
            key={account.username}
            account={account}
            named={named}
            onOpen={() => push({ name: "checked", which: "internet", username: account.username })}
            t={t}
          />
        ))}
        {groups.length > 0 && (
          <section className="surface-card px-3" aria-label={t("screen.bills")}>
            <BillGroupRows
              groups={groups}
              people={bills.people}
              onOpen={(key) => push({ name: "group", key })}
              t={t}
            />
          </section>
        )}
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-2.5">
      {bills.error && (
        <p className="rounded-md bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)] px-2 py-1.5 text-[10px] text-holiday">
          {bills.error}
        </p>
      )}
      {body}
      {screen === null && (
        <>
          {!empty && (
            <div className="keeper-add">
              <button
                type="button"
                onClick={() => push({ name: "add" })}
                className="keeper-add__btn"
              >
                <Icon name="plus" className="size-3.5" />
                {t("bills.add")}
              </button>
            </div>
          )}
          <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("bills.note")}</p>
        </>
      )}
    </div>
  );
}

/** Electricity or internet: looked up with the account number, or only a
 * reminder on the day. */
function How({
  which,
  onChecked,
  onRemind,
  t,
}: {
  which: Checked;
  onChecked: () => void;
  onRemind: () => void;
  t: ReturnType<typeof useSettings>["t"];
}) {
  const options = [
    {
      key: "checked",
      icon: CHECKED_ICONS[which],
      title: t(which === "electricity" ? "bills.how-nea" : "bills.how-worldlink"),
      body: t(which === "electricity" ? "bills.how-nea-body" : "bills.how-worldlink-body"),
      onClick: onChecked,
    },
    {
      key: "remind",
      icon: "bell" as IconName,
      title: t("bills.how-remind"),
      body: t("bills.how-remind-body"),
      onClick: onRemind,
    },
  ];
  return (
    <section className="space-y-1.5" aria-label={t("bills.how")}>
      <p className="px-0.5 text-[11px] font-semibold text-text-secondary">{t("bills.how")}</p>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={option.onClick}
          className="surface-card flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon name={option.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold">{option.title}</span>
            <span className="mt-0.5 block text-[10.5px] leading-snug text-text-secondary">
              {option.body}
            </span>
          </span>
          <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
        </button>
      ))}
    </section>
  );
}
