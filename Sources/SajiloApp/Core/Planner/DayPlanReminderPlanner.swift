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
        DayPlan.ordered(entries)
            .compactMap { entry -> PlannedNotification? in
                guard let time = entry.time, let reminder = entry.reminder,
                      let day = try? BikramSambatCalendar.gregorianDate(from: entry.date),
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

                return PlannedNotification(
                    id: "sajilo.plan.\(entry.id.uuidString)",
                    title: entry.title,
                    body: entry.note.isEmpty ? "Sajilo day plan" : entry.note,
                    fireDate: fireDate
                )
            }
            .sorted { $0.fireDate < $1.fireDate }
            .prefix(limit)
            .map { $0 }
    }
}
