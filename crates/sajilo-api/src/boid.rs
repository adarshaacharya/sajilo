//! A BOID's IPO allotments and unclaimed dividends, from the share
//! registrars' own public lookups.

use chrono::NaiveDate;

dto_enum! {
    /// A share registrar (RTS) with a public BOID lookup.
    pub enum Registrar {
        NmbCapital,
        SanimaCapital,
        LaxmiSunriseCapital,
        CitizensCapital,
        MuktinathCapital,
        PrabhuCapital,
        NimbAceCapital,
        GlobalImeCapital,
    }
}

dto! {
    /// What the lookups need, entered once and kept on this computer.
    pub struct BoidAccount {
        /// 16 digits, `1301…`.
        pub boid: String,
    }

    /// Shares allotted in one issue.
    pub struct Allotment {
        /// Stable: registrar and its own id for the issue.
        pub id: String,
        pub registrar: Registrar,
        /// The issue as the registrar names it, e.g.
        /// `Himalayan ReInsurance Limited - Public`.
        pub company: String,
        #[serde(default)]
        pub applied: Option<u32>,
        pub allotted: u32,
        /// When the registrar published the result.
        #[serde(default)]
        pub published_on: Option<NaiveDate>,
        /// Found since the last check, not in the first one. Worked out
        /// when served.
        #[serde(default)]
        pub is_new: bool,
        #[serde(default)]
        pub published_label: Option<String>,
    }

    /// A cash dividend waiting to be collected.
    pub struct UnclaimedDividend {
        pub registrar: Registrar,
        pub company: String,
        #[serde(default)]
        pub fiscal_year: Option<String>,
        /// After tax, where the registrar says.
        pub amount: f64,
        #[serde(default)]
        pub kitta: Option<u32>,
    }

    /// How one registrar's check went.
    pub struct RegistrarCheck {
        pub registrar: Registrar,
        pub ok: bool,
        /// Issues it has listed, all checked by now.
        pub issues: u32,
    }

    /// Everything found for a BOID.
    pub struct BoidReport {
        pub allotments: Vec<Allotment>,
        pub dividends: Vec<UnclaimedDividend>,
        pub registrars: Vec<RegistrarCheck>,
    }
}

impl Registrar {
    pub fn name(self) -> &'static str {
        match self {
            Self::NmbCapital => "NMB Capital",
            Self::SanimaCapital => "Sanima Capital",
            Self::LaxmiSunriseCapital => "Laxmi Sunrise Capital",
            Self::CitizensCapital => "Citizens Capital",
            Self::MuktinathCapital => "Muktinath Capital",
            Self::PrabhuCapital => "Prabhu Capital",
            Self::NimbAceCapital => "NIMB Ace Capital",
            Self::GlobalImeCapital => "Global IME Capital",
        }
    }
}
