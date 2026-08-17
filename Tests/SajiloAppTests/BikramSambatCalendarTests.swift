import Foundation
import Testing
@testable import SajiloApp

struct BikramSambatCalendarTests {
    @Test(arguments: [
        // BS 2000-01-01 is a published reference the bundled table was not
        // fitted to, so it independently validates the epoch and every year
        // length between it and the table's start.
        (1943, 4, 14, NepaliDate(year: 2000, month: 1, day: 1)),
        (2023, 4, 14, NepaliDate(year: 2080, month: 1, day: 1)),
        (2025, 4, 14, NepaliDate(year: 2082, month: 1, day: 1)),
        (2026, 8, 15, NepaliDate(year: 2083, month: 4, day: 30)),
        // BS 2084 is the last year checked against a published calendar; an
        // earlier draft of this table had it wrong for seven of twelve months.
        (2027, 4, 14, NepaliDate(year: 2084, month: 1, day: 1))
    ])
    func convertsGregorianDatesToBikramSambat(
        year: Int,
        month: Int,
        day: Int,
        expected: NepaliDate
    ) throws {
        let gregorianDate = makeGregorianDate(year: year, month: month, day: day)
        #expect(try BikramSambatCalendar.nepaliDate(from: gregorianDate) == expected)
    }

    @Test func convertsBikramSambatDateToGregorian() throws {
        let result = try BikramSambatCalendar.gregorianDate(from: NepaliDate(year: 2083, month: 4, day: 30))
        let components = Self.nepalCalendar.dateComponents([.year, .month, .day, .weekday], from: result)

        #expect(components.year == 2026)
        #expect(components.month == 8)
        #expect(components.day == 15)
        // The PRD's dashboard mock shows this date as a Saturday.
        #expect(components.weekday == 7)
    }

    /// Guards the defect class that shipped a 367-day BS 2084: a mistyped row
    /// silently shifts every conversion after it.
    @Test func everySupportedYearHasAValidLength() {
        for year in BikramSambatCalendar.supportedNepaliYears {
            let lengths = (1...12).map { BikramSambatCalendar.daysInMonth(year: year, month: $0) }
            #expect(!lengths.contains(nil), "BS \(year) is missing a month")

            let months = lengths.compactMap { $0 }
            #expect(months.allSatisfy { (29...32).contains($0) }, "BS \(year) has an out-of-range month")

            let total = months.reduce(0, +)
            #expect(total == 365 || total == 366, "BS \(year) totals \(total) days")
        }
    }

    /// Every date in the supported range must survive BS → AD → BS unchanged.
    @Test func roundTripsEveryDateInTheSupportedRange() throws {
        for year in BikramSambatCalendar.supportedNepaliYears {
            for month in 1...12 {
                guard let numberOfDays = BikramSambatCalendar.daysInMonth(year: year, month: month) else {
                    Issue.record("BS \(year)-\(month) missing")
                    continue
                }
                for day in [1, numberOfDays] {
                    let bsDate = NepaliDate(year: year, month: month, day: day)
                    let adDate = try BikramSambatCalendar.gregorianDate(from: bsDate)
                    #expect(try BikramSambatCalendar.nepaliDate(from: adDate) == bsDate)
                }
            }
        }
    }

    /// Consecutive days must advance by exactly one day across year boundaries,
    /// which catches an off-by-one in the year-offset table.
    @Test func yearBoundariesAreContiguous() throws {
        let years = BikramSambatCalendar.supportedNepaliYears
        for year in years.dropLast() {
            let lastDay = try #require(BikramSambatCalendar.daysInMonth(year: year, month: 12))
            let endOfYear = try BikramSambatCalendar.gregorianDate(
                from: NepaliDate(year: year, month: 12, day: lastDay)
            )
            let startOfNext = try BikramSambatCalendar.gregorianDate(
                from: NepaliDate(year: year + 1, month: 1, day: 1)
            )
            let gap = Self.nepalCalendar.dateComponents([.day], from: endOfYear, to: startOfNext).day
            #expect(gap == 1, "BS \(year) does not join \(year + 1)")
        }
    }

    @Test func validatesActualMonthLengthInsteadOfGenericMaximum() {
        #expect(BikramSambatCalendar.daysInMonth(year: 2083, month: 3) == 32)
        #expect(BikramSambatCalendar.daysInMonth(year: 2083, month: 4) == 31)
        #expect(BikramSambatCalendar.daysInMonth(year: 2083, month: 13) == nil)
    }

