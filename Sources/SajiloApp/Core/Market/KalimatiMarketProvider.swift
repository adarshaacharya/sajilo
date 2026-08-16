import Foundation

protocol VegetableMarketProviding: Sendable {
    func latestPrices() async throws -> VegetableMarketSnapshot
}

/// The Kalimati Fruits and Vegetable Market Development Board — the government
/// body that runs Nepal's largest wholesale produce market and publishes the
/// rates the morning papers quote.
///
/// Like Nepal Oil Corporation, the board offers no API, only a server-rendered
/// table, so this reads the same `HTMLTable` both providers share. Two things
/// about the page shape the parser:
///
/// - Prices are printed in **Devanagari numerals** with a currency prefix and
///   thousands separators: `रू १,०००.००`.
/// - The table dates itself in **Bikram Sambat** in a heading above it, not in
///   any cell, so the date is read from the surrounding page.
struct KalimatiMarketProvider: VegetableMarketProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    private static let endpoint = URL(string: "https://kalimatimarket.gov.np/price")!

    func latestPrices() async throws -> VegetableMarketSnapshot {
        let (data, response) = try await session.data(from: Self.endpoint)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw MarketProviderError.invalidResponse
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw MarketProviderError.invalidResponse
        }
        return try Self.parse(html, fetchedAt: .now)
    }

    static func parse(_ html: String, fetchedAt: Date) throws -> VegetableMarketSnapshot {
        let rows = HTMLTable.firstTableRows(in: html)
        guard rows.count >= 2 else { throw MarketProviderError.tableNotFound }

        let prices = rows.dropFirst().compactMap(price(from:))
        guard !prices.isEmpty else { throw MarketProviderError.tableNotFound }

        return VegetableMarketSnapshot(
            prices: prices,
            publishedOn: publishedDate(in: html),
            fetchedAt: fetchedAt
        )
    }

    /// Columns are `कृषि उपज | ईकाइ | न्यूनतम | अधिकतम | औसत`. Unlike NOC's
    /// table these headings are not machine-friendly labels and the board has
    /// kept the same five for years, so position is used — but a row that does
    /// not yield a name, a unit, and an average is dropped rather than guessed
    /// at, which is what would catch a reordering.
    private static func price(from row: [String]) -> VegetablePrice? {
        guard row.count >= 5 else { return nil }

        let name = row[0].trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty,
              let unit = MarketUnit.parse(row[1]),
              let minimum = amount(row[2]),
              let maximum = amount(row[3]),
              let average = amount(row[4]) else {
            return nil
        }

        return VegetablePrice(
            name: name,
            unit: unit,
            minimum: minimum,
            maximum: maximum,
            average: average
        )
    }

    /// `रू १,०००.००` → 1000. The digits arrive in Devanagari, so they are
    /// transliterated before anything tries to read them as a number.
    static func amount(_ raw: String) -> Double? {
        let latin = NepaliNumerals.arabicString(from: raw)
        let digits = latin.filter { $0.isNumber || $0 == "." }
        guard let value = Double(digits), value > 0 else { return nil }
        return value
    }

    /// The board stamps the table with a heading like
    /// `- वि.सं. साउन ३१, २०८३`. Read out of the page rather than assumed to be
    /// today: the board does not publish on every holiday, so the rates on
    /// screen are sometimes the previous trading day's and should say so.
    static func publishedDate(in html: String) -> NepaliDate? {
        guard let marker = html.range(of: "वि.सं.") else { return nil }

        // Enough of the page to cover the date and nothing beyond it.
        let window = html[marker.upperBound...].prefix(60)
        let latin = NepaliNumerals.arabicString(from: String(window))

        guard let month = NepaliMonth.allCases.first(where: { window.contains($0.nepaliName) }) else {
            return nil
        }

        let numbers = latin
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
        // Day then year, in that order: "साउन ३१, २०८३".
        guard numbers.count >= 2 else { return nil }
        let day = numbers[0]
        let year = numbers[1]
        guard 1...32 ~= day, BikramSambatCalendar.supportedNepaliYears.contains(year) else {
            return nil
        }

        return NepaliDate(year: year, month: month.rawValue, day: day)
    }
}

enum MarketProviderError: Error, Equatable {
    case invalidResponse
    case tableNotFound
}
