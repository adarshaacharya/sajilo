//! Mutual fund NAVs: open-end schemes, bought from and sold back to the fund
//! manager at NAV (every SIP in Nepal is one); closed-end schemes, which trade
//! on NEPSE at whatever the market pays; and closed-end schemes that have
//! reached maturity and are being wound up.

use crate::load_state::Freshness;

dto_enum! {
    pub enum FundKind {
        /// Units bought from and redeemed with the fund manager at NAV.
        OpenEnd,
        /// Listed on NEPSE; the market price drifts away from NAV.
        ClosedEnd,
        /// A closed-end scheme past its maturity date. It no longer trades or
        /// publishes; holders are paid out at the refund NAV.
        Matured,
    }
}

dto! {
    /// One published NAV and the Nepal calendar day it is as of.
    pub struct NavPoint {
        pub nav: f64,
        /// ISO `YYYY-MM-DD`.
        pub date: String,
    }

    /// The monthly NAV. Fund managers publish it against a Bikram Sambat
    /// month rather than a day, so it carries that month instead of a date.
    pub struct MonthlyNav {
        pub nav: f64,
        pub bs_year: i32,
        /// 1 = Baishakh … 12 = Chaitra.
        pub bs_month: u32,
        /// e.g. `Shrawan`.
        pub month_name: String,
        /// e.g. `साउन`.
        pub month_name_ne: String,
    }

    pub struct MutualFund {
        pub symbol: String,
        pub name: String,
        pub kind: FundKind,
        /// The fund manager's logo, as a full https URL. Only ShareHub sends
        /// one, and not for every scheme.
        pub logo_url: Option<String>,
        /// The newest NAV the manager has published: the daily one where the
        /// scheme publishes daily, otherwise the weekly one.
        pub latest: NavPoint,
        /// The weekly NAV `latest` moved from, when it is an older figure.
        /// `None` when the weekly NAV is itself the latest.
        pub previous: Option<NavPoint>,
        pub daily: Option<NavPoint>,
        pub weekly: Option<NavPoint>,
        pub monthly: Option<MonthlyNav>,
        /// Rupees under management.
        pub fund_size: Option<f64>,
        /// Closed-end only: the last traded price on NEPSE.
        pub ltp: Option<f64>,
        /// ISO `YYYY-MM-DD`: the day `ltp` traded. A thinly traded fund's last
        /// price can be days old, and the discount is only as current as it.
        pub ltp_date: Option<String>,
        /// Closed-end only: how far the market price sits from the weekly NAV,
        /// in percent. Negative is a discount.
        pub premium_percent: Option<f64>,
        /// ISO `YYYY-MM-DD`. Closed-end and matured schemes only; open-end
        /// ones never mature.
        pub maturity_date: Option<String>,
        /// Matured only: what each unit is paid out at on winding up.
        pub refund_nav: Option<f64>,
        /// How many companies the scheme holds shares in.
        pub holdings: Option<u32>,
        /// How many shares it holds across those companies, in total.
        pub held_shares: Option<f64>,
    }

    pub struct MutualFundSnapshot {
        /// Open-end first, then closed-end, then matured; by name within each.
        #[serde(default)]
        pub funds: Vec<MutualFund>,
        /// Which site answered, for the source note.
        pub source: String,
        pub freshness: Freshness,
    }
}
