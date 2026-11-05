//! A quiet line on a break card about a part of Sajilo the user hasn't
//! opened yet.
//!
//! The words come from the jokes pack, so they can change without a release;
//! when one may show is decided here and nowhere else, so no pack can turn
//! break cards into a stream of promotions: at most one a day, never for a
//! screen already opened or switched off, never the same one two days
//! running, and never with Settings › Notifications › Sajilo tips off.
//! A pack may date a tip (`from` / `until`) to run it for a season only;
//! inside its dates it goes ahead of the undated ones, under the same rules.

use chrono::{Datelike, NaiveDate};
use sajilo_core::config::Pack;
use sajilo_core::config::jokes::JokesPack;
use sajilo_core::focus::Language;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

/// Screens opened at least once, by name, kept on this computer only.
const OPENED_KEY: &str = "tips.openedScreens";
/// The last tip shown, and the day it was.
const LAST_KEY: &str = "tips.last";

/// Where each tip feature leads, the screen whose opening retires it, and the
/// module switch that must be on for it to be suggested.
const FEATURES: [(&str, &str, &str, Option<&str>); 22] = [
    ("games", "/games", "games", Some(prefs::GAMES_ENABLED)),
    ("radio", "/radio", "radio", Some(prefs::RADIO_ENABLED)),
    ("notes", "/notes", "notes", Some(prefs::NOTES_ENABLED)),
    (
        "rashifal",
        "/rashifal",
        "rashifal",
        Some(prefs::RASHIFAL_ENABLED),
    ),
    (
        "weather",
        "/weather",
        "weather",
        Some(prefs::WEATHER_ENABLED),
    ),
    ("jobs", "/jobs", "jobs", Some(prefs::JOBS_ENABLED)),
    ("bills", "/bills", "bills", Some(prefs::BILLS_ENABLED)),
    (
        "documents",
        "/keeper",
        "keeper",
        Some(prefs::KEEPER_ENABLED),
    ),
    ("tools", "/tools", "tools", Some(prefs::TOOLS_ENABLED)),
    ("converter", "/converter", "converter", None),
    // Parts of screens people already open: told about until first used,
    // not until the screen is seen. See `already_used`.
    ("newsAlerts", "/news", "", Some(prefs::NEWS_ENABLED)),
    ("clocks", "/tools?tab=clock", "", None),
    (
        "stocks",
        "/bazar?tab=stocks",
        "",
        Some(prefs::BAZAR_ENABLED),
    ),
    ("gold", "/bazar?tab=metals", "", Some(prefs::BAZAR_ENABLED)),
    // A day's page, and markets inside Bazar's Stocks tab, seen as tabs are.
    ("panchang", "/day", "day", None),
    (
        "crypto",
        "/bazar?tab=stocks&view=crypto",
        "tab.stocks.crypto",
        Some(prefs::BAZAR_ENABLED),
    ),
    (
        "shares",
        "/bazar?tab=stocks&view=nepse",
        "tab.stocks.nepse",
        Some(prefs::BAZAR_ENABLED),
    ),
    (
        "typing",
        "/tools?tab=nepali",
        "tab.tools.nepali",
        Some(prefs::TOOLS_ENABLED),
    ),
    (
        "forex",
        "/bazar?tab=forex",
        "tab.bazar.forex",
        Some(prefs::FOREX_ENABLED),
    ),
    (
        "fuel",
        "/bazar?tab=fuel",
        "tab.bazar.fuel",
        Some(prefs::BAZAR_ENABLED),
    ),
    (
        "vegetables",
        "/bazar?tab=vegetables",
        "tab.bazar.vegetables",
        Some(prefs::BAZAR_ENABLED),
    ),
    (
        "emergency",
        "/tools?tab=emergency",
        "tab.tools.emergency",
        Some(prefs::TOOLS_ENABLED),
    ),
];

/// Whether a part of a screen has been put to use: a newsroom followed, a
/// city's clock added, a price alert set on a share or on gold.
fn already_used(app: &AppHandle<Wry>, feature: &str) -> bool {
    let stored = |key: &str| db::get_json(app, key).ok().flatten();
    let alert_on = |kind: &str| {
        stored("priceAlerts.v1")
            .and_then(|value| value.as_array().cloned())
            .is_some_and(|alerts| {
                alerts
                    .iter()
                    .any(|alert| alert["item"]["kind"].as_str() == Some(kind))
            })
    };
    match feature {
        "newsAlerts" => stored("news.follows")
            .and_then(|value| {
                value["sources"]
                    .as_object()
                    .map(|sources| !sources.is_empty())
            })
            .unwrap_or(false),
        "clocks" => stored("clocks")
            .and_then(|value| value.as_array().map(|cities| !cities.is_empty()))
            .unwrap_or(false),
        "stocks" => alert_on("stock"),
        "gold" => alert_on("metal"),
        _ => false,
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Last {
    day: Option<NaiveDate>,
    feature: String,
}

/// What a break card shows: the line, and the screen it opens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakTip {
    pub text: String,
    pub route: String,
}

fn read<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// Notes a screen as opened, from the same event the usage report counts.
/// Kept whether or not that report is on: it never leaves the computer.
pub fn note_opened(app: &AppHandle<Wry>, event: &str) {
    // A screen by its name; a tab inside one by its whole event.
    let screen = match event.strip_prefix("screen.") {
        Some(screen) => screen,
        None if event.starts_with("tab.") => event,
        None => return,
    };
    let mut opened: Vec<String> = read(app, OPENED_KEY);
    if opened.iter().any(|seen| seen == screen) {
        return;
    }
    opened.push(screen.to_owned());
    let _ = db::set_json(app, OPENED_KEY, &serde_json::json!(opened));
}

/// The tip, if any, among `tips` that may show on `day`: inside its dates,
/// for a feature not opened, switched on, and not the one shown last. A dated
/// tip running today goes first; within either kind it rotates by day so
/// each eligible one gets its turn.
fn pick<'a>(
    tips: &'a [sajilo_core::config::jokes::Tip],
    eligible: impl Fn(&str) -> bool,
    last: &Last,
    day: NaiveDate,
) -> Option<&'a sajilo_core::config::jokes::Tip> {
    if last.day == Some(day) {
        return None;
    }
    let open: Vec<_> = tips
        .iter()
        .filter(|tip| tip.runs_on(day) && tip.feature != last.feature && eligible(&tip.feature))
        .collect();
    let dated: Vec<_> = open.iter().copied().filter(|tip| tip.is_dated()).collect();
    let candidates = if dated.is_empty() { open } else { dated };
    if candidates.is_empty() {
        return None;
    }
    let turn = usize::try_from(day.num_days_from_ce()).unwrap_or(0) % candidates.len();
    candidates.get(turn).copied()
}

