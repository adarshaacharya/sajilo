//! Records the answers the landing page's embedded app plays back.
//!
//! The landing page does not ship screenshots. It embeds the real desktop UI —
//! the same React tree, the same stylesheet — with the Tauri IPC layer swapped
//! for a recording. This binary makes that recording, and it makes it the only
//! way it can be trusted: by running the same `sajilo-core` calendar engine and
//! the same `sajilo-providers` parsers the desktop app runs, over the fixtures
//! in `fixtures/`. Nothing here is hand-written sample data, so nothing here can
//! describe a product that does not exist.
//!
//! Everything is pinned to `RECORDED_ON` so two runs produce identical bytes and
//! a regenerated file shows a real diff rather than a timestamp churn. The
//! showcase shifts the instants forward at load time, which is why a recorded
//! headline still reads "2 hours ago" a year from now.
//!
//! ```sh
//! cargo run -p sajilo-showcase-data
//! ```

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, Utc};
use sajilo_api::news::NewsSource;
use sajilo_api::news::NewsSourceInfo;
use sajilo_core::NepaliDate;
use sajilo_core::calendar::bikram_sambat as bs;
use sajilo_core::calendar::events::{FIRST_EVENT_YEAR, LAST_EVENT_YEAR, events};
use sajilo_core::calendar::month::month;
use sajilo_core::calendar::{panchanga, upcoming};
use sajilo_providers::{
    fenegosida, hamropatro, kalimati, kantipur, noc, nrb, open_meteo, ratopati, rss, sharesansar,
};
use serde::Serialize;
use serde_json::{Value, json};

/// The day the showcase depicts. A calendar app has to be *on* a date, and a
/// recording has to be on a fixed one, so this is the day the fixtures in
/// `fixtures/` were themselves captured — the app is shown telling the truth
/// about a real Nepali day rather than about no day at all.
const RECORDED_ON: &str = "2026-08-26T14:20:00Z";

/// How many headlines the desktop app asks its feeds for.
const NEWS_LIMIT: usize = 60;

fn main() {
    let now: DateTime<Utc> = RECORDED_ON.parse().expect("RECORDED_ON is a valid instant");
    let root = repo_root();

    let mut commands = BTreeMap::<String, Value>::new();
    calendar(&mut commands, now);
    modules(&mut commands, &root, now);
    tools(&mut commands);
    system(&mut commands);
    grouped_numbers(&mut commands);

    let document = json!({
        "recordedAt": now.to_rfc3339(),
        "commands": commands,
    });

    let destination = root.join("apps/showcase/src/data/scenes.json");
    let mut text = serde_json::to_string_pretty(&document).expect("the document is plain JSON");
    text.push('\n');
    std::fs::write(&destination, text).expect("the showcase data directory exists");

    println!(
        "wrote {} commands to {}",
        commands.len(),
        destination.display()
    );
}

/// `CARGO_MANIFEST_DIR` is `apps/showcase-data`; the fixtures are two levels up.
fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the crate sits two levels below the repository root")
        .to_path_buf()
}

fn insert<T: Serialize>(commands: &mut BTreeMap<String, Value>, key: &str, value: &T) {
    commands.insert(
        key.to_owned(),
        serde_json::to_value(value).expect("every recorded payload is a serde type"),
    );
}

/// A module that could not be parsed is recorded as the failure the desktop app
/// would itself show. Silently dropping it would let the landing page claim a
/// screen works when the parser behind it has broken.
fn load_state<T: Serialize, E: std::fmt::Display>(result: Result<T, E>) -> Value {
    match result {
        Ok(value) => json!({ "status": "fresh", "value": value }),
        Err(error) => json!({ "status": "failed", "value": error.to_string() }),
    }
}

// ------------------------------------------------------------------ calendar

