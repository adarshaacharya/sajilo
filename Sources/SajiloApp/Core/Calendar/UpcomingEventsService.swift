import Foundation

struct UpcomingEvent: Identifiable, Equatable, Sendable {
    let date: NepaliDate
    let gregorian: Date
    let name: String
    let isPublicHoliday: Bool
    /// Whole days from today. 0 is today, 1 tomorrow.
    let daysAway: Int

    var id: String { "\(date.year)-\(date.month)-\(date.day)-\(name)" }

    var relativeText: String {
        switch daysAway {
        case 0: "Today"
        case 1: "Tomorrow"
        default: "in \(daysAway) days"
        }
    }
}

/// PRD §5.3: named festivals and public holidays ahead of today, with the
/// number of days remaining.
enum UpcomingEventsService {
    /// Walks forward month by month from `today`.
    ///
    /// Only days carrying a name are returned. Plain Saturdays are public
    /// holidays in Nepal but appear 52 times a year, so listing them would bury
    /// the festivals this is meant to surface.
    static func events(
        from today: NepaliDate,
        limit: Int = 12,
        horizonDays: Int = 400
    ) -> [UpcomingEvent] {
        guard let todayGregorian = try? BikramSambatCalendar.gregorianDate(from: today) else { return [] }

        var results: [UpcomingEvent] = []
        var cursor = NepaliDate(year: today.year, month: today.month, day: 1)

        while results.count < limit {
            guard BikramSambatCalendar.supportedNepaliYears.contains(cursor.year),
                  let dayCount = BikramSambatCalendar.daysInMonth(year: cursor.year, month: cursor.month) else {
                break
            }

            let monthEvents = CalendarEventStore.events(year: cursor.year, month: cursor.month)

            for day in 1...dayCount {
                guard let event = monthEvents[day], let name = event.name else { continue }

                let date = NepaliDate(year: cursor.year, month: cursor.month, day: day)
                guard date >= today,
                      let gregorian = try? BikramSambatCalendar.gregorianDate(from: date) else { continue }

                let daysAway = calendar.dateComponents([.day], from: todayGregorian, to: gregorian).day ?? 0
                guard daysAway <= horizonDays else { return results }

                results.append(
                    UpcomingEvent(
                        date: date,
                        gregorian: gregorian,
                        name: name,
                        isPublicHoliday: event.isPublicHoliday,
                        daysAway: daysAway
                    )
                )
                if results.count >= limit { return results }
            }

            guard let next = try? BikramSambatCalendar.addingMonths(1, to: cursor) else { break }
            cursor = next
        }

        return results
    }

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar
    }()
}
