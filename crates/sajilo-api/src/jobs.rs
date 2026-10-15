//! Government and public-sector vacancies, from the bodies that recruit.
//!
//! Each source is fetched and cached on its own, so one commission's site
//! being down shows that source as unavailable instead of emptying the list.

use sajilo_core::NepaliDate;

dto_enum! {
    /// A body that publishes vacancies. Ids are stable: they key caches,
    /// filters and the "seen" record.
    pub enum JobSource {
        /// Lok Sewa Aayog, the federal Public Service Commission.
        Psc,
        /// Shikshak Sewa Aayog, the Teacher Service Commission.
        Tsc,
        /// Provincial Public Service Commissions.
        PpscKoshi,
        PpscMadhesh,
        PpscBagmati,
        PpscGandaki,
        PpscLumbini,
        PpscKarnali,
        PpscSudurpashchim,
        /// Nepal Police.
        NepalPolice,
        /// Armed Police Force.
        Apf,
        /// Nepal Rastra Bank.
        Nrb,
        NepalBank,
        /// Rastriya Banijya Bank.
        Rbb,
        /// Tribhuvan University Service Commission.
        Tusc,
    }
}

dto_enum! {
    /// How the Jobs screen groups sources in its filter.
    pub enum JobGroup {
        /// Federal commissions: Lok Sewa, Shikshak Sewa.
        Federal,
        /// The seven provincial commissions.
        Province,
        /// Police and the Armed Police Force.
        Security,
        /// Public banks and the university.
        Public,
    }
}

dto! {
    /// A source as the Jobs screen lists it.
    pub struct JobSourceInfo {
        pub source: JobSource,
        pub group: JobGroup,
        pub name_en: String,
        pub name_ne: String,
        /// For filter chips, e.g. `Lok Sewa`, `लोक सेवा`.
        pub short_en: String,
        pub short_ne: String,
        /// Where its vacancies are published, for "see all on the site".
        pub url: String,
    }

    /// One advertised post, or for sources that publish notices rather than
    /// data, one vacancy notice.
    pub struct JobVacancy {
        /// Stable across refreshes: the source and its own advertisement id.
        pub id: String,
        pub source: JobSource,
        /// The post, e.g. `उपसचिव`, or the notice's title.
        pub title: String,
        /// The office that advertised it, e.g. `लोक सेवा आयोग, पोखरा कार्यालय`.
        #[serde(default)]
        pub office: Option<String>,
        /// Class and level as published, e.g. `रा०प० द्वितीय`, `सातौं तह`.
        #[serde(default)]
        pub level: Option<String>,
        #[serde(default)]
        pub openings: Option<u32>,
        /// The advertisement number, e.g. `17177-17177/2083-84`.
        #[serde(default)]
        pub advertisement_code: Option<String>,
        /// The last day to apply at the normal fee.
        #[serde(default)]
        pub deadline: Option<NepaliDate>,
        /// The last day to apply at double fee.
        #[serde(default)]
        pub double_fee_deadline: Option<NepaliDate>,
        #[serde(default)]
        pub published_on: Option<NepaliDate>,
        /// Applications paid so far, where the source says.
        #[serde(default)]
        pub applicants: Option<u32>,
        /// The official page or notice.
        pub url: String,
        /// Days from today (Nepal) to the last day it can be applied for,
        /// double fee included; negative once closed. Worked out when served,
        /// never cached.
        #[serde(default)]
        pub days_left: Option<i32>,
        /// Not there the last time the Jobs screen was looked at. Worked out
        /// when served.
        #[serde(default)]
        pub is_new: bool,
        /// A deadline reminder is set for it. Worked out when served.
        #[serde(default)]
        pub reminded: bool,
        /// The dates as the screen shows them, in the reader's language
        /// (`कात्तिक ३` / `Kartik 3`). Worked out when served.
        #[serde(default)]
        pub deadline_label: Option<String>,
        #[serde(default)]
        pub double_fee_deadline_label: Option<String>,
        #[serde(default)]
        pub published_label: Option<String>,
        /// Days since it was published. Worked out when served.
        #[serde(default)]
        pub published_days_ago: Option<i32>,
    }
}

dto! {
    /// One part of an advertisement, from the commission's detail: an
    /// advertisement often covers the same post in two services, or an open
    /// and an internal competition side by side.
    pub struct JobDetailPart {
        /// e.g. `नेपाल इञ्जिनियरिङ`.
        pub service: String,
        /// Who may apply: `खुला` (anyone), `आन्तरिक` (staff already in the
        /// service), `महिला`, `आदिवासी जनजाति`, … as published.
        pub open_type: String,
        pub openings: u32,
    }
}

impl JobSource {
    pub const ALL: [Self; 15] = [
        Self::Psc,
        Self::Tsc,
        Self::PpscKoshi,
        Self::PpscMadhesh,
        Self::PpscBagmati,
        Self::PpscGandaki,
        Self::PpscLumbini,
        Self::PpscKarnali,
        Self::PpscSudurpashchim,
        Self::NepalPolice,
        Self::Apf,
        Self::Nrb,
        Self::NepalBank,
        Self::Rbb,
        Self::Tusc,
    ];

    /// The id used in cache keys and vacancy ids.
    pub fn key(self) -> &'static str {
        match self {
            Self::Psc => "psc",
            Self::Tsc => "tsc",
            Self::PpscKoshi => "ppsc-koshi",
            Self::PpscMadhesh => "ppsc-madhesh",
            Self::PpscBagmati => "ppsc-bagmati",
            Self::PpscGandaki => "ppsc-gandaki",
            Self::PpscLumbini => "ppsc-lumbini",
            Self::PpscKarnali => "ppsc-karnali",
            Self::PpscSudurpashchim => "ppsc-sudurpashchim",
            Self::NepalPolice => "police",
            Self::Apf => "apf",
            Self::Nrb => "nrb",
            Self::NepalBank => "nepal-bank",
            Self::Rbb => "rbb",
            Self::Tusc => "tusc",
        }
    }
}

