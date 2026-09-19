//! Where the sun and moon are, for the panchang.
//!
//! The moon's position is the principal terms of Meeus, *Astronomical
//! Algorithms* ch. 47 — every term above 0.002°, which puts the longitude
//! within about a hundredth of a degree. The moon covers that in about a
//! minute, far inside what any almanac prints. The sun is Meeus ch. 25's
//! low-precision form, good to 0.01°.
//!
//! Sidereal positions use the Lahiri (Chitrapaksha) ayanamsa, the one Indian
//! and Nepali almanacs follow.

use chrono::{DateTime, Duration, Utc};

/// TT − UT for the 2020s. The moon moves 0.01° in this long, so a constant is
/// plenty for the years the calendar covers.
const DELTA_T_SECONDS: f64 = 69.0;

fn radians(deg: f64) -> f64 {
    deg.to_radians()
}

fn norm(deg: f64) -> f64 {
    deg.rem_euclid(360.0)
}

fn julian_day(at: DateTime<Utc>) -> f64 {
    at.timestamp() as f64 / 86_400.0 + 2_440_587.5
}

/// Julian centuries of Terrestrial Time since J2000.
fn centuries(at: DateTime<Utc>) -> f64 {
    (julian_day(at) + DELTA_T_SECONDS / 86_400.0 - 2_451_545.0) / 36_525.0
}

/// Nutation in longitude, its largest term only (0.005°).
fn nutation(t: f64) -> f64 {
    -0.004_78 * radians(125.04 - 1934.136 * t).sin()
}

/// The sun's apparent tropical longitude, in degrees.
pub fn sun_longitude(at: DateTime<Utc>) -> f64 {
    let t = centuries(at);
    let mean = 280.466_46 + 36_000.769_83 * t;
    let anomaly = radians(357.529_11 + 35_999.050_29 * t);
    let centre = (1.914_602 - 0.004_817 * t) * anomaly.sin()
        + (0.019_993 - 0.000_101 * t) * (2.0 * anomaly).sin()
        + 0.000_289 * (3.0 * anomaly).sin();
    norm(mean + centre - 0.005_69 + nutation(t))
}

/// Coefficients of D, M, M′, F, and the term, in millionths of a degree
/// (longitude) or of a kilometre ×1000 (distance).
type Term = (i8, i8, i8, i8, f64);

const LONGITUDE: [Term; 34] = [
    (0, 0, 1, 0, 6_288_774.0),
    (2, 0, -1, 0, 1_274_027.0),
    (2, 0, 0, 0, 658_314.0),
    (0, 0, 2, 0, 213_618.0),
    (0, 1, 0, 0, -185_116.0),
    (0, 0, 0, 2, -114_332.0),
    (2, 0, -2, 0, 58_793.0),
    (2, -1, -1, 0, 57_066.0),
    (2, 0, 1, 0, 53_322.0),
    (2, -1, 0, 0, 45_758.0),
    (0, 1, -1, 0, -40_923.0),
    (1, 0, 0, 0, -34_720.0),
    (0, 1, 1, 0, -30_383.0),
    (2, 0, 0, -2, 15_327.0),
    (0, 0, 1, 2, -12_528.0),
    (0, 0, 1, -2, 10_980.0),
    (4, 0, -1, 0, 10_675.0),
    (0, 0, 3, 0, 10_034.0),
    (4, 0, -2, 0, 8_548.0),
    (2, 1, -1, 0, -7_888.0),
    (2, 1, 0, 0, -6_766.0),
    (1, 0, -1, 0, -5_163.0),
    (1, 1, 0, 0, 4_987.0),
    (2, -1, 1, 0, 4_036.0),
    (2, 0, 2, 0, 3_994.0),
    (4, 0, 0, 0, 3_861.0),
    (2, 0, -3, 0, 3_665.0),
    (0, 1, -2, 0, -2_689.0),
    (2, 0, -1, 2, -2_602.0),
    (2, -1, -2, 0, 2_390.0),
    (1, 0, 1, 0, -2_348.0),
    (2, -2, 0, 0, 2_236.0),
    (0, 1, 2, 0, -2_120.0),
    (0, 2, 0, 0, -2_069.0),
];

const LATITUDE: [Term; 14] = [
    (0, 0, 0, 1, 5_128_122.0),
    (0, 0, 1, 1, 280_602.0),
    (0, 0, 1, -1, 277_693.0),
    (2, 0, 0, -1, 173_237.0),
    (2, 0, -1, 1, 55_413.0),
    (2, 0, -1, -1, 46_271.0),
    (2, 0, 0, 1, 32_573.0),
    (0, 0, 2, 1, 17_198.0),
    (2, 0, 1, -1, 9_266.0),
    (0, 0, 2, -1, 8_822.0),
    (2, -1, 0, -1, 8_216.0),
    (2, 0, -2, -1, 4_324.0),
    (2, 0, 1, 1, 4_200.0),
    (2, 1, 0, -1, -3_359.0),
];