/// The calendar screens, computed rather than transcribed: the month grid, the
/// festivals on it, and the sunrise the day-detail screen reports are all the
/// engine's own output for `RECORDED_ON`.
fn calendar(commands: &mut BTreeMap<String, Value>, now: DateTime<Utc>) {
    let gregorian = now.date_naive();
    let today = bs::nepali_date_from(gregorian).expect("the recorded day is inside the BS table");

    insert(
        commands,
        "today",
        &json!({
            "nepali": today,
            "gregorian": gregorian.to_string(),
            "nepaliMonthName": today.nepali_month_name(),
            "englishMonthName": today.english_month_name(),
            "weekday": gregorian.weekday().num_days_from_sunday(),
        }),
    );

    // The month either side too, so paging the grid in the showcase moves
    // instead of hitting an empty answer.
    for offset in -1..=1 {
        let first = bs::adding_months(offset, NepaliDate::new(today.year, today.month, 1))
            .expect("one month either side of today is inside the table");
        let grid = month(first, today).expect("the engine can draw its own month");
        insert(
            commands,
            &format!("month_grid:{}:{}", first.year, first.month),
            &grid,
        );
        insert(
            commands,
            &format!("shift_month:{}:{}:{offset}", today.year, today.month),
            &first,
        );

        for (day, event) in events(first.year, first.month) {
            insert(
                commands,
                &format!("events_for:{}:{}:{day}", first.year, first.month),
                &event,
            );
        }
    }

    insert(
        commands,
        "upcoming_events",
        &upcoming::events(
            today,
            upcoming::DEFAULT_LIMIT,
            upcoming::DEFAULT_HORIZON_DAYS,
        ),
    );

    insert(
        commands,
        "supported_range",
        &json!({
            "firstYear": bs::FIRST_YEAR,
            "lastYear": bs::LAST_YEAR,
            "firstEventYear": FIRST_EVENT_YEAR,
            "lastEventYear": LAST_EVENT_YEAR,
        }),
    );

    // Sunrise, sunset and Rahu Kaal for the days the showcase can reach: today,
    // and every other day of the month the grid puts one tap away.
    let days_in_month = bs::days_in_month(today.year, today.month).unwrap_or(30);
    let days_in_month = u32::try_from(days_in_month).unwrap_or(30);
    for day in 1..=days_in_month {
        let date = NepaliDate::new(today.year, today.month, day);
        let Ok(ad) = bs::gregorian_date_from(date) else {
            continue;
        };
        if let Some(reading) = panchanga::panchanga_for(ad) {
            insert(commands, &format!("panchanga_for:{ad}"), &reading);
        }
    }

    // The date converter opens on today in both directions.
    let conversion = json!({
        "nepali": today,
        "gregorian": gregorian.to_string(),
        "nepaliMonthName": today.nepali_month_name(),
        "englishMonthName": today.english_month_name(),
        "weekday": gregorian.weekday().num_days_from_sunday(),
    });
    insert(commands, "bs_to_ad", &conversion);
    insert(commands, "ad_to_bs", &conversion);

    // Nobody's private notes belong on a marketing page, and an invented plan
    // would be a claim about a real day. Both plan lists are simply empty.
    insert(commands, "list_plans", &Value::Array(vec![]));
    insert(commands, "plans_for_day", &Value::Array(vec![]));

    // Keeper holds documents — citizenship and passport numbers. There is no
    // version of that screen that is honest to populate on a public page, so it
    // shows the empty state it ships with.
    insert(
        commands,
        "keeper_snapshot",
        &json!({
            "people": [],
            "items": [],
            "records": [],
        }),
    );
}

// ------------------------------------------------------------------- modules

/// Every remote module, parsed out of the recorded upstream responses in
/// `fixtures/` by the parsers that read the live ones.
fn modules(commands: &mut BTreeMap<String, Value>, root: &Path, now: DateTime<Utc>) {
    let read = |relative: &str| -> String {
        std::fs::read_to_string(root.join("fixtures").join(relative))
            .unwrap_or_else(|error| panic!("fixtures/{relative}: {error}"))
    };

    // -- news
    let feeds = [
        ("rss/onlinekhabar.xml", NewsSource::OnlineKhabar),
        ("rss/gorkhapatra.xml", NewsSource::Gorkhapatra),
        ("rss/kathmandupost.xml", NewsSource::KathmanduPost),
    ];
    let mut parsed: Vec<Vec<_>> = feeds
        .iter()
        .map(|(path, source)| rss::parser::parse(&read(path), *source, NEWS_LIMIT))
        .collect();
    parsed.push(kantipur::parse(&read("kantipur/newslist.json"), NEWS_LIMIT));

    let items = rss::newest_first(rss::interleave(&parsed, NEWS_LIMIT));
    commands.insert(
        "get_news".to_owned(),
        json!({ "status": "fresh", "value": {
            "items": items,
            "failedSources": [],
            "freshness": { "fetchedAt": now, "sourceTimestamp": Value::Null },
        }}),
    );
    insert(commands, "news_sources", &NewsSourceInfo::catalog());

    // -- bazar
    commands.insert(
        "get_bazar".to_owned(),
        json!({
            "metals": load_state(fenegosida::parse(&read("fenegosida/today.json"), now)),
            "fuel": load_state(noc::parse(&read("noc/prices.html"), now)),
            "vegetables": load_state(kalimati::parse(&read("kalimati/prices.html"), now)),
        }),
    );

    // -- the rest, one recorded upstream each
    commands.insert(
        "get_stocks".to_owned(),
        load_state(sharesansar::parse(
            &read("sharesansar/market.html"),
            &read("sharesansar/prices.html"),
            now,
        )),
    );
    commands.insert(
        "get_forex".to_owned(),
        load_state(nrb::parse(&read("nrb/rates.json"), now)),
    );
    commands.insert(
        "get_rashifal".to_owned(),
        load_state(hamropatro::parse(&read("hamropatro/rashifal.html"), now)),
    );
    commands.insert(
        "get_stations".to_owned(),
        load_state(ratopati::parse_directory(&read("ratopati/radio.html"), now)),
    );
    commands.insert(
        "get_weather".to_owned(),
        load_state(weather(
            &read("open-meteo/forecast.json"),
            &read("open-meteo/air-quality.json"),
            now,
        )),
    );

    // Playing a station needs a live stream URL, and the showcase has no
    // network. The mini player is reached by a tap that resolves to nothing.
    insert(commands, "station_stream", &Value::Null);
}

