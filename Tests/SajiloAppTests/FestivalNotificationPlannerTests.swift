import Foundation
import Testing
@testable import SajiloApp

struct FestivalNotificationPlannerTests {
    private let now = nepalMoment(month: 8, day: 16, hour: 9)

    @Test func schedulesNothingWhileEveryReminderIsOff() {
        let planned = FestivalNotificationPlanner.plan(
            events: [festival(inDays: 3), holiday(inDays: 5)],
            options: .none,
            now: now
        )

        #expect(planned.isEmpty)
    }

    @Test func schedulesOnlyTheCategoriesTheUserAskedFor() {
        let events = [festival(inDays: 3), holiday(inDays: 5)]

        let holidaysOnly = FestivalNotificationPlanner.plan(
            events: events,
            options: NotificationOptions(eveOfPublicHoliday: true, eveOfFestival: false),
            now: now
        )
        #expect(holidaysOnly.count == 1)
        #expect(holidaysOnly.first?.title == "Public holiday tomorrow")

        let festivalsOnly = FestivalNotificationPlanner.plan(
            events: events,
            options: NotificationOptions(eveOfPublicHoliday: false, eveOfFestival: true),
            now: now
        )
        #expect(festivalsOnly.count == 1)
        #expect(festivalsOnly.first?.title == "Festival tomorrow")
    }

    /// The reminder is for *tomorrow*, so it fires the evening before at the
    /// configured hour in Nepal time.
    @Test func firesTheEveningBeforeTheEvent() throws {
        let planned = FestivalNotificationPlanner.plan(
            events: [festival(inDays: 3)],
            options: NotificationOptions(eveOfFestival: true),
            now: now
        )
        let reminder = try #require(planned.first)

        let parts = NepalTime.calendar.dateComponents([.month, .day, .hour], from: reminder.fireDate)
        #expect(parts.month == 8)
        #expect(parts.day == 18, "event is the 19th, so the eve is the 18th")
        #expect(parts.hour == 19)
    }

    /// An event whose eve has already passed must not be scheduled — macOS
    /// would either drop it or deliver it immediately.
    @Test func neverSchedulesIntoThePast() {
        let planned = FestivalNotificationPlanner.plan(
            events: [festival(inDays: 0), festival(inDays: 1), festival(inDays: 2)],
            options: NotificationOptions(eveOfFestival: true),
            now: nepalMoment(month: 8, day: 16, hour: 21)
        )

        #expect(planned.allSatisfy { $0.fireDate > nepalMoment(month: 8, day: 16, hour: 21) })
        // Today's and tomorrow's eves are both behind a 9pm "now".
        #expect(planned.count == 1)
    }

    /// Several festivals often share one date; three notifications firing at
    /// the same instant would be noise.
    @Test func groupsFestivalsSharingADateIntoOneReminder() throws {
        let planned = FestivalNotificationPlanner.plan(
            events: [
                festival(inDays: 3, name: "गुरू पूर्णिमा"),
                festival(inDays: 3, name: "पूर्णिमाव्रत")
            ],
            options: NotificationOptions(eveOfFestival: true),
            now: now
        )

        #expect(planned.count == 1)
        #expect(planned.first?.body == "गुरू पूर्णिमा · पूर्णिमाव्रत")
    }

    /// A day carrying both is a holiday first — that is the more useful headline.
    @Test func prefersTheHolidayTitleOnAMixedDay() throws {
        let planned = FestivalNotificationPlanner.plan(
            events: [festival(inDays: 4, name: "चन्द्रोदय"), holiday(inDays: 4, name: "वराह जयन्ती")],
            options: NotificationOptions(eveOfPublicHoliday: true, eveOfFestival: true),
            now: now
        )

        #expect(planned.count == 1)
        #expect(planned.first?.title == "Public holiday tomorrow")
    }

    @Test func ordersRemindersSoonestFirst() {
        let planned = FestivalNotificationPlanner.plan(
            events: [festival(inDays: 9), festival(inDays: 2), festival(inDays: 5)],
            options: NotificationOptions(eveOfFestival: true),
            now: now
        )

        #expect(planned.map(\.fireDate) == planned.map(\.fireDate).sorted())
    }

    /// macOS caps pending local notifications, so the plan is bounded.
    @Test func staysWithinTheSchedulingLimit() {
        let many = (2...80).map { festival(inDays: $0) }

        let planned = FestivalNotificationPlanner.plan(
            events: many,
            options: NotificationOptions(eveOfFestival: true),
            now: now
        )

        #expect(planned.count == FestivalNotificationPlanner.limit)
    }

    /// Identifiers must be stable per date so a replan replaces rather than
    /// stacks a second reminder for the same day.
    @Test func usesAStableIdentifierPerDate() {
        let options = NotificationOptions(eveOfFestival: true)
        let first = FestivalNotificationPlanner.plan(events: [festival(inDays: 3)], options: options, now: now)
        let again = FestivalNotificationPlanner.plan(events: [festival(inDays: 3)], options: options, now: now)

        #expect(first.map(\.id) == again.map(\.id))
        #expect(Set(first.map(\.id)).count == first.count)
    }

    // MARK: - Fixtures

    private func festival(inDays days: Int, name: String = "अष्टमीव्रत") -> UpcomingEvent {
        event(inDays: days, name: name, isHoliday: false)
    }

    private func holiday(inDays days: Int, name: String = "हरिशयनी एकादशी") -> UpcomingEvent {
        event(inDays: days, name: name, isHoliday: true)
    }

    private func event(inDays days: Int, name: String, isHoliday: Bool) -> UpcomingEvent {
        let gregorian = NepalTime.calendar.date(
            byAdding: .day,
            value: days,
            to: nepalMoment(month: 8, day: 16, hour: 0)
        )!
        return UpcomingEvent(
            date: (try? BikramSambatCalendar.nepaliDate(from: gregorian))
                ?? NepaliDate(year: 2083, month: 4, day: 31),
            gregorian: gregorian,
            name: name,
            isPublicHoliday: isHoliday,
            daysAway: days
        )
    }
}

private func nepalMoment(month: Int, day: Int, hour: Int) -> Date {
    NepalTime.calendar.date(
        from: DateComponents(year: 2026, month: month, day: day, hour: hour)
    )!
}
