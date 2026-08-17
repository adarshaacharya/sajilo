//! The behaviour the DTOs carry — unit handling, freshness, module selection.
//! Ported from the model tests in `Tests/SajiloAppTests/`.

use chrono::{TimeZone, Utc};

use sajilo_api::bazar::{
    Fuel, FuelPrice, FuelPriceSnapshot, MarketUnit, Metal, MetalRate, MetalRateSnapshot, MetalUnit,
};
use sajilo_api::bundle::{BundleRequest, ModuleKey};
use sajilo_api::forex::{ForexRate, ForexSnapshot};
use sajilo_api::load_state::{Freshness, LoadState};
use sajilo_api::weather::{AqiCategory, WeatherCondition, WeatherLocation};

fn at(secs: i64) -> chrono::DateTime<Utc> {
    Utc.timestamp_opt(secs, 0).unwrap()
}

// ------------------------------------------------------------ LoadState

/// A failed refresh must never discard what is already on screen: the value
/// survives as `Stale`, and only a cache-less failure reaches `Failed`.
#[test]
fn classifies_a_cached_value_by_age() {
    let fresh = LoadState::from_cache(1, at(1_000), 600, at(1_300));
    assert_eq!(fresh, LoadState::Fresh(1));
    assert!(!fresh.is_stale());

    let stale = LoadState::from_cache(1, at(1_000), 600, at(2_000));
    assert_eq!(stale, LoadState::Stale(1));
    assert!(stale.is_stale());

    // Exactly at the boundary counts as stale, so a value is never shown
    // unlabelled past its window.
    assert_eq!(
        LoadState::from_cache(1, at(1_000), 600, at(1_600)),
        LoadState::Stale(1)
    );
}

#[test]
fn only_fresh_and_stale_carry_a_value() {
    assert_eq!(LoadState::Fresh(7).value(), Some(&7));
    assert_eq!(LoadState::Stale(7).value(), Some(&7));
    assert_eq!(LoadState::<i32>::Loading.value(), None);
    assert_eq!(LoadState::<i32>::Unavailable.value(), None);
    assert_eq!(LoadState::<i32>::Failed("boom".into()).value(), None);
}

/// The variant must survive `map`, or a stale value could be relabelled fresh
/// on its way through a transform.
#[test]
fn map_preserves_the_variant() {
    assert_eq!(LoadState::Stale(2).map(|v| v * 2), LoadState::Stale(4));
    assert_eq!(LoadState::Fresh(2).map(|v| v * 2), LoadState::Fresh(4));
    assert_eq!(LoadState::<i32>::Loading.map(|v| v * 2), LoadState::Loading);
}

