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

enum ConverterResult: Equatable {
    case gregorian(Date)
    case nepali(NepaliDate)

    var copyText: String {
        switch self {
        case .gregorian(let date):
            Self.gregorianFormatter().string(from: date)
        case .nepali(let date):
            "\(date.year)/\(String(format: "%02d", date.month))/\(String(format: "%02d", date.day))"
        }
    }

    var displayText: String {
        switch self {
        case .gregorian(let date):
            Self.gregorianFormatter().string(from: date)
        case .nepali(let date):
            "\(NepaliNumerals.string(from: date.day)) \(date.nepaliMonthName) \(NepaliNumerals.string(from: date.year))"
        }
    }

    private static func gregorianFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "Asia/Kathmandu")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter
    }
}

@MainActor
@Observable
final class DateConverterStore {
    var mode: ConverterMode = .bsToAD
    var yearText = "2083"
    var monthText = "04"
    var dayText = "30"
    private(set) var result: ConverterResult?
    private(set) var errorMessage: String?

    init() {
        convert()
    }

    func convert() {
        guard let year = Int(yearText), let month = Int(monthText), let day = Int(dayText) else {
            result = nil
            errorMessage = "Enter numeric year, month, and day values."
            return
        }

        do {
            switch mode {
            case .bsToAD:
                result = .gregorian(try BikramSambatCalendar.gregorianDate(from: NepaliDate(year: year, month: month, day: day)))
            case .adToBS:
                result = .nepali(try BikramSambatCalendar.nepaliDate(from: makeGregorianDate(year: year, month: month, day: day)))
            }
            errorMessage = nil
        } catch {
            result = nil
            errorMessage = error.localizedDescription
        }
    }

    func swap() {
        guard let result else { return }
        switch result {
        case .gregorian(let date):
            let components = gregorianComponents(for: date)
            guard let year = components.year, let month = components.month, let day = components.day else { return }
            mode = .adToBS
            assign(year: year, month: month, day: day)
        case .nepali(let date):
            mode = .bsToAD
            assign(year: date.year, month: date.month, day: date.day)
        }
        convert()
    }

    func setToday() {
        switch mode {
        case .bsToAD:
            let nepaliDate = (try? BikramSambatCalendar.nepaliDate(from: .now)) ?? NepaliDate(year: 2083, month: 4, day: 30)
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
