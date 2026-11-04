//! Price alerts: "tell me when NABIL is below Rs 520", or fine gold per tola.
//!
//! An alert goes off once, when the price reaches its target, and then rests
//! until it is set again: a target is usually wanted once, and a price
//! wobbling around it must not chime every few minutes. One set on the wrong
//! side already (NABIL at 510, "below 520") waits for the price to cross back
//! first rather than going off the moment it is saved.
//!
//! Checking reads the same cached feeds the Bazar screens show, fetched on
//! their own rhythm: stocks every minute or so while the market is open,
//! metals as the Federation publishes. The notification itself is planned like
//! every other reminder, so quiet hours, the card style and `LastFired` apply.

use std::time::Duration;

use chrono::{DateTime, Utc};
use sajilo_api::alerts::{AlertDirection, AlertHit, AlertItem, PriceAlert, PriceAlertInput};
use sajilo_api::bazar::{Metal, MetalUnit};
use sajilo_core::focus::Language;
use sajilo_core::notify::{PlannedNotification, ReminderKind, still_deliverable};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

const ALERTS_KEY: &str = "priceAlerts.v1";
/// Enough for a real watchlist; past it, alerts stop meaning anything.
const MAX_ALERTS: usize = 20;
/// How often armed alerts are checked. The feeds decide how often that
/// actually reaches the network.
const CHECK_EVERY: Duration = Duration::from_secs(2 * 60);

/// An alert as stored: the shared shape, plus whether it is still waiting for
/// the price to come back across its target before it may go off.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    #[serde(flatten)]
    alert: PriceAlert,
    #[serde(default)]
    waiting_cross: bool,
}

