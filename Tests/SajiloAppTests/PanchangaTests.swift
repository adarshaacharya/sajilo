import Foundation
import Testing
@testable import SajiloApp

struct SolarTimesTests {
    private static let kathmandu = (latitude: 27.7172, longitude: 85.3240)

    private func times(_ iso: String) throws -> SolarTimes.Times {
        let date = try #require(ISO8601DateFormatter().date(from: iso))
        return try #require(SolarTimes.times(
            on: date, latitude: Self.kathmandu.latitude, longitude: Self.kathmandu.longitude
        ))
    }

    private func clock(_ date: Date) -> String {
        let parts = NepalTime.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// Checked against Open-Meteo's archive for Kathmandu — real recorded
    /// values, not remembered ones. The first version of this test used bounds
    /// written from memory and failed a correct implementation, so the numbers
    /// below are quoted from the source.
    ///
    ///     2025-06-21  05:08 / 19:02
    ///     2025-12-21  06:50 / 17:13
    ///
    /// Three minutes of tolerance: this is the short form of the NOAA
    /// algorithm, and nothing here needs better than that.
    @Test func matchesRecordedKathmanduTimes() throws {
        let june = try times("2025-06-21T06:00:00+05:45")
        #expect(minutesApart(clock(june.sunrise), "05:08") <= 3, "sunrise \(clock(june.sunrise))")
        #expect(minutesApart(clock(june.sunset), "19:02") <= 3, "sunset \(clock(june.sunset))")

        let december = try times("2025-12-21T06:00:00+05:45")
        #expect(minutesApart(clock(december.sunrise), "06:50") <= 3, "sunrise \(clock(december.sunrise))")
        #expect(minutesApart(clock(december.sunset), "17:13") <= 3, "sunset \(clock(december.sunset))")
    }

    private func minutesApart(_ left: String, _ right: String) -> Int {
        func minutes(_ clock: String) -> Int {
            let parts = clock.split(separator: ":").compactMap { Int($0) }
            return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
        }
        return abs(minutes(left) - minutes(right))
    }

    /// Kathmandu's longest day is a little over 14 hours and its shortest a
    /// little over 10 — a good check that the seasonal swing is real and not a
    /// constant twelve hours.
    @Test func daylightSwingsWithTheSeason() throws {
        let june = try times("2026-06-21T06:00:00+05:45")
        let december = try times("2026-12-21T06:00:00+05:45")

        #expect(june.daylight > december.daylight)
        #expect(june.daylight / 3600 > 13.5 && june.daylight / 3600 < 14.5)
        #expect(december.daylight / 3600 > 10.0 && december.daylight / 3600 < 10.8)
    }

    @Test func sunAlwaysRisesBeforeItSets() throws {
        for month in 1...12 {
            let date = try #require(NepalTime.calendar.date(
                from: DateComponents(year: 2026, month: month, day: 15, hour: 6)
            ))
            let times = try #require(SolarTimes.times(
                on: date, latitude: Self.kathmandu.latitude, longitude: Self.kathmandu.longitude
            ))
            #expect(times.sunrise < times.sunset, "month \(month)")
        }
    }

    /// Inside the polar circle the sun may never rise. The maths must say so
    /// rather than invent a time.
    @Test func returnsNothingWhereTheSunDoesNotRise() {
        let midwinter = ISO8601DateFormatter().date(from: "2026-12-21T12:00:00Z")!
        #expect(SolarTimes.times(on: midwinter, latitude: 80, longitude: 0) == nil)
    }
}

struct RahuKaalTests {
    /// A fixed traditional table, not a formula. Written out and pinned so a
    /// later "simplification" into arithmetic cannot quietly reorder it.
    @Test func usesTheTraditionalWeekdayTable() {
        #expect(RahuKaal.segment(forWeekday: 1) == 8, "Sunday")
        #expect(RahuKaal.segment(forWeekday: 2) == 2, "Monday")
        #expect(RahuKaal.segment(forWeekday: 3) == 7, "Tuesday")
        #expect(RahuKaal.segment(forWeekday: 4) == 5, "Wednesday")
        #expect(RahuKaal.segment(forWeekday: 5) == 6, "Thursday")
        #expect(RahuKaal.segment(forWeekday: 6) == 4, "Friday")
        #expect(RahuKaal.segment(forWeekday: 7) == 3, "Saturday")
    }

    /// The first eighth, straight after sunrise, is never Rahu Kaal.
    @Test func neverClaimsTheFirstSegment() {
        for weekday in 1...7 {
            #expect(RahuKaal.segment(forWeekday: weekday) != 1, "weekday \(weekday)")
        }
    }

    /// The window is one eighth of daylight — about 90 minutes in Nepal.
    @Test func windowIsOneEighthOfDaylight() throws {
        let sunrise = Date(timeIntervalSince1970: 0)
        let sunset = sunrise.addingTimeInterval(12 * 3600)
        let window = try #require(RahuKaal.window(sunrise: sunrise, sunset: sunset, weekday: 2))

        #expect(window.end.timeIntervalSince(window.start) == 1.5 * 3600)
        // Monday takes the second part: 07:30–09:00 against a 06:00 sunrise.
        #expect(window.start.timeIntervalSince(sunrise) == 1.5 * 3600)
    }

    @Test func sundayTakesTheLastSegmentEndingAtSunset() throws {
        let sunrise = Date(timeIntervalSince1970: 0)
        let sunset = sunrise.addingTimeInterval(8 * 3600)
        let window = try #require(RahuKaal.window(sunrise: sunrise, sunset: sunset, weekday: 1))

        #expect(window.end == sunset)
        #expect(window.start == sunrise.addingTimeInterval(7 * 3600))
    }

    @Test func rejectsAnImpossibleDay() {
        let now = Date()
        #expect(RahuKaal.window(sunrise: now, sunset: now.addingTimeInterval(-1), weekday: 2) == nil)
        #expect(RahuKaal.window(sunrise: now, sunset: now.addingTimeInterval(3600), weekday: 9) == nil)
    }

    /// Every weekday's window must sit inside daylight and never overlap
    /// sunrise itself.
    @Test func alwaysFallsInsideDaylight() throws {
        let sunrise = Date(timeIntervalSince1970: 0)
        let sunset = sunrise.addingTimeInterval(12 * 3600)
        for weekday in 1...7 {
            let window = try #require(RahuKaal.window(sunrise: sunrise, sunset: sunset, weekday: weekday))
            #expect(window.start > sunrise, "weekday \(weekday) starts at sunrise")
            #expect(window.end <= sunset, "weekday \(weekday) runs past sunset")
        }
    }
}
