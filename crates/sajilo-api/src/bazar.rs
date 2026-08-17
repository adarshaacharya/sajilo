//! Gold and silver, fuel, and the Kalimati vegetable board. Ported from
//! `MetalRate.swift`, `FuelPrice.swift` and `VegetablePrice.swift`.

use chrono::NaiveDate;
use sajilo_core::NepaliDate;
use sajilo_core::tools::units::WeightUnit;

use crate::load_state::Freshness;

// The identifier enums for all three bazar feeds, kept together so the
// sections below hold only the shapes that carry data.

dto_enum! {
    pub enum Metal {
        FineGold,
        TejabiGold,
        Silver,
    }

    /// The Federation quotes per tola and per 10 grams, never per gram.
    pub enum MetalUnit {
        Tola,
        TenGram,
    }

    pub enum Fuel {
        Petrol,
        Diesel,
        Kerosene,
        Lpg,
    }

    /// Kalimati quotes almost everything per kilogram, bananas by the dozen,
    /// and pineapple by the piece.
    pub enum MarketUnit {
        Kilogram,
        Dozen,
        Piece,
    }
}

// ---------------------------------------------------------------- metals

dto! {
    /// Gold and silver as the Federation publishes them.
    ///
    /// Rates are quoted per unit, in spite of the field name the upstream API
    /// uses: its `todayBaseRatePerGram` holds 305,200 for one tola of gold, so
    /// reading it as a per-gram figure would be out by orders of magnitude.
    pub struct MetalRate {
        pub metal: Metal,
        pub unit: MetalUnit,
        pub price: f64,
        pub previous_price: f64,
    }

    pub struct MetalRateSnapshot {
        pub rates: Vec<MetalRate>,
        /// Gold price per tola over the last week, oldest first.
        #[serde(default)]
        pub gold_history: Vec<f64>,
        pub freshness: Freshness,
    }
}

impl Metal {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::FineGold => "Fine gold",
            Self::TejabiGold => "Tejabi gold",
            Self::Silver => "Silver",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::FineGold => "छापावाल सुन",
            Self::TejabiGold => "तेजाबी सुन",
            Self::Silver => "असली चाँदी",
        }
    }
}

impl MetalUnit {
    pub fn grams(self) -> f64 {
        match self {
            Self::Tola => WeightUnit::Tola.grams(),
            Self::TenGram => 10.0,
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Tola => "per tola",
            Self::TenGram => "per 10 g",
        }
    }
}

impl MetalRate {
    pub fn change(&self) -> f64 {
        self.price - self.previous_price
    }

    pub fn change_percent(&self) -> f64 {
        if self.previous_price > 0.0 {
            self.change() / self.previous_price * 100.0
        } else {
            0.0
        }
    }

    pub fn is_up(&self) -> bool {
        self.change() > 0.0
    }

    /// Derived rather than fetched: the Federation publishes tola and 10 g, and
    /// per-gram is what people divide down to at the counter.
    pub fn price_per_gram(&self) -> f64 {
        self.price / self.unit.grams()
    }
}

impl MetalRateSnapshot {
    pub fn rate(&self, metal: Metal, unit: MetalUnit) -> Option<&MetalRate> {
        self.rates
            .iter()
            .find(|rate| rate.metal == metal && rate.unit == unit)
    }

    pub fn headline(&self) -> Option<&MetalRate> {
        self.rate(Metal::FineGold, MetalUnit::Tola)
            .or_else(|| self.rates.first())
    }
}

// ------------------------------------------------------------------ fuel

dto! {
    /// Nepal Oil Corporation's retail price for one fuel.
    ///
    /// NOC revises prices on a schedule rather than continuously, so a price is
    /// effective from a date and stands until the next revision. `change`
    /// compares against the revision before it.
    pub struct FuelPrice {
        pub fuel: Fuel,
        pub price: f64,
        pub previous_price: f64,
    }

    pub struct FuelPriceSnapshot {
        pub prices: Vec<FuelPrice>,
        /// The date NOC's current rate took effect.
        pub effective_from: NaiveDate,
        pub freshness: Freshness,
    }
}

