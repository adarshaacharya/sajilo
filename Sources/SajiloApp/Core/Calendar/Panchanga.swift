import Foundation

/// Sunrise and sunset, computed rather than fetched.
///
/// The weather feed already returns both, but only for the few days it
/// forecasts, and only while that module is switched on. Computing them means
/// every date in the calendar has them — past festivals included — with no
/// network at all.
///
/// This is the NOAA solar position algorithm. It is accurate to about a minute
/// at Nepal's latitude, which is far inside the precision anything here needs:
/// Rahu Kaal is a ninety-minute window, and no almanac quotes seconds.
enum SolarTimes {
    struct Times: Equatable, Sendable {
        let sunrise: Date
        let sunset: Date

        var daylight: TimeInterval { sunset.timeIntervalSince(sunrise) }
    }

    /// Nil inside the polar circles, where the sun may not rise or set at all.
    /// Nepal is nowhere near that, but the maths has to say so rather than
    /// return a fabricated time.
    static func times(on date: Date, latitude: Double, longitude: Double) -> Times? {
        // Longitude arrives east-positive, as coordinates normally are, but the
        // algorithm is written in terms of *west* longitude. Getting that sign
        // wrong moves Kathmandu's sunrise by hours, and the first version did.
        let westLongitude = -longitude

        // Noon UTC on the requested day, so the day number cannot land on a
        // neighbouring date through a timezone offset.
        let noon = NepalTime.calendar.startOfDay(for: date).addingTimeInterval(12 * 3600)
        let julian = julianDay(for: noon)

        let dayNumber = (julian - 2_451_545.0 - 0.0009 - westLongitude / 360).rounded(.up)
        let meanSolarNoon = 2_451_545.0 + 0.0009 + westLongitude / 360 + dayNumber

        let meanAnomaly = (357.5291 + 0.98560028 * (meanSolarNoon - 2_451_545))
            .truncatingRemainder(dividingBy: 360)
        let center = 1.9148 * sin(meanAnomaly.radians)
            + 0.0200 * sin((2 * meanAnomaly).radians)
            + 0.0003 * sin((3 * meanAnomaly).radians)
        let eclipticLongitude = (meanAnomaly + center + 180 + 102.9372)
            .truncatingRemainder(dividingBy: 360)

        let solarTransit = meanSolarNoon
            + 0.0053 * sin(meanAnomaly.radians)
            - 0.0069 * sin((2 * eclipticLongitude).radians)

        let sinDeclination = sin(eclipticLongitude.radians) * sin(23.44.radians)
        let declination = asin(sinDeclination)

        // The sun's centre 0.83° below the horizon — the usual correction for
        // refraction and the sun's own radius.
        let cosHourAngle = (sin((-0.83).radians) - sin(latitude.radians) * sinDeclination)
            / (cos(latitude.radians) * cos(declination))
        guard (-1...1).contains(cosHourAngle) else { return nil }

        let hourAngle = acos(cosHourAngle).degrees
        return Times(
            sunrise: Self.date(fromJulian: solarTransit - hourAngle / 360),
            sunset: Self.date(fromJulian: solarTransit + hourAngle / 360)
        )
    }

    private static func julianDay(for date: Date) -> Double {
        date.timeIntervalSince1970 / 86_400 + 2_440_587.5
    }

    private static func date(fromJulian julian: Double) -> Date {
        Date(timeIntervalSince1970: (julian - 2_440_587.5) * 86_400)
    }
}

private extension Double {
    var radians: Double { self * .pi / 180 }
    var degrees: Double { self * 180 / .pi }
}

/// The inauspicious window people check before starting anything — travel, a
/// purchase, a ceremony.
///
/// Daylight is divided into eight equal parts and one of them belongs to Rahu,
/// which part depending on the weekday. The first part, straight after sunrise,
/// is never Rahu Kaal.
enum RahuKaal {
    /// Which eighth belongs to Rahu, indexed from 1.
    ///
    /// Sunday 8th, Monday 2nd, Tuesday 7th, Wednesday 5th, Thursday 6th,
    /// Friday 4th, Saturday 3rd. Nothing about this is derivable — it is a
    /// fixed traditional table, so it is written out and pinned by a test
    /// rather than computed from something that looks like a pattern.
    static func segment(forWeekday weekday: Int) -> Int? {
        switch weekday {
        case 1: 8   // Sunday
        case 2: 2   // Monday
        case 3: 7   // Tuesday
        case 4: 5   // Wednesday
        case 5: 6   // Thursday
        case 6: 4   // Friday
        case 7: 3   // Saturday
        default: nil
        }
    }

    struct Window: Equatable, Sendable {
        let start: Date
        let end: Date
    }

    static func window(sunrise: Date, sunset: Date, weekday: Int) -> Window? {
        guard sunset > sunrise, let segment = segment(forWeekday: weekday) else { return nil }
        let part = sunset.timeIntervalSince(sunrise) / 8
        let start = sunrise.addingTimeInterval(part * Double(segment - 1))
        return Window(start: start, end: start.addingTimeInterval(part))
    }

    static func window(on date: Date, latitude: Double, longitude: Double) -> Window? {
        guard let times = SolarTimes.times(on: date, latitude: latitude, longitude: longitude) else {
            return nil
        }
        return window(
            sunrise: times.sunrise,
            sunset: times.sunset,
            weekday: NepalTime.calendar.component(.weekday, from: date)
        )
    }
}

/// A day's almanac: when the sun is up, and which part of it belongs to Rahu.
struct Panchanga: Equatable, Sendable {
    let sunrise: Date
    let sunset: Date
    let rahuKaal: RahuKaal.Window?
    let tithi: String?

    /// Kathmandu. The whole calendar is already Nepal-local, and sunrise across
    /// the country varies by only a few minutes.
    static let kathmandu = (latitude: 27.7172, longitude: 85.3240)

    static func forDate(_ date: Date, tithi: String?) -> Panchanga? {
        guard let times = SolarTimes.times(
            on: date,
            latitude: kathmandu.latitude,
            longitude: kathmandu.longitude
        ) else { return nil }

        return Panchanga(
            sunrise: times.sunrise,
            sunset: times.sunset,
            rahuKaal: RahuKaal.window(
                sunrise: times.sunrise,
                sunset: times.sunset,
                weekday: NepalTime.calendar.component(.weekday, from: date)
            ),
            tithi: tithi
        )
    }

    var daylightText: String {
        let minutes = Int(sunset.timeIntervalSince(sunrise) / 60)
        return "\(minutes / 60)h \(minutes % 60)m"
    }
}
