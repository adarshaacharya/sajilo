import { useMemo, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";

type Category = "emergency" | "government" | "utility" | "health";

type Contact = {
  name: string;
  nameNe: string;
  number: string;
  description: string;
  descriptionNe: string;
  category: Category;
  tone: "urgent" | "support";
};

const CONTACTS: readonly Contact[] = [
  {
    name: "Nepal Police",
    nameNe: "नेपाल प्रहरी",
    number: "100",
    description: "Police emergency",
    descriptionNe: "प्रहरी आपतकालीन सेवा",
    category: "emergency",
    tone: "urgent",
  },
  {
    name: "Fire Brigade",
    nameNe: "दमकल",
    number: "101",
    description: "Fire support",
    descriptionNe: "आगलागी सहायता",
    category: "emergency",
    tone: "urgent",
  },
  {
    name: "Ambulance",
    nameNe: "एम्बुलेन्स",
    number: "102",
    description: "Ambulance support",
    descriptionNe: "एम्बुलेन्स सहायता",
    category: "emergency",
    tone: "urgent",
  },
  {
    name: "Traffic Police",
    nameNe: "ट्राफिक प्रहरी",
    number: "103",
    description: "Traffic emergency and accidents",
    descriptionNe: "ट्राफिक आपतकाल र दुर्घटना",
    category: "emergency",
    tone: "urgent",
  },
  {
    name: "Missing Children",
    nameNe: "हराएका बालबालिका",
    number: "104",
    description: "Missing child response",
    descriptionNe: "हराएका बालबालिकाका लागि",
    category: "emergency",
    tone: "support",
  },
  {
    name: "Child Helpline",
    nameNe: "बाल हेल्पलाइन",
    number: "1098",
    description: "Child protection support",
    descriptionNe: "बाल संरक्षण सहायता",
    category: "emergency",
    tone: "support",
  },
  {
    name: "Women Helpline",
    nameNe: "महिला हेल्पलाइन",
    number: "1145",
    description: "Support for women",
    descriptionNe: "महिलाका लागि सहायता",
    category: "emergency",
    tone: "support",
  },
  {
    name: "Tourist Police",
    nameNe: "पर्यटक प्रहरी",
    number: "1144",
    description: "Tourist assistance",
    descriptionNe: "पर्यटक सहायता",
    category: "emergency",
    tone: "support",
  },
  {
    name: "Mental Health",
    nameNe: "मानसिक स्वास्थ्य",
    number: "1166",
    description: "Patan Mental Hospital",
    descriptionNe: "पाटन मानसिक अस्पताल",
    category: "health",
    tone: "support",
  },
  {
    name: "Nepal Electricity Authority",
    nameNe: "नेपाल विद्युत् प्राधिकरण",
    number: "1150",
    description: "Electricity complaints",
    descriptionNe: "विद्युत् गुनासो",
    category: "utility",
    tone: "support",
  },
  {
    name: "Nepal Telecom mobile",
    nameNe: "नेपाल टेलिकम मोबाइल",
    number: "1498",
    description: "Mobile service complaints",
    descriptionNe: "मोबाइल सेवा गुनासो",
    category: "utility",
    tone: "support",
  },
  {
    name: "Nepal Telecom FTTH",
    nameNe: "नेपाल टेलिकम एफटीटीएच",
    number: "198",
    description: "Landline, FTTH and ADSL support",
    descriptionNe: "ल्याण्डलाइन, एफटीटीएच र एडीएसएल सहायता",
    category: "utility",
    tone: "support",
  },
  {
    name: "Hello Sarkar",
    nameNe: "हेलो सरकार",
    number: "1111",
    description: "Government complaints and information",
    descriptionNe: "सरकारी गुनासो तथा जानकारी",
    category: "government",
    tone: "support",
  },
  {
    name: "Ministry of Home Affairs",
    nameNe: "गृह मन्त्रालय",
    number: "1112",
    description: "Home affairs information",
    descriptionNe: "गृह प्रशासनसम्बन्धी जानकारी",
    category: "government",
    tone: "support",
  },
  {
    name: "Health Ministry",
    nameNe: "स्वास्थ्य मन्त्रालय",
    number: "1115",
    description: "Health information and support",
    descriptionNe: "स्वास्थ्य जानकारी तथा सहायता",
    category: "health",
    tone: "support",
  },
  {
    name: "Disaster Helpline",
    nameNe: "विपद् हेल्पलाइन",
    number: "1234",
    description: "Disaster emergency information",
    descriptionNe: "विपद् आपतकालीन जानकारी",
    category: "government",
    tone: "urgent",
  },
  {
    name: "MoFAGA Information",
    nameNe: "संघीय मामिला तथा सामान्य प्रशासन",
    number: "1618014200309",
    description: "Local government information",
    descriptionNe: "स्थानीय तहसम्बन्धी जानकारी",
    category: "government",
    tone: "support",
  },
  {
    name: "Ministry of Home Affairs office",
    nameNe: "गृह मन्त्रालय कार्यालय",
    number: "01-4211208",
    description: "Singhadurbar office landline",
    descriptionNe: "सिंहदरबार कार्यालयको ल्यान्डलाइन",
    category: "government",
    tone: "support",
  },
  {
    name: "MoFAGA office",
    nameNe: "संघीय मामिला मन्त्रालय कार्यालय",
    number: "01-4200318",
    description: "Local government office landline",
    descriptionNe: "स्थानीय तहसम्बन्धी कार्यालयको ल्यान्डलाइन",
    category: "government",
    tone: "support",
  },
  {
    name: "Nepal Telecom central office",
    nameNe: "नेपाल टेलिकम केन्द्रीय कार्यालय",
    number: "01-4210106",
    description: "Bhadrakali Plaza office landline",
    descriptionNe: "भद्रकाली प्लाजा कार्यालयको ल्यान्डलाइन",
    category: "utility",
    tone: "support",
  },
  {
    name: "District Administration Office, Bhaktapur",
    nameNe: "जिल्ला प्रशासन कार्यालय, भक्तपुर",
    number: "01-6614437",
    description: "Chief District Officer office",
    descriptionNe: "प्रमुख जिल्ला अधिकारीको कार्यालय",
    category: "government",
    tone: "support",
  },
  {
    name: "Dakshinkali Municipality",
    nameNe: "दक्षिणकाली नगरपालिका",
    number: "01-4710028",
    description: "Municipal office landline",
    descriptionNe: "नगरपालिकाको कार्यालय ल्यान्डलाइन",
    category: "government",
    tone: "support",
  },
];

export function EmergencyTab() {
  const { language, t } = useSettings();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const isNepali = language === "ne";

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

  return (
    <div className="min-w-0 space-y-2.5">
      <Segmented
        options={categoryOptions}
        value={category}
        onChange={setCategory}
        label={isNepali ? "सम्पर्कको प्रकार" : "Contact category"}
      />

      <label className="relative block">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isNepali ? "सेवा वा नम्बर खोज्नुहोस्" : "Search service or number"}
          aria-label={isNepali ? "सेवा वा नम्बर खोज्नुहोस्" : "Search service or number"}
          className="control-field h-[26px] w-full rounded-[6px] px-2 pl-8 text-[11px] text-text outline-none transition-[border-color,box-shadow] focus-visible:border-[color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--color-accent-mark)_18%,transparent)]"
        />
      </label>

      <div className="flex items-center justify-between px-0.5 text-[10px] text-text-muted">
        <span>{isNepali ? "सम्पर्कहरू" : "Contacts"}</span>
        <span className="tabular-nums">{filtered.length}</span>
      </div>
      <section className="space-y-1.5" aria-label={isNepali ? "सम्पर्क सूची" : "Contact list"}>
        {filtered.map((contact) => (
          <a
            key={contact.number}
            href={`tel:${contact.number.replaceAll("-", "")}`}
            className="surface-card group flex items-center gap-2 p-2 transition-colors hover:bg-surface-hover"
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
              <span className="text-[11px] text-text-muted transition-transform group-hover:translate-x-0.5">
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

      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("emergency.source-note")}
      </p>
    </div>
  );
}