/// Every source: its group, names in English and Nepali, the short names
/// for the filter, and where its vacancies are published.
const CATALOG: [(JobSource, JobGroup, &str, &str, &str, &str, &str); 15] = [
    (
        JobSource::Psc,
        JobGroup::Federal,
        "Public Service Commission",
        "लोक सेवा आयोग",
        "Lok Sewa",
        "लोक सेवा",
        "https://psc.gov.np/category/advertisement/all",
    ),
    (
        JobSource::Tsc,
        JobGroup::Federal,
        "Teacher Service Commission",
        "शिक्षक सेवा आयोग",
        "Shikshak Sewa",
        "शिक्षक सेवा",
        "https://tsc.gov.np/category/74",
    ),
    (
        JobSource::PpscKoshi,
        JobGroup::Province,
        "Koshi Province Public Service Commission",
        "कोशी प्रदेश लोक सेवा आयोग",
        "Koshi",
        "कोशी",
        "https://psc.koshi.gov.np/category/advertisement/",
    ),
    (
        JobSource::PpscMadhesh,
        JobGroup::Province,
        "Madhesh Province Public Service Commission",
        "मधेश प्रदेश लोक सेवा आयोग",
        "Madhesh",
        "मधेश",
        "https://ppsc.madhesh.gov.np/category/advertisement/",
    ),
    (
        JobSource::PpscBagmati,
        JobGroup::Province,
        "Bagmati Province Public Service Commission",
        "बागमती प्रदेश लोक सेवा आयोग",
        "Bagmati",
        "बागमती",
        "https://ppsc.bagamati.gov.np/category/advertisement--a-s--a--khulla--and-inclusive",
    ),
    (
        JobSource::PpscGandaki,
        JobGroup::Province,
        "Gandaki Province Public Service Commission",
        "गण्डकी प्रदेश लोक सेवा आयोग",
        "Gandaki",
        "गण्डकी",
        "https://ppsc.gandaki.gov.np/advertisings-list",
    ),
    (
        JobSource::PpscLumbini,
        JobGroup::Province,
        "Lumbini Province Public Service Commission",
        "लुम्बिनी प्रदेश लोक सेवा आयोग",
        "Lumbini",
        "लुम्बिनी",
        "https://ppsc.lumbini.gov.np/publications",
    ),
    (
        JobSource::PpscKarnali,
        JobGroup::Province,
        "Karnali Province Public Service Commission",
        "कर्णाली प्रदेश लोक सेवा आयोग",
        "Karnali",
        "कर्णाली",
        "https://ppsc.karnali.gov.np/category/information-of-advertising/",
    ),
    (
        JobSource::PpscSudurpashchim,
        JobGroup::Province,
        "Sudurpashchim Province Public Service Commission",
        "सुदूरपश्चिम प्रदेश लोक सेवा आयोग",
        "Sudurpashchim",
        "सुदूरपश्चिम",
        "https://psc.sudurpashchim.gov.np/advertisements",
    ),
    (
        JobSource::NepalPolice,
        JobGroup::Security,
        "Nepal Police",
        "नेपाल प्रहरी",
        "Police",
        "प्रहरी",
        "https://www.nepalpolice.gov.np/career/vacancy/",
    ),
    (
        JobSource::Apf,
        JobGroup::Security,
        "Armed Police Force",
        "सशस्त्र प्रहरी बल",
        "APF",
        "सशस्त्र",
        "https://www.apf.gov.np/vacancy",
    ),
    (
        JobSource::Nrb,
        JobGroup::Public,
        "Nepal Rastra Bank",
        "नेपाल राष्ट्र बैंक",
        "NRB",
        "राष्ट्र बैंक",
        "https://www.nrb.org.np/category/notices/?department=hrm",
    ),
    (
        JobSource::NepalBank,
        JobGroup::Public,
        "Nepal Bank",
        "नेपाल बैंक",
        "Nepal Bank",
        "नेपाल बैंक",
        "https://www.nepalbank.com.np/career",
    ),
    (
        JobSource::Rbb,
        JobGroup::Public,
        "Rastriya Banijya Bank",
        "राष्ट्रिय वाणिज्य बैंक",
        "RBB",
        "वाणिज्य बैंक",
        "https://www.rbb.com.np/career",
    ),
    (
        JobSource::Tusc,
        JobGroup::Public,
        "Tribhuvan University Service Commission",
        "त्रिभुवन विश्वविद्यालय सेवा आयोग",
        "TU",
        "त्रि.वि.",
        "https://tusc.tu.edu.np/notices?notice_type=38",
    ),
];

impl JobSourceInfo {
    pub fn catalog() -> Vec<Self> {
        JobSource::ALL.into_iter().map(Self::of).collect()
    }

    pub fn of(source: JobSource) -> Self {
        let (_, group, name_en, name_ne, short_en, short_ne, url) = CATALOG
            .into_iter()
            .find(|entry| entry.0 == source)
            .expect("every source is in the catalog");
        Self {
            source,
            group,
            name_en: name_en.into(),
            name_ne: name_ne.into(),
            short_en: short_en.into(),
            short_ne: short_ne.into(),
            url: url.into(),
        }
    }
}
