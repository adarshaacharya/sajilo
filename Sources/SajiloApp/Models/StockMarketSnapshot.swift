import Foundation

/// One row from ShareSansar's public price table.
///
/// The table ships twenty-four columns for every listed company, and the whole
/// thing arrives in a single request Sajilo already makes. So the full row is
/// kept rather than the six fields the summary happens to show: searching,
/// opening a company, and reading its day then cost no further network at all.
struct StockQuote: Codable, Equatable, Sendable, Identifiable {
    let symbol: String
    let companyName: String?

    let ltp: Double
    let previousClose: Double
    let change: Double
    let changePercent: Double

    let open: Double?
    let high: Double?
    let low: Double?
    let close: Double?
    /// Volume-weighted average price — what the day actually traded at, as
    /// opposed to where it happened to stop.
    let vwap: Double?
    let volume: Double?
    let turnover: Double
    let transactions: Double?
    let week52High: Double?
    let week52Low: Double?
    let average120Day: Double?
    let average180Day: Double?

    var id: String { symbol }
    var companyURL: URL { URL(string: "https://www.sharesansar.com/company/\(symbol.lowercased())")! }

    var isUp: Bool { change > 0 }
    var isFlat: Bool { abs(change) < 0.005 }

    var ltpText: String { "Rs \(NepaliNumberFormatter.grouped(ltp, fractionDigits: 2))" }

    var changeText: String {
        let sign = change > 0 ? "+" : ""
        return "\(sign)\(NepaliNumberFormatter.grouped(change, fractionDigits: 2)) (\(sign)\(String(format: "%.2f", changePercent))%)"
    }

    var percentText: String {
        let sign = change > 0 ? "+" : ""
        return "\(sign)\(String(format: "%.2f", changePercent))%"
    }

    /// Where the last price sits between the 52-week low and high, 0...1.
    ///
    /// One number that answers "is this near its top or its bottom" without
    /// the reader comparing three figures themselves. Absent when the range is
    /// missing or degenerate, rather than defaulting to the middle and implying
    /// something untrue.
    var week52Position: Double? {
        guard let high = week52High, let low = week52Low, high > low else { return nil }
        return min(max((ltp - low) / (high - low), 0), 1)
    }

    func matches(_ query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return true }
        return symbol.localizedCaseInsensitiveContains(trimmed)
            || (companyName?.localizedCaseInsensitiveContains(trimmed) ?? false)
    }
}

/// NEPSE itself or one of its sector sub-indices — the same shape either way.
struct MarketIndex: Codable, Equatable, Sendable, Identifiable {
    let name: String
    let value: Double
    let change: Double
    let changePercent: Double
    let turnover: Double

    var id: String { name }
    var isUp: Bool { change > 0 }
    var isFlat: Bool { abs(change) < 0.005 }

    var valueText: String { NepaliNumberFormatter.grouped(value, fractionDigits: 2) }

    var changeText: String {
        let sign = change > 0 ? "+" : ""
        return "\(sign)\(NepaliNumberFormatter.grouped(change, fractionDigits: 2)) (\(sign)\(String(format: "%.2f", changePercent))%)"
    }

    var percentText: String {
        let sign = change > 0 ? "+" : ""
        return "\(sign)\(String(format: "%.2f", changePercent))%"
    }
}

/// A row from one of the market page's four leaderboards.
struct MarketMover: Codable, Equatable, Sendable, Identifiable {
    enum Board: String, Codable, Equatable, Sendable, CaseIterable, Identifiable {
        case gainers, losers, turnover, volume
        var id: String { rawValue }

        var title: LocalizedStringResource {
            switch self {
            case .gainers: L10n.stocksGainers
            case .losers: L10n.stocksLosers
            case .turnover: L10n.stocksTurnover
            case .volume: L10n.stocksVolume
            }
        }
    }

    let board: Board
    let symbol: String
    let ltp: Double
    /// Percent for gainers and losers; rupees or shares for the other two.
    let metric: Double

    var id: String { "\(board.rawValue).\(symbol)" }

    var metricText: String {
        switch board {
        case .gainers, .losers:
            let sign = metric > 0 ? "+" : ""
            return "\(sign)\(String(format: "%.2f", metric))%"
        case .turnover:
            return "Rs \(NepaliNumberFormatter.grouped(metric, fractionDigits: 0))"
        case .volume:
            return NepaliNumberFormatter.grouped(metric, fractionDigits: 0)
        }
    }
}

struct StockMarketSnapshot: Codable, Equatable, Sendable {
    let nepse: MarketIndex?
    /// Banking, Hydropower, Microfinance and the rest — where the day's move
    /// actually happened, which the headline index alone never says.
    var subIndices: [MarketIndex] = []
    var movers: [MarketMover] = []
    let quotes: [StockQuote]
    let publishedOn: Date?
    let fetchedAt: Date

    func quote(symbol: String) -> StockQuote? {
        quotes.first { $0.symbol.caseInsensitiveCompare(symbol) == .orderedSame }
    }

    func movers(_ board: MarketMover.Board) -> [MarketMover] {
        movers.filter { $0.board == board }
    }

    /// Symbol matches first, then company-name matches, so typing "NABIL"
    /// surfaces NABIL before every company with "Nabil" in its name.
    func search(_ query: String) -> [StockQuote] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        let matches = quotes.filter { $0.matches(trimmed) }
        return matches.sorted { left, right in
            let leftSymbol = left.symbol.localizedCaseInsensitiveContains(trimmed)
            let rightSymbol = right.symbol.localizedCaseInsensitiveContains(trimmed)
            if leftSymbol != rightSymbol { return leftSymbol }
            return left.symbol < right.symbol
        }
    }
}