const DISTANCE: [Term; 14] = [
    (0, 0, 1, 0, -20_905_355.0),
    (2, 0, -1, 0, -3_699_111.0),
    (2, 0, 0, 0, -2_955_968.0),
    (0, 0, 2, 0, -569_925.0),
    (0, 1, 0, 0, 48_888.0),
    (2, 0, -2, 0, 246_158.0),
    (2, -1, -1, 0, -152_138.0),
    (2, 0, 1, 0, -170_733.0),
    (2, -1, 0, 0, -204_586.0),
    (0, 1, -1, 0, -129_620.0),
    (1, 0, 0, 0, 108_743.0),
    (0, 1, 1, 0, 104_755.0),
    (0, 0, 1, -2, 79_661.0),
    (4, 0, -1, 0, -34_782.0),
];

/// The moon's apparent tropical longitude and latitude (degrees) and its
/// distance (km).
pub fn moon_position(at: DateTime<Utc>) -> (f64, f64, f64) {
    let t = centuries(at);
    let mean_longitude = 218.316_447_7 + 481_267.881_234_21 * t;
    let elongation = 297.850_192_1 + 445_267.111_403_4 * t;
    let sun_anomaly = 357.529_109_2 + 35_999.050_290_9 * t;
    let moon_anomaly = 134.963_396_4 + 477_198.867_505_5 * t;
    let node_distance = 93.272_095_0 + 483_202.017_523_3 * t;
    let a1 = 119.75 + 131.849 * t;
    let a2 = 53.09 + 479_264.290 * t;
    let a3 = 313.45 + 481_266.484 * t;
    let e = 1.0 - 0.002_516 * t;

    let sum = |terms: &[Term], trig: fn(f64) -> f64| -> f64 {
        terms
            .iter()
            .map(|&(d, m, mp, f, coefficient)| {
                let argument = f64::from(d) * elongation
                    + f64::from(m) * sun_anomaly
                    + f64::from(mp) * moon_anomaly
                    + f64::from(f) * node_distance;
                // Terms in the sun's anomaly shrink as the earth's orbit
                // circularises.
                let eccentricity = e.powi(i32::from(m.unsigned_abs()));
                coefficient * eccentricity * trig(radians(argument))
            })
            .sum()
    };

    let longitude = sum(&LONGITUDE, f64::sin)
        + 3_958.0 * radians(a1).sin()
        + 1_962.0 * radians(mean_longitude - node_distance).sin()
        + 318.0 * radians(a2).sin();
    let latitude = sum(&LATITUDE, f64::sin) - 2_235.0 * radians(mean_longitude).sin()
        + 382.0 * radians(a3).sin()
        + 175.0 * radians(a1 - node_distance).sin()
        + 175.0 * radians(a1 + node_distance).sin()
        + 127.0 * radians(mean_longitude - moon_anomaly).sin()
        - 115.0 * radians(mean_longitude + moon_anomaly).sin();
    let distance = 385_000.56 + sum(&DISTANCE, f64::cos) / 1_000.0;

    (
        norm(mean_longitude + longitude / 1_000_000.0 + nutation(t)),
        latitude / 1_000_000.0,
        distance,
    )
}

/// Lahiri ayanamsa: how far the tropical zodiac has drifted from the sidereal.
pub fn ayanamsa(at: DateTime<Utc>) -> f64 {
    let years = (julian_day(at) - 2_451_545.0) / 365.25;
    23.853_06 + 0.013_966_3 * years
}

pub fn sidereal(tropical: f64, at: DateTime<Utc>) -> f64 {
    norm(tropical - ayanamsa(at))
}

/// Moon minus sun: 0° at new moon, 180° at full. Each tithi is 12° of it.
pub fn elongation(at: DateTime<Utc>) -> f64 {
    norm(moon_position(at).0 - sun_longitude(at))
}

