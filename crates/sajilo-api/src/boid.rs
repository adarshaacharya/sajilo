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
    /// One BOID to check, entered once and kept on this computer. A family
    /// usually applies in several names, so there can be a few.
    pub struct BoidAccount {
        /// 16 digits, `1301…`.
        pub boid: String,
        /// Whatever the user calls it: a name, "Aama". May be empty.
        #[serde(default)]
        pub label: String,
    }

    /// Shares allotted to one BOID in one issue, as a registrar answered.
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
        /// Whose it is: the account's name. Filled in when served.
        #[serde(default)]
        pub holder: String,
    }

    /// How one registrar's check went.
    pub struct RegistrarCheck {
        pub registrar: Registrar,
        pub ok: bool,
        /// Issues it has listed, all checked by now.
        pub issues: u32,
    }

    /// One account's answer for one issue.
    pub struct HolderResult {
        pub boid: String,
        /// The label, or the BOID's last digits when there is none.
        pub name: String,
        /// `None` when not allotted, or not asked yet (`checked` tells which).
        pub allotted: Option<u32>,
        pub applied: Option<u32>,
        pub checked: bool,
        /// Found since that account's first check, within the last fortnight.
        pub is_new: bool,
    }

    /// One issue in which at least one account was allotted shares, with what
    /// every account got.
    pub struct IpoResult {
        /// Stable: registrar and its own id for the issue.
        pub id: String,
        pub registrar: Registrar,
        pub company: String,
        pub published_on: Option<NaiveDate>,
        pub published_label: Option<String>,
        /// Someone's allotment in it is new.
        pub is_new: bool,
        /// In the order the accounts were added.
        pub holders: Vec<HolderResult>,
    }

    /// One account at a glance.
    pub struct AccountSummary {
        pub boid: String,
        pub name: String,
        /// Issues it was allotted shares in.
        pub allotments: u32,
        /// False when its check failed and nothing was known before.
        pub ok: bool,
    }

    /// Everything found for every account.
    pub struct BoidReport {
        /// Newest first.
        pub ipos: Vec<IpoResult>,
        pub dividends: Vec<UnclaimedDividend>,
        pub accounts: Vec<AccountSummary>,
        /// Merged across accounts: ok only if every account's check was.
        pub registrars: Vec<RegistrarCheck>,
    }
}

impl BoidAccount {
    /// The label, or `BOID …0001` when there is none.
    pub fn name(&self) -> String {
        let label = self.label.trim();
        if label.is_empty() {
            let tail = self
                .boid
                .get(self.boid.len().saturating_sub(4)..)
                .unwrap_or_default();
            format!("BOID …{tail}")
        } else {
            label.to_owned()
        }
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