    @Test func rejectsOutOfRangeNepaliDate() {
        #expect(throws: BikramSambatCalendar.ConversionError.unsupportedNepaliDate) {
            try BikramSambatCalendar.gregorianDate(from: NepaliDate(year: 2083, month: 4, day: 32))
        }
    }

    @Test func rejectsDatesOutsideTheSupportedYears() {
        let years = BikramSambatCalendar.supportedNepaliYears

        #expect(throws: BikramSambatCalendar.ConversionError.unsupportedNepaliDate) {
            try BikramSambatCalendar.gregorianDate(from: NepaliDate(year: years.lowerBound - 1, month: 1, day: 1))
        }
        #expect(throws: BikramSambatCalendar.ConversionError.unsupportedNepaliDate) {
            try BikramSambatCalendar.gregorianDate(from: NepaliDate(year: years.upperBound + 1, month: 1, day: 1))
        }
        #expect(throws: BikramSambatCalendar.ConversionError.unsupportedGregorianDate) {
            try BikramSambatCalendar.nepaliDate(from: makeGregorianDate(year: 1900, month: 1, day: 1))
        }
        #expect(throws: BikramSambatCalendar.ConversionError.unsupportedGregorianDate) {
            try BikramSambatCalendar.nepaliDate(from: makeGregorianDate(year: 2100, month: 1, day: 1))
        }
    }

    /// The provisional window must stay inside the supported range, so the UI
    /// can never flag a year the engine cannot convert.
    @Test func provisionalYearsAreSupported() {
        let supported = BikramSambatCalendar.supportedNepaliYears
        let provisional = BikramSambatCalendar.provisionalNepaliYears
        #expect(supported.contains(provisional.lowerBound))
        #expect(supported.contains(provisional.upperBound))
    }

    private static let nepalCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar
    }()

    private func makeGregorianDate(year: Int, month: Int, day: Int) -> Date {
        Self.nepalCalendar.date(from: DateComponents(year: year, month: month, day: day))!
    }
}

@Suite("English month span in the header")
struct GregorianSpanTests {
    /// The header names which English months a Bikram Sambat month covers.
    /// Computed the same way the view does, so the format is pinned here
    /// rather than only being visible on screen.
    private func span(year: Int, month: Int) throws -> String {
        let today = NepaliDate(year: year, month: month, day: 1)
        let grid = try BikramSambatCalendar.month(containing: today, today: today)
        let days = grid.days.compactMap(\.date)
        let start = try BikramSambatCalendar.gregorianDate(from: try #require(days.first))
        let end = try BikramSambatCalendar.gregorianDate(from: try #require(days.last))

        let calendar = NepalTime.calendar
        let monthOnly = NepalTime.displayFormatter("MMM")
        let monthYear = NepalTime.displayFormatter("MMM yyyy")

        if calendar.isDate(start, equalTo: end, toGranularity: .month) {
            return monthYear.string(from: start)
        }
        let startYear = calendar.component(.year, from: start)
        if startYear == calendar.component(.year, from: end) {
            return "\(monthOnly.string(from: start))/\(monthOnly.string(from: end)) \(startYear)"
        }
        let endYearShort = String(format: "%02d", calendar.component(.year, from: end) % 100)
        return "\(monthOnly.string(from: start))/\(monthOnly.string(from: end)) \(startYear)–\(endYearShort)"
    }

    @Test func namesBothEnglishMonthsTheBikramMonthCovers() throws {
        #expect(try span(year: 2083, month: 5) == "Aug/Sep 2026", "Bhadra 2083")
        #expect(try span(year: 2083, month: 4) == "Jul/Aug 2026", "Saun 2083")
    }

    /// Poush crosses into a new Gregorian year, so both years must appear —
    /// a bare "Dec/Jan 2026" would be wrong twice over. Written as a range
    /// rather than two full years, because "Dec 2026 / Jan 2027" is wide enough
    /// to run under the Today button in the header.
    @Test func carriesBothYearsWhenTheMonthCrossesNewYear() throws {
        let poush = try span(year: 2083, month: 9)

        #expect(poush == "Dec/Jan 2026–27", "\(poush)")
        // Narrow enough to sit beside the navigation controls.
        #expect(poush.count <= 16, "\(poush) is too wide for the header")
    }

    /// Every month must produce something readable, and never an empty string.
    @Test func everyMonthOfTheYearHasASpan() throws {
        for month in 1...12 {
            let text = try span(year: 2083, month: month)
            #expect(!text.isEmpty)
            #expect(text.contains("20"), "month \(month) lost its year: \(text)")
        }
    }
}
