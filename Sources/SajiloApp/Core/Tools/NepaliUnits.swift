import Foundation

/// Weight units used for gold and silver in Nepal.
enum WeightUnit: String, CaseIterable, Identifiable, Sendable {
    case tola
    case gram
    case tenGram
    case ounce

    var id: String { rawValue }

    /// One of this unit, in grams.
    ///
    /// The tola is 3/8 of a troy ounce exactly — 11.6638038 g. Nepali jewellers
    /// quote 11.664 g; the exact value is kept here so a large quantity does
    /// not drift, and rounding happens once at display.
    var grams: Double {
        switch self {
        case .tola: 11.663_803_8
        case .gram: 1
        case .tenGram: 10
        case .ounce: 31.103_476_8   // troy ounce, the unit bullion is priced in
        }
    }

    var displayName: String {
        switch self {
        case .tola: "Tola"
        case .gram: "Gram"
        case .tenGram: "10 g"
        case .ounce: "Troy ounce"
        }
    }

    var nepaliName: String {
        switch self {
        case .tola: "तोला"
        case .gram: "ग्राम"
        case .tenGram: "१० ग्राम"
        case .ounce: "ट्रोय औंस"
        }
    }
}

enum WeightConverter {
    static func convert(_ value: Double, from source: WeightUnit, to target: WeightUnit) -> Double {
        value * source.grams / target.grams
    }
}

/// Nepal's VAT and the simple-interest formula, both of which people work out
/// on a phone calculator several times a week.
enum FinanceCalculator {
    /// Nepal's standard VAT rate.
    static let vatRate = 0.13

    struct VATBreakdown: Equatable, Sendable {
        let base: Double
        let vat: Double
        let total: Double
    }

    /// A price quoted *before* VAT.
    static func addingVAT(to base: Double, rate: Double = vatRate) -> VATBreakdown {
        let vat = base * rate
        return VATBreakdown(base: base, vat: vat, total: base + vat)
    }

    /// A price that already includes VAT.
    ///
    /// Not `total × 0.13` — that is the common mistake and overstates the tax.
    /// The base is `total / 1.13`, and the VAT is what remains.
    static func removingVAT(from total: Double, rate: Double = vatRate) -> VATBreakdown {
        let base = total / (1 + rate)
        return VATBreakdown(base: base, vat: total - base, total: total)
    }

    struct InterestResult: Equatable, Sendable {
        let principal: Double
        let interest: Double
        let total: Double
    }

    /// Simple interest: `P × R × T / 100`, with the rate as a percent per year.
    static func simpleInterest(principal: Double, annualRatePercent: Double, years: Double) -> InterestResult {
        let interest = principal * annualRatePercent * years / 100
        return InterestResult(principal: principal, interest: interest, total: principal + interest)
    }
}

/// South Asian digit grouping — thousand, then lakh, then crore.
///
/// `NumberFormatter` cannot do this: its grouping is uniformly three digits, so
/// 1,25,00,000 comes out as 12,500,000. The difference matters because rates,
/// budgets and property prices in Nepal are all read in lakh and crore.
enum NepaliNumberFormatter {
    static func grouped(_ value: Int) -> String {
        let negative = value < 0
        let digits = String(abs(value))
        guard digits.count > 3 else { return (negative ? "-" : "") + digits }

        // The last three digits stay together; everything above them is split
        // into pairs, which is what produces lakh and crore.
        let tail = String(digits.suffix(3))
        var head = Array(String(digits.dropLast(3)))
        var groups: [String] = []
        while head.count > 2 {
            groups.insert(String(head.suffix(2)), at: 0)
            head.removeLast(2)
        }
        if !head.isEmpty { groups.insert(String(head), at: 0) }

        return (negative ? "-" : "") + (groups + [tail]).joined(separator: ",")
    }

    /// Market feeds publish prices to two decimal places. Keep that precision:
    /// a quoted LTP of 722.90 must never become the materially different 723.
    static func grouped(_ value: Double, fractionDigits: Int) -> String {
        let formatted = String(format: "%.*f", locale: Locale(identifier: "en_US_POSIX"), fractionDigits, value)
        let pieces = formatted.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let whole = Int(pieces[0]) else { return formatted }
        let integer = grouped(whole)
        guard fractionDigits > 0, pieces.count == 2 else { return integer }
        return "\(integer).\(pieces[1])"
    }

    /// "1 crore 25 lakh" — how the figure is actually said aloud.
    static func scaleDescription(_ value: Int) -> String? {
        let magnitude = abs(value)
        guard magnitude >= 100_000 else { return nil }

        let crore = magnitude / 10_000_000
        let lakh = (magnitude % 10_000_000) / 100_000
        var parts: [String] = []
        if crore > 0 { parts.append("\(crore) crore") }
        if lakh > 0 { parts.append("\(lakh) lakh") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }
}