/// A tip for the break card now showing. An example card always gets one, so
/// it can be seen, and records nothing.
#[tauri::command]
pub fn break_tip(app: AppHandle<Wry>, preview: bool) -> Option<BreakTip> {
    if !super::notify::options(&app).sajilo_tips {
        return None;
    }
    let opened: Vec<String> = read(&app, OPENED_KEY);
    let feature = |name: &str| FEATURES.iter().find(|(id, ..)| *id == name);
    let eligible = |name: &str| {
        feature(name).is_some_and(|(id, _, screen, module)| {
            (screen.is_empty() || !opened.iter().any(|seen| seen == screen))
                && !already_used(&app, id)
                && module.is_none_or(|key| crate::background_refresh::enabled(&app, key))
        })
    };
    let last: Last = if preview {
        Last::default()
    } else {
        read(&app, LAST_KEY)
    };
    let day = sajilo_core::nepal_time::today();
    let pack = JokesPack::active();
    let tip = pick(&pack.tips, eligible, &last, day)?;
    let (_, route, ..) = feature(&tip.feature)?;
    if !preview {
        let _ = db::set_json(
            &app,
            LAST_KEY,
            &serde_json::json!(Last {
                day: Some(day),
                feature: tip.feature.clone(),
            }),
        );
    }
    Some(BreakTip {
        text: match prefs::language(&app) {
            Language::Ne => tip.ne.clone(),
            Language::En => tip.en.clone(),
        },
        route: (*route).to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sajilo_core::config::jokes::{TIP_FEATURES, Tip};

    fn tip(feature: &str) -> Tip {
        Tip {
            feature: feature.to_owned(),
            en: feature.to_owned(),
            ne: feature.to_owned(),
            from: None,
            until: None,
        }
    }

    fn dated(feature: &str, from: u32, until: u32) -> Tip {
        Tip {
            from: Some(day(from)),
            until: Some(day(until)),
            ..tip(feature)
        }
    }

    fn day(n: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, n).unwrap()
    }

    #[test]
    fn every_pack_feature_leads_somewhere() {
        for name in TIP_FEATURES {
            assert!(FEATURES.iter().any(|(id, ..)| *id == name), "{name}");
        }
    }

    #[test]
    fn one_a_day_at_most() {
        let tips = [tip("games"), tip("radio")];
        let shown = Last {
            day: Some(day(4)),
            feature: "games".to_owned(),
        };
        assert!(pick(&tips, |_| true, &shown, day(4)).is_none());
        assert!(pick(&tips, |_| true, &shown, day(5)).is_some());
    }

    #[test]
    fn never_the_same_feature_two_days_running() {
        let tips = [tip("games"), tip("radio")];
        let shown = Last {
            day: Some(day(4)),
            feature: "games".to_owned(),
        };
        assert_eq!(
            pick(&tips, |_| true, &shown, day(5)).map(|t| t.feature.as_str()),
            Some("radio")
        );
        // With games the only one left, it waits a day rather than repeat.
        let only = [tip("games")];
        assert!(pick(&only, |_| true, &shown, day(5)).is_none());
    }

    #[test]
    fn opened_or_switched_off_features_are_never_suggested() {
        let tips = [tip("games"), tip("radio")];
        let none_yet = Last::default();
        assert!(pick(&tips, |_| false, &none_yet, day(4)).is_none());
        assert_eq!(
            pick(&tips, |name| name == "radio", &none_yet, day(4)).map(|t| t.feature.as_str()),
            Some("radio")
        );
    }

    #[test]
    fn a_dated_tip_shows_only_inside_its_dates_and_goes_first() {
        let tips = [tip("games"), dated("radio", 10, 12)];
        let none_yet = Last::default();
        let shown = |n| pick(&tips, |_| true, &none_yet, day(n)).map(|t| t.feature.as_str());
        assert_eq!(shown(9), Some("games"));
        assert_eq!(shown(10), Some("radio"));
        assert_eq!(shown(12), Some("radio"));
        assert_eq!(shown(13), Some("games"));
    }
}
