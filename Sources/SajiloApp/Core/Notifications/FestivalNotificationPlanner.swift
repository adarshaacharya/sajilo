import Foundation

/// What the user asked to be told about. Everything is off until they say
/// otherwise — PRD §5.3 requires notifications to be opt-in and individually
/// configurable, and §9 requires permission to be asked for only once one of
/// these is switched on.
struct NotificationOptions: Equatable, Sendable {
    var eveOfPublicHoliday = false
    var eveOfFestival = false

    /// Evening before, in Nepal time. Late enough to read as "tomorrow", early
    /// enough not to arrive after the user has gone to bed.
    var hour = 19

    static let none = NotificationOptions()

    var isAnyEnabled: Bool { eveOfPublicHoliday || eveOfFestival }
}

struct PlannedNotification: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String
    let fireDate: Date
}

/// Turns the bundled festival list into scheduled reminders.
///
/// Deliberately pure: no notification framework, no clock of its own. All the
/// rules that are easy to get wrong — never scheduling into the past, one
/// reminder per day rather than per festival, stable identifiers so
/// rescheduling replaces rather than duplicates — are testable without
/// granting a permission or waiting for a date to arrive.
enum FestivalNotificationPlanner {
    /// macOS caps pending local notifications at 64; staying well under leaves
    /// headroom and there is no value in scheduling a year out.
    static let limit = 30

    static func plan(
        events: [UpcomingEvent],
        options: NotificationOptions,
        now: Date,
        calendar: Calendar = NepalTime.calendar
    ) -> [PlannedNotification] {
        guard options.isAnyEnabled else { return [] }

        // Several festivals can share a date; one reminder listing them beats
        // three notifications firing at the same instant.
        let byDate = Dictionary(grouping: events.filter { matches($0, options) }) { $0.date }

        return byDate.keys.sorted()
            .compactMap { date -> PlannedNotification? in
                guard let sameDay = byDate[date], let first = sameDay.first else { return nil }
                guard let fireDate = eveOfEvent(first, hour: options.hour, calendar: calendar),
                      fireDate > now else { return nil }

                let isHoliday = sameDay.contains { $0.isPublicHoliday }
                return PlannedNotification(
                    id: identifier(for: date),
                    title: isHoliday ? "Public holiday tomorrow" : "Festival tomorrow",
                    body: sameDay.map(\.name).joined(separator: " · "),
                    fireDate: fireDate
                )
            }
            .prefix(limit)
            .map { $0 }
    }

    /// Stable across replans, so rescheduling overwrites the previous request
    /// for a date instead of stacking another one beside it.
    static func identifier(for date: NepaliDate) -> String {
        "sajilo.festival.\(date.year)-\(date.month)-\(date.day)"
    }

    private static func matches(_ event: UpcomingEvent, _ options: NotificationOptions) -> Bool {
        event.isPublicHoliday ? options.eveOfPublicHoliday : options.eveOfFestival
    }

    private static func eveOfEvent(
        _ event: UpcomingEvent,
        hour: Int,
        calendar: Calendar
    ) -> Date? {
        guard let eve = calendar.date(byAdding: .day, value: -1, to: event.gregorian) else { return nil }
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: eve)
    }
}
