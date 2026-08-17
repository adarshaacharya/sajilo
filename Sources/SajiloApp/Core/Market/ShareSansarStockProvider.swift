import Foundation

protocol StockMarketProviding: Sendable {
    func latestMarket() async throws -> StockMarketSnapshot
}

/// Reads ShareSansar's public, server-rendered market and price tables. A
/// single price-table request supplies every watched symbol, rather than
/// requesting individual company pages as the watchlist grows.
struct ShareSansarStockProvider: StockMarketProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    private static let marketURL = URL(string: "https://www.sharesansar.com/index.php/market")!
    private static let pricesURL = URL(string: "https://www.sharesansar.com/index.php/today-share-price")!

    func latestMarket() async throws -> StockMarketSnapshot {
        async let marketHTML = fetch(Self.marketURL)
        async let pricesHTML = fetch(Self.pricesURL)
        let (market, prices) = try await (marketHTML, pricesHTML)
        return try Self.parse(marketHTML: market, pricesHTML: prices, fetchedAt: .now)
    }

    private func fetch(_ url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Sajilo/1.0", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode,
              let html = String(data: data, encoding: .utf8) else {
            throw StockMarketProviderError.invalidResponse
        }
        return html
    }

    static func parse(marketHTML: String, pricesHTML: String, fetchedAt: Date) throws -> StockMarketSnapshot {
        let quotes = try quotes(in: pricesHTML)
        let indices = indices(in: marketHTML)
        return StockMarketSnapshot(
            nepse: indices.first { $0.name.localizedCaseInsensitiveContains("NEPSE") },
            subIndices: subIndices(in: marketHTML),
            movers: movers(in: marketHTML),
            quotes: quotes,
            publishedOn: publishedDate(in: pricesHTML) ?? publishedDate(in: marketHTML),
            fetchedAt: fetchedAt
        )
    }

    static func quotes(in html: String) throws -> [StockQuote] {
        guard let table = HTMLTable.allTableRows(in: html).first(where: { rows in
            rows.first?.contains("Symbol") == true && rows.first?.contains("LTP") == true
        }) else { throw StockMarketProviderError.tableNotFound }

        let companyNames = companyNames(in: html)
        let quotes = table.dropFirst().compactMap { row -> StockQuote? in
            // S.No, Symbol, Conf., Open, High, Low, Close, LTP, Close-LTP,
            // Close-LTP %, VWAP, Vol, Prev. Close, Turnover, Trans., Diff,
            // Range, Diff %, Range %, VWAP %, 120 Days, 180 Days,
            // 52 Weeks High, 52 Weeks Low.
            guard row.count >= 18,
                  let ltp = number(row[7]),
                  let previousClose = number(row[12]),
                  let turnover = number(row[13]),
                  let change = number(row[15]),
                  let changePercent = number(row[17]) else { return nil }
            let symbol = row[1].trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            guard !symbol.isEmpty else { return nil }

            // The trailing columns are read where present and left nil where
            // not, so a narrower table still yields a usable quote rather than
            // dropping the row.
            func optional(_ index: Int) -> Double? {
                index < row.count ? number(row[index]) : nil
            }

            return StockQuote(
                symbol: symbol,
                companyName: companyNames[symbol],
                ltp: ltp,
                previousClose: previousClose,
                change: change,
                changePercent: changePercent,
                open: optional(3),
                high: optional(4),
                low: optional(5),
                close: optional(6),
                vwap: optional(10),
                volume: optional(11),
                turnover: turnover,
                transactions: optional(14),
                week52High: optional(22),
                week52Low: optional(23),
                average120Day: optional(20),
                average180Day: optional(21)
            )
        }
        guard !quotes.isEmpty else { throw StockMarketProviderError.tableNotFound }
        return quotes
    }

    /// The headline indices — NEPSE and its siblings — share a table shape with
    /// the sector sub-indices, so one reader serves both.
    static func indices(in html: String) -> [MarketIndex] {
        parseIndexTable(in: html, headingContains: "Index")
    }

    /// Banking, Hydropower, Microfinance and the rest. The headline index says
    /// the market moved; these say where.
    static func subIndices(in html: String) -> [MarketIndex] {
        parseIndexTable(in: html, headingContains: "Sub Index")
    }

    private static func parseIndexTable(in html: String, headingContains heading: String) -> [MarketIndex] {
        guard let table = HTMLTable.allTableRows(in: html).first(where: { rows in
            guard let header = rows.first else { return false }
            return header.contains(where: { $0.trimmingCharacters(in: .whitespaces) == heading })
                && header.contains { $0.contains("Point") }
        }) else { return [] }

        return table.dropFirst().compactMap { row in
            // Name, Open, High, Low, Close, Point, % Change, Turnover.
            guard row.count >= 8 else { return nil }
            let name = row[0].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty,
                  let value = number(row[4]), let change = number(row[5]),
                  let percent = number(row[6]), let turnover = number(row[7]) else { return nil }
            return MarketIndex(
                name: name,
                value: value,
                change: change,
                changePercent: percent,
                turnover: turnover
            )
        }
    }

    /// The four leaderboards.
    ///
    /// Two traps here, both found by running this against the live page.
    /// Gainers and losers are *separate* tables with byte-identical headers —
    /// matching on the header alone finds the gainers twice and leaves losers
    /// empty — so they are taken in document order. And the two money tables
    /// put their metric first and the price second, the opposite of the
    /// percent tables, so every column index is stated rather than assumed.
    static func movers(in html: String) -> [MarketMover] {
        let tables = HTMLTable.allTableRows(in: html)

        func rows(matching heading: String) -> [[[String]]] {
            tables.filter { table in
                guard let header = table.first, header.count >= 3 else { return false }
                return header[0].trimmingCharacters(in: .whitespaces) == "Symbol"
                    && header.contains { $0.localizedCaseInsensitiveContains(heading) }
            }
        }

        func parse(_ table: [[String]], board: MarketMover.Board, ltp: Int, metric: Int) -> [MarketMover] {
            table.dropFirst().compactMap { row in
                guard row.count > max(ltp, metric) else { return nil }
                let symbol = row[0].trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                guard !symbol.isEmpty, let metricValue = number(row[metric]) else { return nil }
                return MarketMover(
                    board: board,
                    symbol: symbol,
                    ltp: number(row[ltp]) ?? 0,
                    metric: metricValue
                )
            }
        }

        // Symbol, LTP(Rs), Point Change, % Change — gainers first, then losers.
        let byPercent = rows(matching: "% Change")
        var movers: [MarketMover] = []
        if let gainers = byPercent.first {
            movers += parse(gainers, board: .gainers, ltp: 1, metric: 3)
        }
        if byPercent.count > 1 {
            movers += parse(byPercent[1], board: .losers, ltp: 1, metric: 3)
        }

        // Symbol, TurnOvers(Rs), Ltp(Rs) — and the same shape for Volume.
        if let turnover = rows(matching: "TurnOver").first {
            movers += parse(turnover, board: .turnover, ltp: 2, metric: 1)
        }
        if let volume = rows(matching: "Volume").first {
            movers += parse(volume, board: .volume, ltp: 2, metric: 1)
        }
        return movers
    }

    static func number(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// The page embeds its search directory as a JSON array. Reading names
    /// from that already-downloaded directory avoids one company-page request
    /// per watched ticker and keeps all watchlist rows from the same session.
    static func companyNames(in html: String) -> [String: String] {
        guard let marker = html.range(of: "var cmpjson ="),
              let start = html[marker.upperBound...].firstIndex(of: "["),
              let end = html[start...].range(of: "];"),
              let data = String(html[start...end.lowerBound]).data(using: .utf8),
              let records = try? JSONDecoder().decode([CompanyRecord].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: records.map { ($0.symbol.uppercased(), $0.companyname) })
    }

    static func publishedDate(in html: String) -> Date? {
        let pattern = #"\b20\d{2}-\d{2}-\d{2}\b"#
        guard let range = html.range(of: pattern, options: .regularExpression) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(html[range]))
    }

    private struct CompanyRecord: Decodable {
        let symbol: String
        let companyname: String
    }
}

enum StockMarketProviderError: Error, Equatable {
    case invalidResponse
    case tableNotFound
}
