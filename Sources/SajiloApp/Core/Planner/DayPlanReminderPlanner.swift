import Foundation

/// Converts timed personal plans into local-notification requests. Kept pure
/// so date conversion, lead-time arithmetic, ordering, and past-date handling
/// are all testable without requesting macOS notification permission.
enum DayPlanReminderPlanner {
    /// Leaves room beneath macOS's 64 pending-notification limit for festival
    /// reminders and future app features.
    static let limit = 30

    static func plan(
        entries: [DayPlan],
        now: Date,
        calendar: Calendar = NepalTime.calendar
    ) -> [PlannedNotification] {
        entries
            .compactMap { nextNotification(for: $0, now: now, calendar: calendar) }
            .sorted { $0.fireDate < $1.fireDate }
            .prefix(limit)
            .map { $0 }
    }

    private static func nextNotification(
        for entry: DayPlan,
        now: Date,
        calendar: Calendar
    ) -> PlannedNotification? {
        guard entry.time != nil, entry.reminder != nil else { return nil }

        switch entry.recurrence {
        case .none:
            return notification(for: entry, on: entry.date, now: now, calendar: calendar)
        case .yearlyBikramSambat:
            guard let today = try? BikramSambatCalendar.nepaliDate(from: now) else { return nil }
            for year in max(today.year, entry.date.year)...BikramSambatCalendar.supportedNepaliYears.upperBound {
                guard let occurrence = entry.occurrence(in: year) else { continue }
                if let notification = notification(for: entry, on: occurrence, now: now, calendar: calendar) {
                    return notification
                }
            }
            return nil
        }
    }

    private static func notification(
        for entry: DayPlan,
        on date: NepaliDate,
        now: Date,
        calendar: Calendar
    ) -> PlannedNotification? {
        guard let time = entry.time,
              let reminder = entry.reminder,
              let day = try? BikramSambatCalendar.gregorianDate(from: date),
              let eventDate = calendar.date(
                bySettingHour: time.hour,
                minute: time.minute,
                second: 0,
                of: day
              ),
              let fireDate = calendar.date(byAdding: .minute, value: -reminder.rawValue, to: eventDate),
              fireDate > now else {
            return nil
        }

        let occurrenceSuffix = entry.recurrence == .yearlyBikramSambat ? ".\(date.year)" : ""
        return PlannedNotification(
            id: "sajilo.plan.\(entry.id.uuidString)\(occurrenceSuffix)",
            title: entry.title,
            body: entry.note.isEmpty ? "Sajilo day plan" : entry.note,
            fireDate: fireDate
        )
    }
}
