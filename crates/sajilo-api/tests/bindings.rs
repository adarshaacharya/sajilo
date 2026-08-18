//! Regenerates the frontend's TypeScript view of the contract.
//!
//! `cargo test -p sajilo-api --features typescript` writes one `.ts` file per
//! DTO under `apps/desktop/src/types/api/`. CI runs this and fails if the
//! committed output differs, so a renamed Rust field breaks the TypeScript
//! build instead of failing silently at runtime.

#![cfg(feature = "typescript")]

use ts_rs::TS;

use sajilo_api::bazar::{
    Fuel, FuelPrice, FuelPriceSnapshot, MarketUnit, Metal, MetalRate, MetalRateSnapshot, MetalUnit,
    VegetableMarketSnapshot, VegetablePrice,
};
use sajilo_api::bundle::{BundleRequest, BundleResponse, ModuleKey};
use sajilo_api::forex::{ForexRate, ForexSnapshot};
use sajilo_api::load_state::{Freshness, LoadState};
use sajilo_api::meta::{FeedHealth, Health, Meta};
use sajilo_api::news::{DatePrecision, NewsDigest, NewsItem, NewsSource};
use sajilo_api::radio::{RadioDirectory, RadioStation};
use sajilo_api::rashifal::{RashiSign, Rashifal, RashifalSnapshot};
use sajilo_api::stocks::{
    MarketIndex, MarketMover, MoverBoard, StockMarketSnapshot, StockQuote,
};
use sajilo_api::weather::{
    AirQuality, AqiCategory, DailyForecast, WeatherCondition, WeatherLocation, WeatherSnapshot,
};

/// Exporting a type is what writes its `.ts` file, so every DTO must be listed
/// here or it silently never reaches the frontend.
#[test]
fn exports_every_dto() {
    sajilo_core::NepaliDate::export_all().unwrap();

    Freshness::export_all().unwrap();
    LoadState::<()>::export_all().unwrap();

    ForexRate::export_all().unwrap();
    ForexSnapshot::export_all().unwrap();

    Metal::export_all().unwrap();
    MetalUnit::export_all().unwrap();
    MetalRate::export_all().unwrap();
    MetalRateSnapshot::export_all().unwrap();
    Fuel::export_all().unwrap();
    FuelPrice::export_all().unwrap();
    FuelPriceSnapshot::export_all().unwrap();
    MarketUnit::export_all().unwrap();
    VegetablePrice::export_all().unwrap();
    VegetableMarketSnapshot::export_all().unwrap();

    WeatherLocation::export_all().unwrap();
    WeatherCondition::export_all().unwrap();
    AqiCategory::export_all().unwrap();
    AirQuality::export_all().unwrap();
    DailyForecast::export_all().unwrap();
    WeatherSnapshot::export_all().unwrap();

    NewsSource::export_all().unwrap();
    DatePrecision::export_all().unwrap();
    NewsItem::export_all().unwrap();
    NewsDigest::export_all().unwrap();

    RashiSign::export_all().unwrap();
    Rashifal::export_all().unwrap();
    RashifalSnapshot::export_all().unwrap();

    RadioStation::export_all().unwrap();
    RadioDirectory::export_all().unwrap();

    MoverBoard::export_all().unwrap();
    StockQuote::export_all().unwrap();
    MarketIndex::export_all().unwrap();
    MarketMover::export_all().unwrap();
    StockMarketSnapshot::export_all().unwrap();

    Meta::export_all().unwrap();
    FeedHealth::export_all().unwrap();
    Health::export_all().unwrap();

    ModuleKey::export_all().unwrap();
    BundleRequest::export_all().unwrap();
    BundleResponse::export_all().unwrap();
}
