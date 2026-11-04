//! Price alerts: "tell me when NABIL is below Rs 520", or fine gold per tola.

use chrono::{DateTime, Utc};

use crate::bazar::Metal;

crate::dto_enum! {
    /// Which side of the target the price has to reach.
    pub enum AlertDirection {
        Below,
        Above,
    }
}

crate::dto! {
    /// What an alert watches. Metals are watched per tola, as they are quoted.
    #[serde(tag = "kind")]
    pub enum AlertItem {
        Stock { symbol: String },
        Metal { metal: Metal },
    }

    /// When the price reached the target, and where it stood then.
    pub struct AlertHit {
        pub at: DateTime<Utc>,
        pub price: f64,
        /// The day's move, in percent, when the source gives one.
        pub change_percent: Option<f64>,
    }

    /// One alert. It goes off once and then rests until it is set again.
    pub struct PriceAlert {
        pub id: String,
        pub item: AlertItem,
        pub direction: AlertDirection,
        pub price: f64,
        pub active: bool,
        pub created_at: DateTime<Utc>,
        #[serde(default)]
        pub hit: Option<AlertHit>,
    }

    /// A new alert, or a changed one when `id` names it.
    pub struct PriceAlertInput {
        #[serde(default)]
        pub id: Option<String>,
        pub item: AlertItem,
        pub direction: AlertDirection,
        pub price: f64,
    }
}

impl AlertDirection {
    /// Whether `price` has reached `target` from this side.
    pub fn reached(self, price: f64, target: f64) -> bool {
        match self {
            Self::Below => price <= target,
            Self::Above => price >= target,
        }
    }
}

impl AlertItem {
    /// A stable key for the item, as a notification id carries it.
    pub fn key(&self) -> String {
        match self {
            Self::Stock { symbol } => format!("stock.{symbol}"),
            Self::Metal { metal } => format!(
                "metal.{}",
                match metal {
                    Metal::FineGold => "fineGold",
                    Metal::TejabiGold => "tejabiGold",
                    Metal::Silver => "silver",
                }
            ),
        }
    }
}