/// When `angle` (which only ever increases, wrapping at 360°) next reaches a
/// multiple of `size` after `from` — the moment a tithi, nakshatra, yoga or
/// lunar month ends.
///
/// Walks forward a day at a time — nothing here moves 180° in a day, so each
/// step's gain is unambiguous even across the wrap — then halves the day it
/// happened in down to about a second.
pub fn next_boundary(
    from: DateTime<Utc>,
    size: f64,
    angle: impl Fn(DateTime<Utc>) -> f64,
) -> DateTime<Utc> {
    let start = angle(from);
    let gap = ((start / size).floor() + 1.0) * size - start;
    let gain = |from_angle: f64, at: DateTime<Utc>| norm(angle(at) - from_angle);

    let (mut low, mut covered, mut last) = (from, 0.0, start);
    let high = loop {
        let next = low + Duration::days(1);
        let step = gain(last, next);
        if covered + step >= gap {
            break next;
        }
        covered += step;
        last = angle(next);
        low = next;
    };
    let (base, mut high) = (last, high);
    for _ in 0..17 {
        let middle = low + (high - low) / 2;
        if covered + gain(base, middle) >= gap {
            high = middle;
        } else {
            low = middle;
        }
    }
    high
}

/// When `angle` last passed a multiple of `size` at or before `from`.
///
/// Starts from a guess that is surely too early — `slowest` is the least the
/// angle ever moves in a day — then walks forward boundary by boundary.
pub fn previous_boundary(
    from: DateTime<Utc>,
    size: f64,
    slowest: f64,
    angle: impl Fn(DateTime<Utc>) -> f64 + Copy,
) -> DateTime<Utc> {
    let start = angle(from);
    let past = start - (start / size).floor() * size;
    let guess = from - Duration::minutes(((past / slowest + 0.5) * 1_440.0) as i64);
    let mut crossing = next_boundary(guess, size, angle);
    loop {
        let later = next_boundary(crossing + Duration::minutes(1), size, angle);
        if later > from {
            return crossing;
        }
        crossing = later;
    }
}

/// Altitude of the moon's centre above the horizon at a place, in degrees.
fn moon_altitude(at: DateTime<Utc>, latitude: f64, longitude: f64) -> (f64, f64) {
    let t = centuries(at);
    let (lambda, beta, distance) = moon_position(at);
    let obliquity = radians(23.439_291 - 0.013_004_2 * t);
    let (lambda, beta) = (radians(lambda), radians(beta));
    let right_ascension =
        (lambda.sin() * obliquity.cos() - beta.tan() * obliquity.sin()).atan2(lambda.cos());
    let declination =
        (beta.sin() * obliquity.cos() + beta.cos() * obliquity.sin() * lambda.sin()).asin();
    let sidereal_time = radians(norm(
        280.460_618_37 + 360.985_647_366_29 * (julian_day(at) - 2_451_545.0) + longitude,
    ));
    let hour_angle = sidereal_time - right_ascension;
    let latitude = radians(latitude);
    let altitude = (latitude.sin() * declination.sin()
        + latitude.cos() * declination.cos() * hour_angle.cos())
    .asin()
    .to_degrees();
    // The moon is close enough that parallax lowers it by up to a degree.
    let parallax = (6_378.14 / distance).asin().to_degrees();
    (altitude, 0.7275 * parallax - 0.5667)
}

/// Moonrise and moonset inside `[from, to)`. Either can be missing: the moon
/// runs about fifty minutes later each day, so roughly once a month a day
/// passes with no rise, and once with no set.
pub fn moon_rise_set(
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    latitude: f64,
    longitude: f64,
) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
    let height = |at| {
        let (altitude, horizon) = moon_altitude(at, latitude, longitude);
        altitude - horizon
    };
    let step = Duration::minutes(10);
    let (mut rise, mut set) = (None, None);
    let mut at = from;
    let mut before = height(at);
    while at < to {
        let next = at + step;
        let after = height(next);
        if before.signum() != after.signum() {
            // Halve the bracket down to a few seconds.
            let (mut low, mut high) = (at, next);
            for _ in 0..8 {
                let middle = low + (high - low) / 2;
                if height(middle).signum() == before.signum() {
                    low = middle;
                } else {
                    high = middle;
                }
            }
            let crossing = low + (high - low) / 2;
            if before < after {
                rise.get_or_insert(crossing);
            } else {
                set.get_or_insert(crossing);
            }
        }
        at = next;
        before = after;
    }
    (rise, set)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    /// Meeus example 47.a: 1992 April 12, 0h TD. λ = 133.162655°, β = −3.229126°,
    /// Δ = 368 409.7 km.
    #[test]
    fn matches_meeus_worked_example() {
        let at = Utc.with_ymd_and_hms(1992, 4, 12, 0, 0, 0).unwrap()
            - Duration::milliseconds((DELTA_T_SECONDS * 1000.0) as i64);
        let (longitude, latitude, distance) = moon_position(at);
        println!("{longitude} {latitude} {distance}");
        assert!((longitude - 133.162_655).abs() < 0.02, "{longitude}");
        assert!((latitude + 3.229_126).abs() < 0.02, "{latitude}");
        assert!((distance - 368_409.7).abs() < 50.0, "{distance}");
    }
}