fn load(app: &AppHandle<Wry>) -> Vec<Stored> {
    db::get_json(app, ALERTS_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle<Wry>, alerts: &[Stored]) -> Result<(), String> {
    let value = serde_json::to_value(alerts).map_err(|error| error.to_string())?;
    db::set_json(app, ALERTS_KEY, &value).map_err(|error| error.clone())
}

fn shown(alerts: &[Stored]) -> Vec<PriceAlert> {
    alerts.iter().map(|stored| stored.alert.clone()).collect()
}

/// The price an item stands at now, and its move today in percent.
type Quote = (f64, Option<f64>);

/// Today's prices for every item an alert might watch, from the feeds.
async fn quotes(
    app: &AppHandle<Wry>,
    stocks: bool,
    metals: bool,
) -> impl Fn(&AlertItem) -> Option<Quote> + use<> {
    let stocks = if stocks {
        super::stocks::get_stocks(app.clone(), None)
            .await
            .value()
            .cloned()
    } else {
        None
    };
    let metals = if metals {
        super::bazar::get_bazar(app.clone(), None)
            .await
            .metals
            .value()
            .cloned()
    } else {
        None
    };
    move |item: &AlertItem| match item {
        AlertItem::Stock { symbol } => {
            let quote = stocks
                .as_ref()?
                .quotes
                .iter()
                .find(|quote| quote.symbol.eq_ignore_ascii_case(symbol))?;
            (quote.ltp > 0.0).then_some((quote.ltp, Some(quote.change_percent)))
        }
        AlertItem::Metal { metal } => {
            let rate = metals.as_ref()?.rate(*metal, MetalUnit::Tola)?;
            let change = (rate.previous_price > 0.0)
                .then(|| (rate.price / rate.previous_price - 1.0) * 100.0);
            (rate.price > 0.0).then_some((rate.price, change))
        }
    }
}

/// Moves every armed alert on by the prices now. Returns whether any went off.
fn evaluate(
    alerts: &mut [Stored],
    quote: impl Fn(&AlertItem) -> Option<Quote>,
    now: DateTime<Utc>,
) -> bool {
    let mut fired = false;
    for stored in alerts.iter_mut().filter(|stored| stored.alert.active) {
        let Some((price, change_percent)) = quote(&stored.alert.item) else {
            continue;
        };
        let reached = stored.alert.direction.reached(price, stored.alert.price);
        if stored.waiting_cross {
            stored.waiting_cross = reached;
            continue;
        }
        if reached {
            stored.alert.active = false;
            stored.alert.hit = Some(AlertHit {
                at: now,
                price,
                change_percent,
            });
            fired = true;
        }
    }
    fired
}

/// Checks armed alerts against the prices now.
async fn check(app: &AppHandle<Wry>) {
    if !crate::background_refresh::enabled(app, prefs::BAZAR_ENABLED) {
        return;
    }
    let alerts = load(app);
    let armed = |stock: bool| {
        alerts.iter().any(|stored| {
            stored.alert.active && matches!(stored.alert.item, AlertItem::Stock { .. }) == stock
        })
    };
    let (stocks, metals) = (armed(true), armed(false));
    if !stocks && !metals {
        return;
    }
    let quote = quotes(app, stocks, metals).await;
    // Read again: the user may have changed an alert while prices loaded.
    let mut alerts = load(app);
    // Saved either way: a waiting alert may have crossed back.
    let fired = evaluate(&mut alerts, quote, Utc::now());
    let _ = save(app, &alerts);
    if fired {
        super::notify::reschedule();
    }
}

/// Checks armed alerts every couple of minutes for as long as the app runs.
pub fn spawn(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        loop {
            check(&app).await;
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

#[tauri::command]
pub fn price_alerts(app: AppHandle<Wry>) -> Vec<PriceAlert> {
    shown(&load(&app))
}

/// Sets a new alert, or changes one (and arms it again) when `id` names it.
#[tauri::command]
pub async fn set_price_alert(
    app: AppHandle<Wry>,
    input: PriceAlertInput,
) -> Result<Vec<PriceAlert>, String> {
    if !input.price.is_finite() || input.price <= 0.0 {
        return Err("an alert needs a price above zero".to_owned());
    }
    let item = match input.item {
        AlertItem::Stock { symbol } => {
            let symbol = symbol.trim().to_ascii_uppercase();
            if !sajilo_providers::sharehub_chart::valid_symbol(&symbol) {
                return Err(format!("unknown symbol {symbol}"));
            }
            AlertItem::Stock { symbol }
        }
        metal @ AlertItem::Metal { .. } => metal,
    };
    let stock = matches!(item, AlertItem::Stock { .. });
    let quote = quotes(&app, stock, !stock).await;
    let waiting_cross =
        quote(&item).is_some_and(|(price, _)| input.direction.reached(price, input.price));

    let mut alerts = load(&app);
    let id = input
        .id
        .filter(|id| alerts.iter().any(|stored| stored.alert.id == *id));
    if id.is_none() && alerts.len() >= MAX_ALERTS {
        return Err(format!("up to {MAX_ALERTS} alerts"));
    }
    let now = Utc::now();
    let alert = Stored {
        alert: PriceAlert {
            id: id
                .clone()
                .unwrap_or_else(|| now.timestamp_millis().to_string()),
            item,
            direction: input.direction,
            price: input.price,
            active: true,
            created_at: now,
            hit: None,
        },
        waiting_cross,
    };
    match id {
        Some(id) => {
            if let Some(slot) = alerts.iter_mut().find(|stored| stored.alert.id == id) {
                *slot = alert;
            }
        }
        None => alerts.push(alert),
    }
    save(&app, &alerts)?;
    super::notify::reschedule();
    Ok(shown(&alerts))
}

#[tauri::command]
pub fn delete_price_alert(app: AppHandle<Wry>, id: String) -> Result<Vec<PriceAlert>, String> {
    let mut alerts = load(&app);
    alerts.retain(|stored| stored.alert.id != id);
    save(&app, &alerts)?;
    super::notify::reschedule();
    Ok(shown(&alerts))
}

/// The alerts that went off recently, as notifications.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let language = prefs::language(app);
    load(app)
        .iter()
        .filter_map(|stored| {
            let alert = &stored.alert;
            let hit = alert.hit.as_ref()?;
            if !still_deliverable(hit.at, now) {
                return None;
            }
            let (title, body) = words(alert, hit, language);
            Some(PlannedNotification {
                id: format!(
                    "sajilo.alert.{}.{}.{}",
                    alert.item.key(),
                    alert.id,
                    hit.at.timestamp()
                ),
                kind: ReminderKind::PriceAlert,
                title,
                body,
                fire_at: hit.at,
            })
        })
        .collect()
}

fn metal_name(metal: Metal, language: Language) -> &'static str {
    match (metal, language) {
        (Metal::FineGold, Language::En) => "Fine gold",
        (Metal::TejabiGold, Language::En) => "Tejabi gold",
        (Metal::Silver, Language::En) => "Silver",
        (Metal::FineGold, Language::Ne) => "छापावाल सुन",
        (Metal::TejabiGold, Language::Ne) => "तेजाबी सुन",
        (Metal::Silver, Language::Ne) => "चाँदी",
    }
}

/// What the notification says: where the price is, in words a person would
/// use, then how far past the target and what it did today.
fn words(alert: &PriceAlert, hit: &AlertHit, language: Language) -> (String, String) {
    let rs = |value: f64| rupees(value, language);
    let below = alert.direction == AlertDirection::Below;
    let title = match (&alert.item, language, below) {
        (AlertItem::Stock { symbol }, Language::En, true) => {
            format!("{symbol} is down to {}", rs(hit.price))
        }
        (AlertItem::Stock { symbol }, Language::En, false) => {
            format!("{symbol} crossed {}", rs(hit.price))
        }
        (AlertItem::Stock { symbol }, Language::Ne, true) => {
            format!("{symbol} {} मा झर्‍यो", rs(hit.price))
        }
        (AlertItem::Stock { symbol }, Language::Ne, false) => {
            format!("{symbol} {} नाघ्यो", rs(hit.price))
        }
        (AlertItem::Metal { metal }, Language::En, _) => {
            format!(
                "{} is now {} a tola",
                metal_name(*metal, language),
                rs(hit.price)
            )
        }
        (AlertItem::Metal { metal }, Language::Ne, _) => {
            format!(
                "{} अहिले तोलाको {}",
                metal_name(*metal, language),
                rs(hit.price)
            )
        }
    };

    let gap = (hit.price - alert.price).abs();
    let past = match (language, below, gap < 0.005) {
        (Language::En, _, true) => format!("Right at your {} target", rs(alert.price)),
        (Language::En, true, false) => {
            format!("{} below your {} target", rs(gap), rs(alert.price))
        }
        (Language::En, false, false) => {
            format!("{} above your {} target", rs(gap), rs(alert.price))
        }
        (Language::Ne, _, true) => format!("तपाईंको {} लक्ष्यमै", rs(alert.price)),
        (Language::Ne, true, false) => {
            format!("तपाईंको {} लक्ष्यभन्दा {} तल", rs(alert.price), rs(gap))
        }
        (Language::Ne, false, false) => {
            format!("तपाईंको {} लक्ष्यभन्दा {} माथि", rs(alert.price), rs(gap))
        }
    };
    let today = hit
        .change_percent
        .filter(|change| change.abs() >= 0.01)
        .map(|change| {
            let amount = format!("{:.1}%", change.abs());
            match (language, change < 0.0) {
                (Language::En, true) => format!("down {amount} today"),
                (Language::En, false) => format!("up {amount} today"),
                (Language::Ne, true) => format!("आज {} घट्यो", nepali_digits(&amount)),
                (Language::Ne, false) => format!("आज {} बढ्यो", nepali_digits(&amount)),
            }
        });
    let body = match today {
        Some(today) => format!("{past} · {today}"),
        None => past,
    };
    (title, body)
}

/// Rupees as Nepal writes them: lakh grouping (2,68,500), paisa only under a
/// thousand, Nepali digits in Nepali.
fn rupees(value: f64, language: Language) -> String {
    let text = if value >= 1000.0 {
        group_lakh(value.round() as u64)
    } else {
        let fixed = format!("{value:.2}");
        fixed
            .strip_suffix(".00")
            .map_or_else(|| fixed.clone(), str::to_owned)
    };
    match language {
        Language::En => format!("Rs {text}"),
        Language::Ne => format!("रु {}", nepali_digits(&text)),
    }
}

fn group_lakh(value: u64) -> String {
    let digits = value.to_string();
    if digits.len() <= 3 {
        return digits;
    }
    let (head, last3) = digits.split_at(digits.len() - 3);
    let mut groups: Vec<&str> = Vec::new();
    let mut rest = head;
    while rest.len() > 2 {
        let (left, right) = rest.split_at(rest.len() - 2);
        groups.push(right);
        rest = left;
    }
    groups.push(rest);
    groups.reverse();
    format!("{},{last3}", groups.join(","))
}

fn nepali_digits(text: &str) -> String {
    text.chars()
        .map(|c| {
            c.to_digit(10)
                .map_or(c, |d| char::from_u32(0x0966 + d).unwrap_or(c))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(minutes: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_800_000_000 + minutes * 60, 0).unwrap()
    }

    fn alert(direction: AlertDirection, price: f64, waiting_cross: bool) -> Stored {
        Stored {
            alert: PriceAlert {
                id: "1".to_owned(),
                item: AlertItem::Stock {
                    symbol: "NABIL".to_owned(),
                },
                direction,
                price,
                active: true,
                created_at: at(0),
                hit: None,
            },
            waiting_cross,
        }
    }

    #[test]
    fn goes_off_once_when_the_target_is_reached() {
        let mut alerts = vec![alert(AlertDirection::Below, 520.0, false)];
        assert!(!evaluate(&mut alerts, |_| Some((530.0, None)), at(1)));
        assert!(evaluate(&mut alerts, |_| Some((518.0, Some(-3.1))), at(2)));
        let hit = alerts[0].alert.hit.clone().unwrap();
        assert_eq!(hit.price, 518.0);
        assert!(!alerts[0].alert.active);
        // Wobbling around the target afterwards says nothing more.
        assert!(!evaluate(&mut alerts, |_| Some((515.0, None)), at(3)));
    }

    #[test]
    fn set_on_the_far_side_waits_for_the_price_to_cross_back() {
        let mut alerts = vec![alert(AlertDirection::Below, 520.0, true)];
        assert!(!evaluate(&mut alerts, |_| Some((510.0, None)), at(1)));
        assert!(!evaluate(&mut alerts, |_| Some((525.0, None)), at(2)));
        assert!(evaluate(&mut alerts, |_| Some((519.0, None)), at(3)));
    }

    #[test]
    fn an_unknown_price_changes_nothing() {
        let mut alerts = vec![alert(AlertDirection::Above, 650.0, false)];
        assert!(!evaluate(&mut alerts, |_| None, at(1)));
        assert!(alerts[0].alert.active);
    }

    #[test]
    fn says_where_the_price_is_and_how_far_past() {
        let stored = alert(AlertDirection::Below, 520.0, false);
        let hit = AlertHit {
            at: at(1),
            price: 518.0,
            change_percent: Some(-3.1),
        };
        let (title, body) = words(&stored.alert, &hit, Language::En);
        assert_eq!(title, "NABIL is down to Rs 518");
        assert_eq!(body, "Rs 2 below your Rs 520 target · down 3.1% today");
    }

    #[test]
    fn gold_reads_per_tola_in_lakh_grouping() {
        let gold = PriceAlert {
            item: AlertItem::Metal {
                metal: Metal::FineGold,
            },
            price: 270_000.0,
            ..alert(AlertDirection::Below, 0.0, false).alert
        };
        let hit = AlertHit {
            at: at(1),
            price: 268_500.0,
            change_percent: None,
        };
        let (title, body) = words(&gold, &hit, Language::En);
        assert_eq!(title, "Fine gold is now Rs 2,68,500 a tola");
        assert_eq!(body, "Rs 1,500 below your Rs 2,70,000 target");
        let (title, _) = words(&gold, &hit, Language::Ne);
        assert_eq!(title, "छापावाल सुन अहिले तोलाको रु २,६८,५००");
    }

    #[test]
    fn groups_in_lakhs() {
        assert_eq!(group_lakh(999), "999");
        assert_eq!(group_lakh(1_500), "1,500");
        assert_eq!(group_lakh(268_500), "2,68,500");
        assert_eq!(group_lakh(12_345_678), "1,23,45,678");
    }
}
