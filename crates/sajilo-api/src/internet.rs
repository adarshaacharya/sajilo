//! Internet subscriptions: WorldLink, from the lookup its own payment site
//! makes before taking a renewal.

use chrono::NaiveDate;

dto! {
    /// What the lookup needs, entered once and kept on this computer. A
    /// household may pay for a few: home, the shop, parents' flat.
    pub struct WorldLinkAccount {
        pub username: String,
        /// Whatever the user calls it: "Home", "Shop". May be empty.
        #[serde(default)]
        pub label: String,
    }

    /// One saved account and how its check went, each on its own, so one
    /// that can't be reached never hides the others.
    pub struct InternetAccount {
        pub username: String,
        /// The label, or the username when there is none.
        pub name: String,
        pub state: crate::load_state::LoadState<InternetStatus>,
    }

    /// One subscription as the ISP reports it.
    pub struct InternetStatus {
        /// e.g. `6G 400Mbps/12mths with 1TV`.
        pub package: String,
        /// The day the subscription runs out: the day it was checked plus
        /// the days it had left then.
        pub expires_on: NaiveDate,
        /// Disabled by the ISP: expired and not yet renewed, or suspended.
        pub disabled: bool,
        /// What renewing the current plan costs.
        #[serde(default)]
        pub renewal_rate: Option<f64>,
        /// Owed now, beyond a renewal.
        #[serde(default)]
        pub amount_due: f64,
        pub branch: String,
        /// Worked out when served, never cached.
        #[serde(default)]
        pub days_left: Option<i32>,
        #[serde(default)]
        pub expires_label: Option<String>,
    }
}

impl WorldLinkAccount {
    /// The label, or the username when there is none.
    pub fn name(&self) -> String {
        let label = self.label.trim();
        if label.is_empty() {
            self.username.clone()
        } else {
            label.to_owned()
        }
    }
}
