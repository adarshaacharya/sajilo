//! Sunrise and sunset, computed rather than fetched. Ported from `Panchanga.swift`.
//!
//! The weather feed already returns both, but only for the few days it
//! forecasts, and only while that module is switched on. Computing them means
//! every date in the calendar has them — past festivals included — with no
//! network at all.
//!
//! This is the NOAA solar position algorithm. It is accurate to about a minute
//! at Nepal's latitude, which is far inside the precision anything here needs:
//! Rahu Kaal is a ninety-minute window, and no almanac quotes seconds.

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc, Weekday};
use serde::{Deserialize, Serialize};

use crate::nepal_time;

const KATHMANDU_LATITUDE: f64 = 27.7172;
const KATHMANDU_LONGITUDE: f64 = 85.3240;

fn radians(deg: f64) -> f64 {
    deg * std::f64::consts::PI / 180.0
}

fn degrees(rad: f64) -> f64 {
    rad * 180.0 / std::f64::consts::PI
}

fn julian_day(date: DateTime<Utc>) -> f64 {
    date.timestamp() as f64 / 86_400.0 + 2_440_587.5
}

fn date_from_julian(julian: f64) -> DateTime<Utc> {
    let seconds = (julian - 2_440_587.5) * 86_400.0;
    Utc.timestamp_opt(seconds.round() as i64, 0)
        .single()
        .expect("finite timestamp")
}

/// Sunrise and sunset for one Nepal-local calendar day, in UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SolarTimes {
    pub sunrise: DateTime<Utc>,
    pub sunset: DateTime<Utc>,
}

impl SolarTimes {
    pub fn daylight_seconds(&self) -> i64 {
        (self.sunset - self.sunrise).num_seconds()
    }
}

/// Nil inside the polar circles, where the sun may not rise or set at all.
/// Nepal is nowhere near that, but the maths has to say so rather than return
/// a fabricated time.
///
/// `day` is a Nepal-local Gregorian calendar day; the algorithm runs off its
/// UTC noon so the day number cannot land on a neighbouring date through the
/// timezone offset.
pub fn solar_times(day: NaiveDate, latitude: f64, longitude: f64) -> Option<SolarTimes> {
    // The algorithm is written in terms of *west* longitude; coordinates
    // arrive east-positive. Getting this sign wrong moves Kathmandu's sunrise
    // by hours.
    let west_longitude = -longitude;

    let noon = day.and_hms_opt(12, 0, 0)?.and_utc();
    let julian = julian_day(noon);

    let day_number = (julian - 2_451_545.0 - 0.0009 - west_longitude / 360.0).ceil();
    let mean_solar_noon = 2_451_545.0 + 0.0009 + west_longitude / 360.0 + day_number;

    let mean_anomaly =
        (357.5291 + 0.985_600_28 * (mean_solar_noon - 2_451_545.0)).rem_euclid(360.0);
    let center = 1.9148 * radians(mean_anomaly).sin()
        + 0.0200 * radians(2.0 * mean_anomaly).sin()
        + 0.0003 * radians(3.0 * mean_anomaly).sin();
    let ecliptic_longitude = (mean_anomaly + center + 180.0 + 102.9372).rem_euclid(360.0);

    let solar_transit = mean_solar_noon + 0.0053 * radians(mean_anomaly).sin()
        - 0.0069 * radians(2.0 * ecliptic_longitude).sin();

    let sin_declination = radians(ecliptic_longitude).sin() * radians(23.44).sin();
    let declination = sin_declination.asin();

    // The sun's centre 0.83° below the horizon — the usual correction for
    // refraction and the sun's own radius.
    let cos_hour_angle = (radians(-0.83).sin() - radians(latitude).sin() * sin_declination)
        / (radians(latitude).cos() * declination.cos());
    if !(-1.0..=1.0).contains(&cos_hour_angle) {
        return None;
    }

    let hour_angle = degrees(cos_hour_angle.acos());
    Some(SolarTimes {
        sunrise: date_from_julian(solar_transit - hour_angle / 360.0),
        sunset: date_from_julian(solar_transit + hour_angle / 360.0),
    })
}

