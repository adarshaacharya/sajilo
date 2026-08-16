import SwiftUI

/// Which digits Bikram Sambat dates are drawn with (PRD §5.10).
///
/// Not a translation setting: the month and weekday names stay Devanagari
/// either way. Plenty of Nepali readers — diaspora users especially — parse
/// `31` faster than `३१`, and the calendar grid is the one place that
/// difference is felt on every glance.
enum NumeralStyle: String, CaseIterable, Identifiable, Sendable {
    case devanagari
    case latin

    static let `default` = NumeralStyle.devanagari

    var id: String { rawValue }

    var displayName: LocalizedStringResource {
        switch self {
        case .devanagari: L10n.numeralsDevanagari
        case .latin: L10n.numeralsLatin
        }
    }

    /// A live sample, so the Settings picker previews itself.
    var sample: String {
        string(from: 2083)
    }

    func string(from value: Int, paddedTo length: Int? = nil) -> String {
        switch self {
        case .devanagari:
            NepaliNumerals.string(from: value, paddedTo: length)
        case .latin:
            length.map { String(format: "%0\($0)d", value) } ?? String(value)
        }
    }

    /// `2083/04/31` in the chosen digits.
    func slashedDate(_ date: NepaliDate) -> String {
        "\(string(from: date.year))/\(string(from: date.month, paddedTo: 2))/\(string(from: date.day, paddedTo: 2))"
    }
}

extension EnvironmentValues {
    /// Injected once at the popover root rather than threaded through every
    /// view, since almost every surface renders a date.
    @Entry var numeralStyle: NumeralStyle = .default
}
