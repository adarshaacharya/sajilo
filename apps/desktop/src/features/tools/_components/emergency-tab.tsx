import { useMemo, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";

type Category = "emergency" | "government" | "utility" | "health";
type DirectorySection = "phones" | "websites";
type WebsiteType = "checker" | "portal" | "app";

type Contact = {
  name: string;
  nameNe: string;
  number: string;
  description: string;
  descriptionNe: string;
  category: Category;
  tone: "urgent" | "support";
};

type Website = {
  name: string;
  nameNe: string;
  description: string;
  descriptionNe: string;
  type: WebsiteType;
  url: string;
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

const WEBSITES: readonly Website[] = [
  {
    name: "IRD bill prize",
    nameNe: "आईआरडी बिल पुरस्कार",
    description: "Register eligible bills and check prize winners",
    descriptionNe: "योग्य बिल दर्ता र पुरस्कार विजेता हेर्नुहोस्",
    type: "portal",
    url: "https://prize.ird.gov.np/",
  },
  {
    name: "Nepal Government Portal",
    nameNe: "नेपाल सरकार पोर्टल",
    description: "Official government services and information",
    descriptionNe: "सरकारी सेवा तथा जानकारीको आधिकारिक पोर्टल",
    type: "portal",
    url: "https://www.nepal.gov.np/",
  },
  {
    name: "National ID portal",
    nameNe: "राष्ट्रिय परिचयपत्र पोर्टल",
    description: "Check card status and download eNID",
    descriptionNe: "कार्डको अवस्था हेर्नुहोस् र eNID डाउनलोड गर्नुहोस्",
    type: "checker",
    url: "https://citizenportal.donidcr.gov.np/ne",
  },
  {
    name: "Passport application",
    nameNe: "राहदानी आवेदन",
    description: "Apply for an e-passport and appointment",
    descriptionNe: "ई-राहदानी आवेदन र अपोइन्टमेन्ट",
    type: "portal",
    url: "https://online.nepalpassport.gov.np/",
  },
  {
    name: "Passport status",
    nameNe: "राहदानी स्थिति",
    description: "Check your e-passport status",
    descriptionNe: "ई-राहदानीको स्थिति हेर्नुहोस्",
    type: "checker",
    url: "https://nepalpassport.gov.np/en?post_type=dispatchedstatus",
  },
  {
    name: "Driving licence application",
    nameNe: "सवारी चालक अनुमतिपत्र आवेदन",
    description: "Online licence form, quotas and appointments",
    descriptionNe: "अनलाइन फाराम, कोटा र अपोइन्टमेन्ट",
    type: "portal",
    url: "https://applydl.dotm.gov.np/",
  },
  {
    name: "Licence print checker",
    nameNe: "लाइसेन्स प्रिन्ट जाँच",
    description: "Check whether your smart-card licence is printed",
    descriptionNe: "स्मार्ट-कार्ड लाइसेन्स छापिएको छ कि छैन हेर्नुहोस्",
    type: "checker",
    url: "https://applydl.dotm.gov.np/licensecheck",
  },
  {
    name: "Taxpayer portal",
    nameNe: "करदाता पोर्टल",
    description: "PAN, VAT, returns and tax services",
    descriptionNe: "प्यान, भ्याट, विवरण र कर सेवा",
    type: "portal",
    url: "https://taxpayerportal.ird.gov.np/taxpayer/app.html",
  },
  {
    name: "Health Insurance e-Portal",
    nameNe: "स्वास्थ्य बीमा ई-पोर्टल",
    description: "Register, renew and view health insurance",
    descriptionNe: "दर्ता, नवीकरण र स्वास्थ्य बीमा हेर्नुहोस्",
    type: "portal",
    url: "https://eportal.hib.gov.np/register",
  },
  {
    name: "Police clearance",
    nameNe: "प्रहरी चारित्रिक प्रमाणपत्र",
    description: "Online police clearance registration",
    descriptionNe: "अनलाइन प्रहरी चारित्रिक प्रमाणपत्र दर्ता",
    type: "portal",
    url: "https://opcr.nepalpolice.gov.np/",
  },
  {
    name: "Election Commission",
    nameNe: "निर्वाचन आयोग",
    description: "Voter registration, voter roll and results",
    descriptionNe: "मतदाता दर्ता, नामावली र नतिजा",
    type: "checker",
    url: "https://election.gov.np/",
  },
  {
    name: "Mero Kitta",
    nameNe: "मेरो कित्ता",
    description: "Land maps, records and service requests",
    descriptionNe: "जग्गाको नक्सा, अभिलेख र सेवा निवेदन",
    type: "portal",
    url: "https://merokitta.dos.gov.np/",
  },
  {
    name: "Company registration",
    nameNe: "कम्पनी दर्ता",
    description: "Office of Company Registrar e-services",
    descriptionNe: "कम्पनी रजिष्ट्रार कार्यालयका ई-सेवा",
    type: "portal",
    url: "https://camis.ocr.gov.np/",
  },
  {
    name: "Company search",
    nameNe: "कम्पनी खोजी",
    description: "Search registered companies by name, PAN or number",
    descriptionNe: "नाम, प्यान वा दर्ता नम्बरबाट कम्पनी खोज्नुहोस्",
    type: "checker",
    url: "https://company.ocr.gov.np/",
  },
  {
    name: "Nepal visa application",
    nameNe: "नेपाल भिसा आवेदन",
    description: "Online visa application for Nepali missions",
    descriptionNe: "नेपाली नियोगका लागि अनलाइन भिसा आवेदन",
    type: "portal",
    url: "https://nepaliport.immigration.gov.np/onlinevisa-mission/application",
  },
  {
    name: "Foreign employment search",
    nameNe: "वैदेशिक रोजगारी खोज",
    description: "Labour approval and foreign job search",
    descriptionNe: "श्रम स्वीकृति र वैदेशिक रोजगारी खोज",
    type: "checker",
    url: "https://foreignjob.dofe.gov.np/",
  },
  {
    name: "Nepal Electricity Authority",
    nameNe: "नेपाल विद्युत् प्राधिकरण",
    description: "Electricity payment and customer services",
    descriptionNe: "विद्युत् भुक्तानी र ग्राहक सेवा",
    type: "portal",
    url: "https://www.nea.org.np/en/payment",
  },
  {
    name: "KUKL customer portal",
    nameNe: "केयूकेएल ग्राहक पोर्टल",
    description: "Water bill, customer services and complaints",
    descriptionNe: "खानेपानी बिल, ग्राहक सेवा र गुनासो",
    type: "portal",
    url: "https://www.kukl.org.np/e-services/customer-web-portal",
  },
  {
    name: "Social Security Fund",
    nameNe: "सामाजिक सुरक्षा कोष",
    description: "Contributor account and social security services",
    descriptionNe: "योगदानकर्ता खाता र सामाजिक सुरक्षा सेवा",
    type: "portal",
    url: "https://sosys.ssf.gov.np/Modules/REGISTRATION/ContributorLogin.aspx",
  },
  {
    name: "Bolpatra e-GP",
    nameNe: "बोलपत्र ई-जीपी",
    description: "Government procurement and published bids",
    descriptionNe: "सरकारी खरिद र प्रकाशित बोलपत्र",
    type: "portal",
    url: "https://www.bolpatra.gov.np/",
  },
  {
    name: "Nagarik App",
    nameNe: "नागरिक एप",
    description: "Government services in one app",
    descriptionNe: "एकै एपमा सरकारी सेवा",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=com.yajtech.nagarikapp",
  },
  {
    name: "KTM Public Transport",
    nameNe: "केटिएम सार्वजनिक यातायात",
    description: "Official Kathmandu Valley bus finder",
    descriptionNe: "काठमाडौं उपत्यकाको आधिकारिक बस खोजी एप",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=com.fccpta.ktmpublictransport",
  },
  {
    name: "Mero Kitta app",
    nameNe: "मेरो कित्ता एप",
    description: "Official land-service app from Survey Department",
    descriptionNe: "नापी विभागको आधिकारिक जग्गा सेवा एप",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=np.gov.dos.merokitta",
  },
  {
    name: "Nepal ePassport app",
    nameNe: "नेपाल ई-राहदानी एप",
    description: "Official e-passport app",
    descriptionNe: "आधिकारिक ई-राहदानी एप",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=com.dop.passport",
  },
  {
    name: "Shramsansar",
    nameNe: "श्रम संसार",
    description: "Official jobs, training and labour-market app",
    descriptionNe: "रोजगारी, तालिम र श्रम बजारको आधिकारिक एप",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=np.gov.shramsansar",
  },
  {
    name: "Nepal Weather Official",
    nameNe: "नेपाल मौसम आधिकारिक",
    description: "Official forecasts and weather alerts",
    descriptionNe: "आधिकारिक पूर्वानुमान र मौसम चेतावनी",
    type: "app",
    url: "https://play.google.com/store/apps/details?id=np.gov.dhm.nepalweather",
  },
];

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
