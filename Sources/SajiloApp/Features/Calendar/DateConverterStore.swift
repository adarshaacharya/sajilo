import Foundation
import Observation

enum ConverterMode: String, CaseIterable, Identifiable {
    case bsToAD
    case adToBS

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bsToAD: "BS → AD"
        case .adToBS: "AD → BS"
        }
    }
}

/// A resolved conversion. Both calendars are kept, not just the requested
/// direction, so the result panel can show the pair and every copy format
/// without re-converting.
struct ConversionOutcome: Equatable, Sendable {
    let nepali: NepaliDate
    let gregorian: Date
    let event: CalendarEvent?

    /// PRD §5.2 requires copy in Nepali numerals, English numerals, and a
    /// localized long-date form.
    enum CopyFormat: String, CaseIterable, Identifiable {
        case nepaliNumerals
        case englishNumerals
        case longDate

        var id: String { rawValue }

        var label: String {
            switch self {
            case .nepaliNumerals: "Nepali numerals"
            case .englishNumerals: "English numerals"
            case .longDate: "Long date"
            }
        }
    }

    func text(for format: CopyFormat) -> String {
        switch format {
        case .nepaliNumerals:
            nepali.nepaliNumerals
        case .englishNumerals:
            "\(nepali.year)/\(String(format: "%02d", nepali.month))/\(String(format: "%02d", nepali.day))"
        case .longDate:
            Self.longDateFormatter.string(from: gregorian)
        }
    }

    var gregorianLongText: String {
        Self.longDateFormatter.string(from: gregorian)
    }

    var nepaliLongText: String {
        "\(NepaliNumerals.string(from: nepali.day)) \(nepali.nepaliMonthName) \(NepaliNumerals.string(from: nepali.year))"
    }

    var isSaturday: Bool {
        Self.nepalCalendar.component(.weekday, from: gregorian) == 7
    }

    private static let nepalCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar
    }()

    private static let longDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "Asia/Kathmandu")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter
    }()
}

@MainActor
@Observable
final class DateConverterStore {
    var mode: ConverterMode = .bsToAD
    var yearText = "2083"
    var monthText = "04"
    var dayText = "30"
    private(set) var outcome: ConversionOutcome?
    private(set) var errorMessage: String?

    init() {
        setToday()
    }

    func convert() {
        guard let year = Int(yearText), let month = Int(monthText), let day = Int(dayText) else {
            outcome = nil
            errorMessage = "Enter numeric year, month, and day values."
            return
        }

        do {
            let nepali: NepaliDate
            let gregorian: Date

            switch mode {
            case .bsToAD:
                nepali = NepaliDate(year: year, month: month, day: day)
                gregorian = try BikramSambatCalendar.gregorianDate(from: nepali)
            case .adToBS:
                gregorian = try makeGregorianDate(year: year, month: month, day: day)
                nepali = try BikramSambatCalendar.nepaliDate(from: gregorian)
            }

            outcome = ConversionOutcome(
                nepali: nepali,
                gregorian: gregorian,
                event: CalendarEventStore.events(year: nepali.year, month: nepali.month)[nepali.day]
            )
            errorMessage = nil
        } catch {
            outcome = nil
            errorMessage = error.localizedDescription
        }
    }

    /// Flips the direction and seeds the fields from the other calendar, so the
    /// same instant stays on screen instead of resetting.
    func swap() {
        guard let outcome else {
            mode = mode == .bsToAD ? .adToBS : .bsToAD
            setToday()
            return
        }

        switch mode {
        case .bsToAD:
            let components = gregorianComponents(for: outcome.gregorian)
            guard let year = components.year, let month = components.month, let day = components.day else { return }
            mode = .adToBS
            assign(year: year, month: month, day: day)
        case .adToBS:
            mode = .bsToAD
            assign(year: outcome.nepali.year, month: outcome.nepali.month, day: outcome.nepali.day)
        }
        convert()
    }

    func setToday() {
        switch mode {
        case .bsToAD:
            let nepaliDate = (try? BikramSambatCalendar.nepaliDate(from: .now))
                ?? NepaliDate(year: 2083, month: 4, day: 30)
            assign(year: nepaliDate.year, month: nepaliDate.month, day: nepaliDate.day)
        case .adToBS:
            let components = gregorianComponents(for: .now)
            guard let year = components.year, let month = components.month, let day = components.day else { return }
            assign(year: year, month: month, day: day)
        }
        convert()
    }

    func resetForModeChange() {
        setToday()
    }

    private func assign(year: Int, month: Int, day: Int) {
        yearText = String(year)
        monthText = String(format: "%02d", month)
        dayText = String(format: "%02d", day)
    }

    private func makeGregorianDate(year: Int, month: Int, day: Int) throws -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)),
              calendar.dateComponents([.year, .month, .day], from: date) == DateComponents(year: year, month: month, day: day) else {
            throw BikramSambatCalendar.ConversionError.unsupportedGregorianDate
        }
        return date
    }

    private func gregorianComponents(for date: Date) -> DateComponents {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar.dateComponents([.year, .month, .day], from: date)
    }
}
