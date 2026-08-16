import Foundation

/// One currency's buy/sell rate as published by Nepal Rastra Bank.
struct ForexRate: Codable, Equatable, Sendable, Identifiable {
    let currencyCode: String
    let currencyName: String
    /// How many units of the currency the quote covers. NRB quotes INR per
    /// 100, JPY per 10 and KRW per 100; treating those as per-1 misprices them
    /// by two orders of magnitude.
    let unit: Int
    /// NPR paid for `unit` of this currency.
    let buy: Double
    /// NPR charged for `unit` of this currency.
    let sell: Double

    var id: String { currencyCode }

    var buyPerUnit: Double { unit > 0 ? buy / Double(unit) : buy }
    var sellPerUnit: Double { unit > 0 ? sell / Double(unit) : sell }

    /// "USD" or "JPY (per 10)", so a quote is never silently per-something-else.
    var unitLabel: String {
        unit == 1 ? currencyCode : "\(currencyCode) (per \(unit))"
    }

    var buyText: String { Self.amount(buy) }
    var sellText: String { Self.amount(sell) }

    /// NPR for a given amount of this currency, at the bank's buy rate.
    func npr(forAmount amount: Double) -> Double {
        amount * buyPerUnit
    }

    /// How much of this currency a given number of rupees buys, at the sell
    /// rate — the direction a customer actually pays.
    func amount(forNPR rupees: Double) -> Double {
        sellPerUnit > 0 ? rupees / sellPerUnit : 0
    }

    static func amount(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }
}

struct ForexSnapshot: Codable, Equatable, Sendable {
    let rates: [ForexRate]
    /// The date the rates apply to.
    let date: Date
    /// NRB's own publish and revise timestamps. PRD §5.5 requires showing the
    /// source's published time rather than only when Sajilo fetched it.
    let publishedOn: Date?
    let modifiedOn: Date?
    let fetchedAt: Date

    func rate(for currencyCode: String) -> ForexRate? {
        rates.first { $0.currencyCode == currencyCode }
    }

    func rates(for codes: [String]) -> [ForexRate] {
        codes.compactMap { rate(for: $0) }
    }

    /// The most recent timestamp the source gives.
    ///
    /// Not simply "modified, else published": NRB's `modified_on` can predate
    /// `published_on` — the 16 Aug rates carry a 14 Aug modification — so
    /// preferring it outright would show a two-day-old time against today's
    /// rates. Whichever is later is the honest answer.
    var sourceTimestamp: Date {
        [publishedOn, modifiedOn].compactMap { $0 }.max() ?? date
    }
}

enum ForexCurrency {
    /// PRD §5.5 default favourites.
    static let defaultFavourites = ["USD", "AUD", "GBP", "EUR", "JPY"]

    /// Offered in Settings. NRB publishes 22; these are the ones worth a
    /// toggle rather than a wall of switches.
    static let selectable = ["USD", "EUR", "GBP", "AUD", "JPY", "INR", "CAD", "AED", "QAR", "SAR", "KRW", "MYR"]

    static func name(for code: String) -> String {
        switch code {
        case "USD": "US Dollar"
        case "EUR": "Euro"
        case "GBP": "Pound Sterling"
        case "AUD": "Australian Dollar"
        case "JPY": "Japanese Yen"
        case "INR": "Indian Rupee"
        case "CAD": "Canadian Dollar"
        case "AED": "UAE Dirham"
        case "QAR": "Qatari Riyal"
        case "SAR": "Saudi Riyal"
        case "KRW": "Korean Won"
        case "MYR": "Malaysian Ringgit"
        default: code
        }
    }
}
