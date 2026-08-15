import Testing
@testable import SajiloApp

struct CalendarEventStoreTests {
    @Test func readsBundledFestivalDataForShrawan2083() {
        let events = CalendarEventStore.events(year: 2083, month: 4)

        #expect(events[1]?.name == "साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने")
        #expect(events[1]?.tithi == "तृतीया")
        #expect(events[2]?.isPublicHoliday == true)
    }

    /// Festival and tithi data only exists for BS 2066–2083. The app must
    /// refuse dates outside that range rather than reporting "no events today"
    /// when no data is available.
    @Test(arguments: [1992, 2000, 2065, 2084, 2085])
    func returnsNoDataOutsideTheFestivalRange(year: Int) {
        #expect(CalendarEventStore.events(year: year, month: 1).isEmpty)
    }

    @Test func coversTheFullDeclaredRange() {
        for year in CalendarEventStore.supportedYears {
            let events = CalendarEventStore.events(year: year, month: 1)
            #expect(!events.isEmpty, "BS \(year) is declared supported but has no data")
        }
    }

    /// The leading cell of each source grid belongs to the preceding month and
    /// must never be read as day 1 of this one. For Shrawan 2083 that cell
    /// reports Asar as 31 days where the verified table says 32, so trusting it
    /// would corrupt both the day number and the event attached to it.
    @Test func ignoresTheLeadingCellFromThePrecedingMonth() {
        let events = CalendarEventStore.events(year: 2083, month: 4)
        let dayCount = BikramSambatCalendar.daysInMonth(year: 2083, month: 4)

        #expect(events.keys.allSatisfy { (1...(dayCount ?? 0)).contains($0) })
        #expect(events[1]?.tithi == "तृतीया", "day 1 must not be overwritten by the stray cell")
    }

    /// The 35-cell source grid drops the tail of any month needing six rows —
    /// one day usually, two when the month also starts late in the week. This
    /// pins the known gap so a data refresh cannot quietly widen it.
    @Test(arguments: [
        (2083, 2, 31, 31),
        (2083, 4, 31, 31),
        (2083, 11, 30, 30),
        (2082, 7, 30, 30),
        (2081, 1, 31, 30)
    ])
    func documentsTruncatedTrailingDays(
        year: Int,
        month: Int,
        monthLength: Int,
        firstMissingDay: Int
    ) {
        let events = CalendarEventStore.events(year: year, month: month)

        #expect(BikramSambatCalendar.daysInMonth(year: year, month: month) == monthLength)
        for day in 1..<firstMissingDay {
            #expect(events[day] != nil, "BS \(year)-\(month) day \(day) should still be present")
        }
        for day in firstMissingDay...monthLength {
            #expect(
                events[day] == nil,
                "BS \(year)-\(month) day \(day) unexpectedly has data — if the source was fixed, update this test and THIRD_PARTY_NOTICES.md"
            )
        }
    }

    /// The gap is always a trailing run, never a hole in the middle of a month.
    /// An interior gap would mean the grid parser had drifted.
    @Test func gapsAreAlwaysTrailingNeverInterior() {
        for year in [2081, 2082, 2083] {
            for month in 1...12 {
                guard let length = BikramSambatCalendar.daysInMonth(year: year, month: month) else { continue }
                let events = CalendarEventStore.events(year: year, month: month)
                let present = (1...length).filter { events[$0] != nil }
                #expect(
                    present == Array(1...(present.count)),
                    "BS \(year)-\(month) has an interior gap: \(present)"
                )
            }
        }
    }

    /// Months that fit the grid must be complete end to end.
    @Test func coversEveryDayOfAnUntruncatedMonth() {
        let dayCount = BikramSambatCalendar.daysInMonth(year: 2083, month: 3)
        let events = CalendarEventStore.events(year: 2083, month: 3)

        #expect(dayCount == 32)
        for day in 1...(dayCount ?? 0) {
            #expect(events[day] != nil, "BS 2083-03 day \(day) missing")
        }
    }
}
