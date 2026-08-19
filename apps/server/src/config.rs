//! Everything operational comes from the environment, so a deployment can be
//! retuned without a rebuild. There are no secrets here — every source Sajilo
//! reads is public and keyless.

use std::env;
use std::path::PathBuf;
use std::time::Duration;

use sajilo_api::bundle::ModuleKey;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    /// Where the warm-start snapshot is written. A restart should not blank
    /// every feed for the length of one refresh cycle.
    pub cache_path: PathBuf,
    /// Published in the `User-Agent` so a source operator can reach us.
    pub contact_url: String,
    pub min_client_version: String,
    pub notice: Option<String>,
    /// Read once at boot so a test can pin it.
    intervals: Intervals,
}

#[derive(Debug, Clone)]
struct Intervals {
    weather: Duration,
    forex: Duration,
    news: Duration,
    metals: Duration,
    fuel: Duration,
    vegetables: Duration,
    rashifal: Duration,
    radio: Duration,
}

/// The cadence table from `PLAN.md`. The scheduler fetches on this timetable
/// regardless of client count — a client request never triggers an upstream
/// fetch.
impl Default for Intervals {
    fn default() -> Self {
        Self {
            // Only for cities actually in use.
            weather: Duration::from_secs(15 * 60),
            // Merged and deduped server-side.
            news: Duration::from_secs(20 * 60),
            forex: Duration::from_secs(6 * 3600),
            metals: Duration::from_secs(6 * 3600),
            // Published once daily.
            vegetables: Duration::from_secs(6 * 3600),
            // Changes rarely.
            fuel: Duration::from_secs(12 * 3600),
            rashifal: Duration::from_secs(12 * 3600),
            // List only; streams are direct.
            radio: Duration::from_secs(24 * 3600),
        }
    }
}

impl Config {
    /// Reads the environment, falling back to the cadence table for anything
    /// unset. An unparseable value is ignored rather than fatal: a typo in one
    /// interval should not stop the server from booting.
    pub fn from_env() -> Self {
        let default = Intervals::default();
        Self {
            port: parse_var("PORT").unwrap_or(8080),
            cache_path: env::var("CACHE_PATH").map_or_else(
                |_| PathBuf::from("/var/lib/sajilo/snapshot.json"),
                PathBuf::from,
            ),
            contact_url: env::var("CONTACT_URL")
                .unwrap_or_else(|_| "https://github.com/mukezhz/sajilo".to_owned()),
            min_client_version: env::var("MIN_CLIENT_VERSION")
                .unwrap_or_else(|_| "0.1.0".to_owned()),
            notice: env::var("NOTICE").ok().filter(|s| !s.trim().is_empty()),
            intervals: Intervals {
                weather: secs_var("REFRESH_WEATHER").unwrap_or(default.weather),
                forex: secs_var("REFRESH_FOREX").unwrap_or(default.forex),
                news: secs_var("REFRESH_NEWS").unwrap_or(default.news),
                metals: secs_var("REFRESH_METALS").unwrap_or(default.metals),
                fuel: secs_var("REFRESH_FUEL").unwrap_or(default.fuel),
                vegetables: secs_var("REFRESH_VEGETABLES").unwrap_or(default.vegetables),
                rashifal: secs_var("REFRESH_RASHIFAL").unwrap_or(default.rashifal),
                radio: secs_var("REFRESH_RADIO").unwrap_or(default.radio),
            },
        }
    }

    pub fn interval(&self, module: ModuleKey) -> Duration {
        match module {
            ModuleKey::Weather => self.intervals.weather,
            ModuleKey::Forex => self.intervals.forex,
            ModuleKey::News => self.intervals.news,
            ModuleKey::Metals => self.intervals.metals,
            ModuleKey::Fuel => self.intervals.fuel,
            ModuleKey::Vegetables => self.intervals.vegetables,
            ModuleKey::Rashifal => self.intervals.rashifal,
            ModuleKey::Radio => self.intervals.radio,
        }
    }

    /// A value is stale once it is past its refresh interval. Given twice the
    /// interval, a feed that has missed two whole cycles is unmistakably late,
    /// so the client is told rather than shown a silent old number.
    pub fn max_age(&self, module: ModuleKey) -> i64 {
        (self.interval(module).as_secs() * 2) as i64
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 8080,
            cache_path: PathBuf::from("/var/lib/sajilo/snapshot.json"),
            contact_url: "https://github.com/mukezhz/sajilo".to_owned(),
            min_client_version: "0.1.0".to_owned(),
            notice: None,
            intervals: Intervals::default(),
        }
    }
}

fn parse_var<T: std::str::FromStr>(key: &str) -> Option<T> {
    env::var(key).ok()?.trim().parse().ok()
}

fn secs_var(key: &str) -> Option<Duration> {
    // Zero would spin the scheduler, so it is treated as unset.
    parse_var::<u64>(key)
        .filter(|secs| *secs > 0)
        .map(Duration::from_secs)
}
