import Foundation
import Testing
@testable import SajiloApp

struct UpcomingEventsServiceTests {
    private let today = NepaliDate(year: 2083, month: 4, day: 1)

    @Test func startsWithTodayWhenTodayIsItselfAFestival() throws {
        let events = UpcomingEventsService.events(from: today)
        let first = try #require(events.first)

        #expect(first.date == today)
        #expect(first.name == "साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने")
        #expect(first.daysAway == 0)
        #expect(first.relativeText == "Today")
    }

    @Test func ordersEventsByHowSoonTheyAre() {
        let events = UpcomingEventsService.events(from: today)
        let distances = events.map(\.daysAway)

        #expect(distances == distances.sorted())
        #expect(Set(events.map(\.id)).count == events.count, "no duplicates")
    }

    /// BS 2083-04 carries named days on 1, 6, 9, 13 — so the gaps double as a
    /// check that `daysAway` counts real elapsed days, not array positions.
    @Test func computesDaysRemainingFromToday() throws {
        let events = UpcomingEventsService.events(from: today, limit: 4)

        #expect(events.map(\.daysAway) == [0, 5, 8, 12])
        #expect(events.map(\.date.day) == [1, 6, 9, 13])
        let holiday = try #require(events.first { $0.date.day == 9 })
        #expect(holiday.isPublicHoliday)
    }

    @Test func neverReturnsAPastEvent() {
        let midMonth = NepaliDate(year: 2083, month: 4, day: 20)
        let events = UpcomingEventsService.events(from: midMonth)

        #expect(events.allSatisfy { $0.date >= midMonth })
        #expect(events.allSatisfy { $0.daysAway >= 0 })
    }

    /// The scan has to roll into the following month and the following year.
    @Test func crossesMonthAndYearBoundaries() {
        let lateInYear = NepaliDate(year: 2082, month: 12, day: 25)
        let events = UpcomingEventsService.events(from: lateInYear, limit: 8)

        #expect(!events.isEmpty)
        #expect(events.contains { $0.date.year == 2083 })
        #expect(events.allSatisfy { $0.daysAway >= 0 })
    }

    /// BS 2083 is the last year with festival data, so the list empties as it
    /// is crossed. The scan must stop rather than walk to the end of the
    /// calendar range looking for more.
    @Test func stopsAtTheEndOfTheFestivalData() {
        let events = UpcomingEventsService.events(from: NepaliDate(year: 2083, month: 12, day: 25))

        #expect(events.allSatisfy { $0.date.year == 2083 })
    }

    @Test func respectsTheRequestedLimit() {
        #expect(UpcomingEventsService.events(from: today, limit: 3).count == 3)
        #expect(UpcomingEventsService.events(from: today, limit: 1).count == 1)
    }

    @Test func respectsTheHorizonAndDoesNotRunAway() {
        let events = UpcomingEventsService.events(from: today, limit: 500, horizonDays: 30)

        #expect(events.allSatisfy { $0.daysAway <= 30 })
        #expect(!events.isEmpty)
    }

    /// Past the bundled event data the scan must stop cleanly, not spin to the
    /// end of the calendar range.
    @Test func terminatesBeyondTheBundledEventData() {
        let beyond = NepaliDate(year: 2084, month: 1, day: 1)
        let events = UpcomingEventsService.events(from: beyond)

        #expect(events.isEmpty)
    }

    @Test func labelsTomorrowDistinctly() {
        let dayBefore = NepaliDate(year: 2083, month: 4, day: 5)
        let events = UpcomingEventsService.events(from: dayBefore, limit: 1)

        #expect(events.first?.daysAway == 1)
        #expect(events.first?.relativeText == "Tomorrow")
    }

    @Test func filtersCurrentFestivalsAndPublicHolidaysIndependently() {
        let events = UpcomingEventsService.events(from: today, limit: 12)

        let current = events.filter(UpcomingEventFilter.current.includes)
        let festivals = events.filter(UpcomingEventFilter.festivals.includes)
        let holidays = events.filter(UpcomingEventFilter.publicHolidays.includes)

        #expect(current.allSatisfy { $0.daysAway < 7 })
        #expect(festivals == events)
        #expect(holidays.allSatisfy { $0.isPublicHoliday })
        #expect(!holidays.isEmpty)
    }
}
