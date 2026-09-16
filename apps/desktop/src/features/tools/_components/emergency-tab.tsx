import { useMemo, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import {
  type Category,
  CONTACTS,
  type DirectorySection,
  WEBSITES,
  type WebsiteType,
} from "../_lib/directory";

export function EmergencyTab() {
  const { language, t } = useSettings();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<DirectorySection>("phones");
  const [category, setCategory] = useState<Category | "all">("all");
  const [websiteType, setWebsiteType] = useState<WebsiteType | "all">("all");
  const isNepali = language === "ne";

  const sectionOptions = [
    { id: "phones" as const, label: isNepali ? "फोन नम्बर" : "Phone numbers" },
    { id: "websites" as const, label: isNepali ? "वेबसाइट र एप" : "Websites & apps" },
  ];

  const categoryOptions = [
    { id: "all" as const, label: isNepali ? "सबै" : "All" },
    { id: "emergency" as const, label: isNepali ? "आपतकाल" : "Emergency" },
    { id: "government" as const, label: isNepali ? "सरकार" : "Government" },
    { id: "health" as const, label: isNepali ? "स्वास्थ्य" : "Health" },
    { id: "utility" as const, label: isNepali ? "उपयोगिता" : "Utilities" },
  ];

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return CONTACTS.filter(
      (contact) =>
        (category === "all" || contact.category === category) &&
        (!needle ||
          [contact.name, contact.nameNe, contact.number, contact.description, contact.descriptionNe]
            .join(" ")
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [category, query]);

  const filteredWebsites = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return WEBSITES.filter(
      (website) =>
        (websiteType === "all" || website.type === websiteType) &&
        (!needle ||
          [website.name, website.nameNe, website.description, website.descriptionNe]
            .join(" ")
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [query, websiteType]);

  const websiteTypeOptions = [
    { id: "all" as const, label: isNepali ? "सबै" : "All" },
    { id: "checker" as const, label: isNepali ? "जाँच" : "Checkers" },
    { id: "portal" as const, label: isNepali ? "पोर्टल" : "Portals" },
    { id: "app" as const, label: isNepali ? "एप" : "Apps" },
  ];

  const placeholder =
    section === "phones"
      ? isNepali
        ? "सेवा वा नम्बर खोज्नुहोस्"
        : "Search service or number"
      : isNepali
        ? "सेवा, पोर्टल वा एप खोज्नुहोस्"
        : "Search a service, portal or app";

  return (
    <div className="min-w-0 space-y-2.5">
      <Segmented
        options={sectionOptions}
        value={section}
        onChange={setSection}
        label={t("tools.directory")}
      />

      {section === "phones" ? (
        <Segmented
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          label={isNepali ? "सम्पर्कको प्रकार" : "Contact category"}
        />
      ) : (
        <Segmented
          options={websiteTypeOptions}
          value={websiteType}
          onChange={setWebsiteType}
          label={isNepali ? "वेबसाइटको प्रकार" : "Website type"}
        />
      )}

      <label className="relative block">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="control-field h-[26px] w-full rounded-[6px] px-2 pl-8 text-[11px] text-text outline-none transition-[border-color,box-shadow] focus-visible:border-[color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--color-accent-mark)_18%,transparent)]"
        />
      </label>

      <div className="flex items-center justify-between px-0.5 text-[10px] text-text-muted">
        <span>
          {section === "phones"
            ? isNepali
              ? "सम्पर्कहरू"
              : "Contacts"
            : isNepali
              ? "आधिकारिक वेबसाइट र एपहरू"
              : "Official websites & apps"}
        </span>
        <span className="tabular-nums">
          {section === "phones" ? filtered.length : filteredWebsites.length}
        </span>
      </div>
      {section === "phones" ? (
        <section className="space-y-1.5" aria-label={isNepali ? "सम्पर्क सूची" : "Contact list"}>
          {filtered.map((contact) => (
            <a
              key={contact.number}
              href={`tel:${contact.number.replaceAll("-", "")}`}
              className="surface-card group flex cursor-pointer items-center gap-2 p-2 transition-colors hover:bg-surface-hover"
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                  contact.tone === "urgent"
                    ? "bg-[color-mix(in_srgb,#c76a5a_14%,transparent)] text-[color-mix(in_srgb,#c76a5a_86%,white)]"
                    : "bg-surface-hover text-text-secondary"
                }`}
              >
                <Icon name="warning" className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {isNepali ? contact.nameNe : contact.name}
                </span>
                <span className="block truncate text-[10px] text-text-muted">
                  {isNepali ? contact.descriptionNe : contact.description}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold tabular-nums text-[color:var(--color-accent-mark)]">
                {contact.number}
                <span className="text-[11px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  ↗
                </span>
              </span>
            </a>
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-4 text-center text-[11px] text-text-muted">
              {isNepali ? "मिल्ने सम्पर्क भेटिएन।" : "No matching contact found."}
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-1.5" aria-label={isNepali ? "वेबसाइट सूची" : "Website list"}>
          {filteredWebsites.map((website) => (
            <button
              key={website.url}
              type="button"
              onClick={() => openExternalLink(website.url)}
              aria-label={`${isNepali ? website.nameNe : website.name} — ${
                isNepali ? "खोल्नुहोस्" : "Open"
              }`}
              className="surface-card group flex w-full cursor-pointer items-center gap-2 p-2 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                <Icon name={website.type === "app" ? "directory" : "link"} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {isNepali ? website.nameNe : website.name}
                </span>
                <span className="block truncate text-[10px] text-text-muted">
                  {isNepali ? website.descriptionNe : website.description}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                ↗
              </span>
            </button>
          ))}
          {filteredWebsites.length === 0 && (
            <p className="px-1 py-4 text-center text-[11px] text-text-muted">
              {isNepali ? "मिल्ने वेबसाइट वा एप भेटिएन।" : "No matching website or app found."}
            </p>
          )}
        </section>
      )}

      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {section === "phones"
          ? t("emergency.source-note")
          : isNepali
            ? "नयाँ वा गलत सरकारी पोर्टल/एप देख्नुभयो? hi@adarsha.dev मा पठाउनुहोस्।"
            : "Know a new or corrected government portal or app? Send it to hi@adarsha.dev."}
      </p>
    </div>
  );
}
