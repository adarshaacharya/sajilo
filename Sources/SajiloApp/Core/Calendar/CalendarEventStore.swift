import Foundation

struct CalendarEvent: Equatable, Sendable {
    let name: String?
    let tithi: String?
    let isPublicHoliday: Bool
}

/// Read-only bundled calendar event data.
enum CalendarEventStore {
    /// Festival and tithi coverage in the bundled data. Years outside this
    /// range are intentionally unavailable: their source files had no festival
    /// or tithi information beyond Saturday flags the calendar already derives.
    static let supportedYears = 2066...2083

    static func events(year: Int, month: Int) -> [Int: CalendarEvent] {
        guard supportedYears.contains(year), (1...12).contains(month),
              let url = Bundle.module.url(forResource: "\(month)", withExtension: "json", subdirectory: "CalendarEvents/\(year)"),
              let data = try? Data(contentsOf: url),
              let payload = try? JSONDecoder().decode(MonthPayload.self, from: data) else {
            return [:]
        }

        var result: [Int: CalendarEvent] = [:]
        var hasReachedFirstDay = false
        for sourceDay in payload.days {
            guard let day = Int(NepaliNumerals.arabicString(from: sourceDay.nepaliDay)) else { continue }
            if day == 1 { hasReachedFirstDay = true }
            guard hasReachedFirstDay else { continue }

            let name = sourceDay.festival.trimmingCharacters(in: .whitespacesAndNewlines)
            let tithi = sourceDay.tithi.trimmingCharacters(in: .whitespacesAndNewlines)
            result[day] = CalendarEvent(
                name: name.isEmpty ? nil : name,
                tithi: tithi.isEmpty ? nil : tithi,
                isPublicHoliday: sourceDay.isHoliday
            )
        }
        return result
    }

    private struct MonthPayload: Decodable { let days: [SourceDay] }
    private struct SourceDay: Decodable {
        let nepaliDay: String
        let tithi: String
        let festival: String
        let isHoliday: Bool

        enum CodingKeys: String, CodingKey {
            case nepaliDay = "n"
            case tithi = "t"
            case festival = "f"
            case isHoliday = "h"
        }
    }
}
