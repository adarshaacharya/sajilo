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

        /// For the chip row, where the card already says "Copy as".
        var shortLabel: String {
            switch self {
            case .nepaliNumerals: "\u{0968}\u{0966}\u{096A}\u{096F}"
            case .englishNumerals: "2049"
            case .longDate: "Long"
            }
        }
    }

    /// Resolves a Bikram Sambat date into a full outcome, so the day-detail
    /// route renders through exactly the same path as the converter.
    static func make(for nepali: NepaliDate) -> ConversionOutcome? {
        guard let gregorian = try? BikramSambatCalendar.gregorianDate(from: nepali) else { return nil }
        return ConversionOutcome(
            nepali: nepali,
            gregorian: gregorian,
            event: CalendarEventStore.events(year: nepali.year, month: nepali.month)[nepali.day]
        )
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

    private static let nepalCalendar = NepalTime.calendar
    private static let longDateFormatter = NepalTime.displayFormatter("EEEE, MMMM d, yyyy")
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

    /// Round-trips the components so an impossible date such as 31 February is
    /// rejected rather than silently rolled forward by `Calendar`.
    private func makeGregorianDate(year: Int, month: Int, day: Int) throws -> Date {
        let requested = DateComponents(year: year, month: month, day: day)
        guard let date = NepalTime.calendar.date(from: requested),
              NepalTime.calendar.dateComponents([.year, .month, .day], from: date) == requested else {
            throw BikramSambatCalendar.ConversionError.unsupportedGregorianDate
        }
        return date
    }

    private func gregorianComponents(for date: Date) -> DateComponents {
        NepalTime.calendar.dateComponents([.year, .month, .day], from: date)
    }
}
