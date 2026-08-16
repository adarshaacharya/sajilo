import Foundation

/// Everything Sajilo shows is anchored to Nepal, not to wherever the user is:
/// the calendar rolls over at Kathmandu midnight, the weather is Nepali
/// weather, and the rates are the Nepali central bank's. Centralising the zone
/// keeps that decision in one place instead of fourteen scattered literals,
/// each of which could quietly drift.
enum NepalTime {
    static let timeZone = TimeZone(identifier: "Asia/Kathmandu")!

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }()

    /// A fixed-format parser or printer in Nepal time.
    ///
    /// `en_US_POSIX` because these formats are wire formats and must not follow
    /// the user's locale — a Nepali-locale device would otherwise render the
    /// year in Devanagari and fail to round-trip.
    static func formatter(_ format: String, locale: String = "en_US_POSIX") -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: locale)
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }

    /// Display formats, which do want readable English month and day names.
    static func displayFormatter(_ format: String) -> DateFormatter {
        formatter(format, locale: "en_US")
    }
}

extension Calendar {
    /// Weather and dates are judged in Nepal rather than wherever the user is.
    static var nepal: Calendar { NepalTime.calendar }
}