/// `LoadState` is a tagged union on the wire, so the client can switch on
/// `status` rather than sniffing which fields are present.
#[test]
fn serialises_as_a_tagged_union() {
    let json = serde_json::to_string(&LoadState::Stale(42)).unwrap();
    assert_eq!(json, r#"{"status":"stale","value":42}"#);
    assert_eq!(
        serde_json::to_string(&LoadState::<i32>::Loading).unwrap(),
        r#"{"status":"loading"}"#
    );

    let parsed: LoadState<i32> = serde_json::from_str(r#"{"status":"fresh","value":9}"#).unwrap();
    assert_eq!(parsed, LoadState::Fresh(9));
}

// ---------------------------------------------------------------- forex

fn rate(code: &str, unit: u32, buy: f64, sell: f64) -> ForexRate {
    ForexRate {
        currency_code: code.to_owned(),
        currency_name: sajilo_api::forex::currency_name(code).to_owned(),
        unit,
        buy,
        sell,
    }
}

/// NRB quotes INR per 100 and JPY per 10. Treating those as per-1 misprices
/// them by two orders of magnitude.
#[test]
fn divides_multi_unit_quotes_down_to_one() {
    let inr = rate("INR", 100, 160.0, 160.15);
    assert!((inr.buy_per_unit() - 1.60).abs() < 1e-9);
    assert_eq!(inr.unit_label(), "INR (per 100)");

    let usd = rate("USD", 1, 141.0, 141.6);
    assert_eq!(usd.buy_per_unit(), 141.0);
    assert_eq!(usd.unit_label(), "USD");
}

/// Buying and selling are different directions at different rates — the
/// customer pays the sell rate.
#[test]
fn converts_in_both_directions_at_the_right_rate() {
    let usd = rate("USD", 1, 141.0, 141.6);
    assert!((usd.npr(10.0) - 1_410.0).abs() < 1e-9);
    assert!((usd.amount_for_npr(1_416.0) - 10.0).abs() < 1e-9);

    // A zero sell rate must not divide by zero.
    assert_eq!(rate("XXX", 1, 0.0, 0.0).amount_for_npr(100.0), 0.0);
}

fn snapshot(history: Vec<(&str, Vec<f64>)>) -> ForexSnapshot {
    ForexSnapshot {
        rates: vec![rate("USD", 1, 141.0, 141.6)],
        history: history
            .into_iter()
            .map(|(code, series)| (code.to_owned(), series))
            .collect(),
        date: chrono::NaiveDate::from_ymd_opt(2026, 8, 16).unwrap(),
        published_on: Some(at(2_000)),
        modified_on: Some(at(1_000)),
        freshness: Freshness::new(at(3_000)),
    }
}

/// A trend needs at least three points and some movement, or the sparkline
/// draws a meaningless straight line.
#[test]
fn suppresses_a_trend_that_would_be_meaningless() {
    assert!(
        snapshot(vec![("USD", vec![1.0, 2.0])])
            .trend("USD")
            .is_none()
    );
    assert!(
        snapshot(vec![("USD", vec![1.0, 1.0, 1.0])])
            .trend("USD")
            .is_none(),
        "a flat series is not a trend"
    );
    assert!(
        snapshot(vec![("USD", vec![1.0, 2.0, 3.0])])
            .trend("USD")
            .is_some()
    );
    assert!(snapshot(vec![]).trend("USD").is_none());
}

/// NRB's `modified_on` can predate `published_on` — the 16 Aug rates carry a
/// 14 Aug modification — so preferring it outright would show a two-day-old
/// time against today's rates.
#[test]
fn reports_the_later_of_the_two_source_timestamps() {
    assert_eq!(snapshot(vec![]).source_timestamp(), Some(at(2_000)));
}

// ---------------------------------------------------------------- bazar

/// The Federation's `todayBaseRatePerGram` holds 305,200 for one *tola* of
/// gold. Reading it as a per-gram figure is out by an order of magnitude.
#[test]
fn derives_per_gram_from_the_quoted_unit() {
    let gold = MetalRate {
        metal: Metal::FineGold,
        unit: MetalUnit::Tola,
        price: 305_200.0,
        previous_price: 304_000.0,
    };
    assert!((gold.price_per_gram() - 305_200.0 / 11.663_803_8).abs() < 1e-6);
    assert!(
        gold.price_per_gram() < 30_000.0,
        "must not be read as per-gram"
    );
    assert!(gold.is_up());
    assert!((gold.change() - 1_200.0).abs() < 1e-9);

    // A missing previous price must not divide by zero.
    let unknown = MetalRate {
        metal: Metal::Silver,
        unit: MetalUnit::TenGram,
        price: 100.0,
        previous_price: 0.0,
    };
    assert_eq!(unknown.change_percent(), 0.0);
}

#[test]
fn picks_fine_gold_per_tola_as_the_headline() {
    let snapshot = MetalRateSnapshot {
        rates: vec![
            MetalRate {
                metal: Metal::Silver,
                unit: MetalUnit::Tola,
                price: 4_000.0,
                previous_price: 3_900.0,
            },
            MetalRate {
                metal: Metal::FineGold,
                unit: MetalUnit::Tola,
                price: 305_200.0,
                previous_price: 304_000.0,
            },
        ],
        gold_history: vec![],
        freshness: Freshness::new(at(0)),
    };
    assert_eq!(snapshot.headline().unwrap().metal, Metal::FineGold);
}

/// A revision that did not move the price reads as "No change", not "+0".
#[test]
fn treats_a_sub_paisa_move_as_unchanged() {
    let flat = FuelPrice {
        fuel: Fuel::Petrol,
        price: 171.0,
        previous_price: 171.0,
    };
    assert!(flat.is_unchanged());

    let up = FuelPrice {
        fuel: Fuel::Diesel,
        price: 158.0,
        previous_price: 156.0,
    };
    assert!(!up.is_unchanged());
    assert!(up.is_up());

    let snapshot = FuelPriceSnapshot {
        prices: vec![up.clone(), flat.clone()],
        effective_from: chrono::NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
        freshness: Freshness::new(at(0)),
    };
    assert_eq!(snapshot.headline().unwrap().fuel, Fuel::Petrol);
    assert_eq!(snapshot.price(Fuel::Lpg), None);
}

/// The board writes kilogram four different ways in a single day's table,
/// because the rows are typed by hand.
#[test]
fn absorbs_every_spelling_of_the_market_unit() {
    for raw in ["के.जी.", "के.जी", "के जी", "केजी", " केजी "]
    {
        assert_eq!(MarketUnit::parse(raw), Some(MarketUnit::Kilogram), "{raw}");
    }
    assert_eq!(MarketUnit::parse("प्रति दर्जन"), Some(MarketUnit::Dozen));
    assert_eq!(MarketUnit::parse("गोटा"), Some(MarketUnit::Piece));
    assert_eq!(MarketUnit::parse("किलो"), Some(MarketUnit::Kilogram));
    // An unrecognised unit is reported as such rather than guessed at.
    assert_eq!(MarketUnit::parse("प्रति बोरा"), None);
}

// -------------------------------------------------------------- weather

#[test]
fn maps_wmo_codes_to_conditions() {
    assert_eq!(WeatherCondition::from_wmo_code(0), WeatherCondition::Clear);
    assert_eq!(
        WeatherCondition::from_wmo_code(3),
        WeatherCondition::Overcast
    );
    assert_eq!(WeatherCondition::from_wmo_code(65), WeatherCondition::Rain);
    assert_eq!(
        WeatherCondition::from_wmo_code(95),
        WeatherCondition::Thunderstorm
    );
    // An unknown code must degrade, never panic or masquerade as clear skies.
    assert_eq!(
        WeatherCondition::from_wmo_code(7),
        WeatherCondition::Unknown
    );
    assert_eq!(
        WeatherCondition::from_wmo_code(999),
        WeatherCondition::Unknown
    );
}

#[test]
fn bands_the_us_aqi_at_its_published_breakpoints() {
    assert_eq!(AqiCategory::from_us_aqi(0), AqiCategory::Good);
    assert_eq!(AqiCategory::from_us_aqi(50), AqiCategory::Good);
    assert_eq!(AqiCategory::from_us_aqi(51), AqiCategory::Moderate);
    assert_eq!(
        AqiCategory::from_us_aqi(150),
        AqiCategory::UnhealthyForSensitive
    );
    assert_eq!(AqiCategory::from_us_aqi(201), AqiCategory::VeryUnhealthy);
    assert_eq!(AqiCategory::from_us_aqi(500), AqiCategory::Hazardous);
}

#[test]
fn weather_locations_round_trip_through_their_key() {
    for location in WeatherLocation::ALL {
        assert_eq!(WeatherLocation::from_key(location.key()), Some(location));
        assert!(!location.display_name().is_empty());
        assert!(!location.nepali_name().is_empty());
    }
    assert_eq!(WeatherLocation::from_key("biratnagar"), None);
    assert_eq!(WeatherLocation::default(), WeatherLocation::Kathmandu);
}

// --------------------------------------------------------------- bundle

/// An empty request means "everything", so a client that sends no filter still
/// gets a full popover.
#[test]
fn an_empty_request_asks_for_every_module() {
    let all = BundleRequest {
        modules: vec![],
        weather_location: None,
    };
    assert_eq!(all.requested().len(), ModuleKey::ALL.len());

    let some = BundleRequest {
        modules: vec![ModuleKey::Forex, ModuleKey::News],
        weather_location: None,
    };
    assert_eq!(some.requested(), vec![ModuleKey::Forex, ModuleKey::News]);
}

#[test]
fn module_keys_round_trip_through_their_wire_spelling() {
    for module in ModuleKey::ALL {
        assert_eq!(ModuleKey::from_key(module.key()), Some(module));
    }
    assert_eq!(ModuleKey::from_key("stocks"), None);
}

/// The key is also the JSON spelling, so a query string and a payload can never
/// disagree about what a module is called.
#[test]
fn the_module_key_matches_its_serialised_form() {
    for module in ModuleKey::ALL {
        let json = serde_json::to_string(&module).unwrap();
        assert_eq!(json, format!("\"{}\"", module.key()));
    }
}