fn weather(
    forecast: &str,
    air_quality: &str,
    now: DateTime<Utc>,
) -> sajilo_providers::Result<sajilo_api::weather::WeatherSnapshot> {
    let mut snapshot = open_meteo::parse_forecast(
        forecast,
        sajilo_api::weather::WeatherLocation::Kathmandu,
        now,
    )?;
    snapshot.air_quality = open_meteo::parse_air_quality(air_quality);
    Ok(snapshot)
}

// --------------------------------------------------------------------- tools

/// The calculators arrive on their default inputs, which is the state a first
/// look at the screen should show anyway.
///
/// These are the one place the showcase cannot follow a visitor: converting a
/// number they type would mean a second implementation of the unit tables in
/// JavaScript, and a landing page quietly disagreeing with the product about
/// how many aana are in a ropani is worse than a panel that does not recompute.
fn tools(commands: &mut BTreeMap<String, Value>) {
    use sajilo_core::tools::land::{self, LandUnit};
    use sajilo_core::tools::units::{self, WeightUnit};
    use sajilo_core::tools::{interest, vat};

    let square_feet = land::convert(1.0, LandUnit::Ropani, LandUnit::SquareFeet);
    let hill = land::hill_area(square_feet);
    let terai = land::terai_area(square_feet);
    insert(
        commands,
        "land_breakdown",
        &json!({
            "hillCompact": hill.compact(),
            "teraiCompact": terai.compact(),
            "hill": hill,
            "terai": terai,
            "squareFeet": square_feet,
            "squareMetres": land::convert(square_feet, LandUnit::SquareFeet, LandUnit::SquareMetre),
        }),
    );
    insert(commands, "convert_land", &square_feet);
    insert(
        commands,
        "convert_weight",
        &units::convert(1.0, WeightUnit::Tola, WeightUnit::Gram),
    );
    insert(commands, "compute_vat", &vat::adding(1000.0, vat::VAT_RATE));
    insert(
        commands,
        "compute_interest",
        &interest::simple(100_000.0, 12.0, 1.0),
    );
}

/// Every number the recorded payloads contain, pre-grouped the South Asian way.
///
/// `group_number` is not a calculator — it is how every price, rate and index on
/// every screen is written, and lakh/crore grouping is not something `Intl` can
/// do. Reimplementing it in the stub would put a second copy of the rule on the
/// landing page; recording its answer for each number the app will actually be
/// handed keeps the one copy in `sajilo-core`.
fn grouped_numbers(commands: &mut BTreeMap<String, Value>) {
    use sajilo_core::tools::units;

    let mut numbers = Vec::new();
    for value in commands.values() {
        collect_numbers(value, &mut numbers);
    }

    for number in numbers {
        for digits in 0..=2_usize {
            insert(
                commands,
                &format!("group_number:{number}:{digits}"),
                &units::grouped_decimal(number, digits),
            );
        }
    }
}

fn collect_numbers(value: &Value, into: &mut Vec<f64>) {
    match value {
        Value::Number(number) => {
            if let Some(number) = number.as_f64() {
                into.push(number);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| collect_numbers(item, into)),
        Value::Object(fields) => fields
            .values()
            .for_each(|field| collect_numbers(field, into)),
        _ => {}
    }
}

// -------------------------------------------------------------------- system

/// The parts of the shell that ask the operating system a question. A browser
/// tab has no menu bar to start at login and no updater to check, so each one
/// records the quiet answer.
fn system(commands: &mut BTreeMap<String, Value>) {
    insert(commands, "is_first_run", &false);
    insert(commands, "updater_enabled", &false);
    insert(commands, "is_autostart_enabled", &false);
    insert(commands, "is_dock_icon_visible", &false);
    insert(commands, "notification_permission", &"unknown");
    insert(commands, "request_notification_permission", &"unknown");
    insert(commands, "pending_notifications", &Value::Array(vec![]));
    insert(
        commands,
        "get_notification_options",
        &json!({
            "eveOfPublicHoliday": true,
            "eveOfFestival": true,
            "hour": 18,
        }),
    );
    insert(commands, "get_setting", &Value::Null);
}