impl Fuel {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Petrol => "Petrol",
            Self::Diesel => "Diesel",
            Self::Kerosene => "Kerosene",
            Self::Lpg => "LPG cylinder",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Petrol => "पेट्रोल",
            Self::Diesel => "डिजेल",
            Self::Kerosene => "मट्टितेल",
            Self::Lpg => "ग्यास सिलिन्डर",
        }
    }

    pub fn unit_label(self) -> &'static str {
        match self {
            Self::Petrol | Self::Diesel | Self::Kerosene => "per litre",
            // NOC quotes the 14.2 kg domestic cylinder, not a per-kg figure.
            Self::Lpg => "per cylinder",
        }
    }

    /// The column heading NOC uses, lowercased.
    pub fn column_heading(self) -> &'static str {
        match self {
            Self::Petrol => "petrol",
            Self::Diesel => "diesel",
            Self::Kerosene => "kerosene",
            Self::Lpg => "lpg",
        }
    }
}

impl FuelPrice {
    pub fn change(&self) -> f64 {
        self.price - self.previous_price
    }

    pub fn is_up(&self) -> bool {
        self.change() > 0.0
    }

    pub fn is_unchanged(&self) -> bool {
        self.change().abs() < 0.005
    }
}

impl FuelPriceSnapshot {
    pub fn price(&self, fuel: Fuel) -> Option<&FuelPrice> {
        self.prices.iter().find(|price| price.fuel == fuel)
    }

    pub fn headline(&self) -> Option<&FuelPrice> {
        self.price(Fuel::Petrol).or_else(|| self.prices.first())
    }
}

// ------------------------------------------------------------ vegetables

dto! {
    /// One day's **wholesale** rate for one item at the Kalimati market — not
    /// what a neighbourhood shop charges. The UI says so explicitly.
    pub struct VegetablePrice {
        /// The Nepali name exactly as the board publishes it, qualifiers
        /// included: "गोलभेडा ठूलो(नेपाली)". Never cleaned up — the qualifier
        /// separates a local tomato from an Indian one, and they differ in
        /// price.
        pub name: String,
        pub unit: MarketUnit,
        pub minimum: f64,
        pub maximum: f64,
        pub average: f64,
        /// An English name for the items where one is unambiguous. Absent
        /// rather than guessed for the rest: a wrong label on a price list is
        /// worse than no label — someone buys the wrong thing.
        pub english_name: Option<String>,
    }

    pub struct VegetableMarketSnapshot {
        pub prices: Vec<VegetablePrice>,
        /// The board dates its own table in Bikram Sambat — "वि.सं. साउन ३१,
        /// २०८३" — which is the calendar this app already speaks.
        pub published_on: Option<NepaliDate>,
        pub freshness: Freshness,
    }
}

impl MarketUnit {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Kilogram => "per kg",
            Self::Dozen => "per dozen",
            Self::Piece => "each",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Kilogram => "प्रति के.जी.",
            Self::Dozen => "प्रति दर्जन",
            Self::Piece => "प्रति गोटा",
        }
    }

    /// The board writes kilogram four different ways in a single day's table —
    /// `के.जी.`, `के.जी`, `के जी`, `केजी` — because the rows are typed by hand.
    /// Matching on the bare letters rather than the punctuation absorbs all
    /// four, and any fifth spelling that appears later.
    pub fn parse(raw: &str) -> Option<Self> {
        let stripped: String = raw
            .chars()
            .filter(|c| !c.is_whitespace() && *c != '.')
            .collect();
        if stripped.contains("केजी") || stripped.contains("किलो") {
            return Some(Self::Kilogram);
        }
        if stripped.contains("दर्जन") {
            return Some(Self::Dozen);
        }
        if stripped.contains("गोटा") {
            return Some(Self::Piece);
        }
        None
    }
}

impl VegetableMarketSnapshot {
    pub fn price_named(&self, name: &str) -> Option<&VegetablePrice> {
        self.prices.iter().find(|price| price.name == name)
    }

    /// Matches the Nepali name or the English one, so "potato" and "आलु" both
    /// find the potatoes.
    pub fn matching(&self, query: &str) -> Vec<&VegetablePrice> {
        let trimmed = query.trim().to_lowercase();
        if trimmed.is_empty() {
            return self.prices.iter().collect();
        }
        self.prices
            .iter()
            .filter(|price| {
                price.name.to_lowercase().contains(&trimmed)
                    || price
                        .english_name
                        .as_ref()
                        .is_some_and(|english| english.to_lowercase().contains(&trimmed))
            })
            .collect()
    }
}