/// The inauspicious window people check before starting anything — travel, a
/// purchase, a ceremony.
///
/// Daylight is divided into eight equal parts and one of them belongs to
/// Rahu, which part depending on the weekday. The first part, straight after
/// sunrise, is never Rahu Kaal.
///
/// A fixed traditional table, not a formula: Sunday 8th, Monday 2nd, Tuesday
/// 7th, Wednesday 5th, Thursday 6th, Friday 4th, Saturday 3rd. Written out
/// rather than computed from something that looks like a pattern.
pub fn rahu_kaal_segment(weekday: Weekday) -> u32 {
    match weekday {
        Weekday::Sun => 8,
        Weekday::Mon => 2,
        Weekday::Tue => 7,
        Weekday::Wed => 5,
        Weekday::Thu => 6,
        Weekday::Fri => 4,
        Weekday::Sat => 3,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RahuKaalWindow {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

pub fn rahu_kaal_window(
    sunrise: DateTime<Utc>,
    sunset: DateTime<Utc>,
    weekday: Weekday,
) -> Option<RahuKaalWindow> {
    if sunset <= sunrise {
        return None;
    }
    let segment = rahu_kaal_segment(weekday);
    let part = (sunset - sunrise) / 8;
    let start = sunrise + part * (segment as i32 - 1);
    Some(RahuKaalWindow {
        start,
        end: start + part,
    })
}

/// A day's almanac: when the sun is up, and which part of it belongs to Rahu.
/// Computed for Kathmandu — the whole calendar is already Nepal-local, and
/// sunrise across the country varies by only a few minutes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panchanga {
    pub sunrise: DateTime<Utc>,
    pub sunset: DateTime<Utc>,
    pub rahu_kaal_start: Option<DateTime<Utc>>,
    pub rahu_kaal_end: Option<DateTime<Utc>>,
    pub daylight_seconds: i64,
}

pub fn panchanga_for(day: NaiveDate) -> Option<Panchanga> {
    let times = solar_times(day, KATHMANDU_LATITUDE, KATHMANDU_LONGITUDE)?;
    let weekday = times.sunrise.with_timezone(&nepal_time::offset()).weekday();
    let rahu = rahu_kaal_window(times.sunrise, times.sunset, weekday);

    Some(Panchanga {
        sunrise: times.sunrise,
        sunset: times.sunset,
        rahu_kaal_start: rahu.map(|w| w.start),
        rahu_kaal_end: rahu.map(|w| w.end),
        daylight_seconds: times.daylight_seconds(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Timelike};

    const KATHMANDU: (f64, f64) = (KATHMANDU_LATITUDE, KATHMANDU_LONGITUDE);

    fn clock(date: DateTime<Utc>) -> String {
        let local = date.with_timezone(&nepal_time::offset());
        format!("{:02}:{:02}", local.hour(), local.minute())
    }

    fn minutes_apart(left: &str, right: &str) -> i32 {
        fn minutes(clock: &str) -> i32 {
            let parts: Vec<i32> = clock.split(':').filter_map(|p| p.parse().ok()).collect();
            if parts.len() == 2 {
                parts[0] * 60 + parts[1]
            } else {
                0
            }
        }
        (minutes(left) - minutes(right)).abs()
    }

    /// Checked against Open-Meteo's archive for Kathmandu — real recorded
    /// values, not remembered ones.
    ///
    ///     2025-06-21  05:08 / 19:02
    ///     2025-12-21  06:50 / 17:13
    ///
    /// Three minutes of tolerance: this is the short form of the NOAA
    /// algorithm, and nothing here needs better than that.
    #[test]
    fn matches_recorded_kathmandu_times() {
        let june = solar_times(
            NaiveDate::from_ymd_opt(2025, 6, 21).unwrap(),
            KATHMANDU.0,
            KATHMANDU.1,
        )
        .unwrap();
        assert!(
            minutes_apart(&clock(june.sunrise), "05:08") <= 3,
            "sunrise {}",
            clock(june.sunrise)
        );
        assert!(
            minutes_apart(&clock(june.sunset), "19:02") <= 3,
            "sunset {}",
            clock(june.sunset)
        );

        let december = solar_times(
            NaiveDate::from_ymd_opt(2025, 12, 21).unwrap(),
            KATHMANDU.0,
            KATHMANDU.1,
        )
        .unwrap();
        assert!(
            minutes_apart(&clock(december.sunrise), "06:50") <= 3,
            "sunrise {}",
            clock(december.sunrise)
        );
        assert!(
            minutes_apart(&clock(december.sunset), "17:13") <= 3,
            "sunset {}",
            clock(december.sunset)
        );
    }

    /// Kathmandu's longest day is a little over 14 hours and its shortest a
    /// little over 10 — a good check that the seasonal swing is real and not
    /// a constant twelve hours.
    #[test]
    fn daylight_swings_with_the_season() {
        let june = solar_times(
            NaiveDate::from_ymd_opt(2026, 6, 21).unwrap(),
            KATHMANDU.0,
            KATHMANDU.1,
        )
        .unwrap();
        let december = solar_times(
            NaiveDate::from_ymd_opt(2026, 12, 21).unwrap(),
            KATHMANDU.0,
            KATHMANDU.1,
        )
        .unwrap();

        let june_hours = june.daylight_seconds() as f64 / 3600.0;
        let december_hours = december.daylight_seconds() as f64 / 3600.0;
        assert!(june_hours > december_hours);
        assert!(june_hours > 13.5 && june_hours < 14.5);
        assert!(december_hours > 10.0 && december_hours < 10.8);
    }

    #[test]
    fn sun_always_rises_before_it_sets() {
        for month in 1..=12u32 {
            let day = NaiveDate::from_ymd_opt(2026, month, 15).unwrap();
            let times = solar_times(day, KATHMANDU.0, KATHMANDU.1).unwrap();
            assert!(times.sunrise < times.sunset, "month {month}");
        }
    }

    /// Inside the polar circle the sun may never rise. The maths must say so
    /// rather than invent a time.
    #[test]
    fn returns_nothing_where_the_sun_does_not_rise() {
        let midwinter = NaiveDate::from_ymd_opt(2026, 12, 21).unwrap();
        assert!(solar_times(midwinter, 80.0, 0.0).is_none());
    }

    /// A fixed traditional table, not a formula. Written out and pinned so a
    /// later "simplification" into arithmetic cannot quietly reorder it.
    #[test]
    fn uses_the_traditional_weekday_table() {
        assert_eq!(rahu_kaal_segment(Weekday::Sun), 8);
        assert_eq!(rahu_kaal_segment(Weekday::Mon), 2);
        assert_eq!(rahu_kaal_segment(Weekday::Tue), 7);
        assert_eq!(rahu_kaal_segment(Weekday::Wed), 5);
        assert_eq!(rahu_kaal_segment(Weekday::Thu), 6);
        assert_eq!(rahu_kaal_segment(Weekday::Fri), 4);
        assert_eq!(rahu_kaal_segment(Weekday::Sat), 3);
    }

    /// The first eighth, straight after sunrise, is never Rahu Kaal.
    #[test]
    fn never_claims_the_first_segment() {
        for weekday in [
            Weekday::Sun,
            Weekday::Mon,
            Weekday::Tue,
            Weekday::Wed,
            Weekday::Thu,
            Weekday::Fri,
            Weekday::Sat,
        ] {
            assert_ne!(rahu_kaal_segment(weekday), 1, "{weekday}");
        }
    }

    /// The window is one eighth of daylight — about 90 minutes in Nepal.
    /// Monday takes the second part: 07:30-09:00 against a 06:00 sunrise.
    #[test]
    fn window_is_one_eighth_of_daylight() {
        let sunrise = Utc.timestamp_opt(0, 0).unwrap();
        let sunset = sunrise + chrono::Duration::hours(12);
        let window = rahu_kaal_window(sunrise, sunset, Weekday::Mon).unwrap();

        assert_eq!((window.end - window.start).num_seconds(), 90 * 60);
        assert_eq!((window.start - sunrise).num_seconds(), 90 * 60);
    }

    #[test]
    fn sunday_takes_the_last_segment_ending_at_sunset() {
        let sunrise = Utc.timestamp_opt(0, 0).unwrap();
        let sunset = sunrise + chrono::Duration::hours(8);
        let window = rahu_kaal_window(sunrise, sunset, Weekday::Sun).unwrap();

        assert_eq!(window.end, sunset);
        assert_eq!(window.start, sunrise + chrono::Duration::hours(7));
    }

    #[test]
    fn rejects_an_impossible_day() {
        let now = Utc::now();
        assert!(rahu_kaal_window(now, now - chrono::Duration::seconds(1), Weekday::Mon).is_none());
    }

    /// Every weekday's window must sit inside daylight and never overlap
    /// sunrise itself.
    #[test]
    fn always_falls_inside_daylight() {
        let sunrise = Utc.timestamp_opt(0, 0).unwrap();
        let sunset = sunrise + chrono::Duration::hours(12);
        for weekday in [
            Weekday::Sun,
            Weekday::Mon,
            Weekday::Tue,
            Weekday::Wed,
            Weekday::Thu,
            Weekday::Fri,
            Weekday::Sat,
        ] {
            let window = rahu_kaal_window(sunrise, sunset, weekday).unwrap();
            assert!(window.start > sunrise, "{weekday} starts at sunrise");
            assert!(window.end <= sunset, "{weekday} runs past sunset");
        }
    }
}
