import Foundation

/// PRD §5.6 asks for the provider to sit behind a protocol so the source can be
/// replaced without touching the UI.
protocol MetalRateProviding: Sendable {
    func latestRates() async throws -> MetalRateSnapshot
}

/// The Federation of Nepal Gold and Silver Dealers' Association — the body that
/// actually sets the daily rate Nepali jewellers quote.
///
/// Their website is a JavaScript app, so a plain HTML fetch returns an empty
/// 864-byte shell. The rates come from a public, unauthenticated JSON API on a
/// separate host, which is what this reads: a documented endpoint rather than a
/// scrape of rendered markup.
struct FenegosidaMetalProvider: MetalRateProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    private static let host = "https://api.fenegosida.org/api/website/v1"

    func latestRates() async throws -> MetalRateSnapshot {
        // History is a nice-to-have; today's rate is not. Fetched alongside so
        // a failing chart endpoint costs the sparkline and nothing else.
        async let history = fetchGoldHistory()

        guard let url = URL(string: "\(Self.host)/Dashboard/today") else {
            throw MetalProviderError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw MetalProviderError.invalidResponse
        }

        var snapshot = try Self.decode(data, fetchedAt: .now)
        snapshot.goldHistory = await history
        return snapshot
    }

    static func decode(_ data: Data, fetchedAt: Date) throws -> MetalRateSnapshot {
        let entries = try JSONDecoder().decode([Entry].self, from: data)

        let rates = entries.compactMap { entry -> MetalRate? in
            guard let metal = Self.metal(from: entry.rateType),
                  let unit = Self.unit(from: entry.rateType) else {
                return nil
            }
            return MetalRate(
                metal: metal,
                unit: unit,
                price: entry.todayBaseRatePerGram,
                previousPrice: entry.yestardayBaseRatePerGram
            )
        }
        guard !rates.isEmpty else { throw MetalProviderError.noRatesPublished }

        return MetalRateSnapshot(
            rates: rates,
            publishedAt: entries.compactMap { Self.timestamp(from: $0.todayDate) }.max() ?? fetchedAt,
            fetchedAt: fetchedAt
        )
    }

    /// `rateType` is free Nepali text — "छापावाल सुन (१ तोला)" — so the metal and
    /// the unit are read out of it. Matching on substrings rather than exact
    /// equality means a spacing or punctuation change upstream does not drop
    /// the row entirely.
    static func metal(from rateType: String) -> Metal? {
        if rateType.contains("चाँदी") { return .silver }
        if rateType.contains("तेजाबी") { return .tejabiGold }
        if rateType.contains("सुन") { return .fineGold }
        return nil
    }

    static func unit(from rateType: String) -> MetalUnit? {
        // Check grams first: "१० ग्राम" also contains no tola marker, but being
        // explicit avoids depending on that staying true.
        if rateType.contains("ग्राम") { return .tenGram }
        if rateType.contains("तोला") { return .tola }
        return nil
    }

    private func fetchGoldHistory() async -> [Double] {
        guard let url = URL(string: "\(Self.host)/Dashboard/WeeklyChartRate?weekmonthyear=7"),
              let (data, response) = try? await session.data(from: url),
              let http = response as? HTTPURLResponse,
              200..<300 ~= http.statusCode else {
            return []
        }
        return Self.decodeHistory(data)
    }

    static func decodeHistory(_ data: Data) -> [Double] {
        guard let chart = try? JSONDecoder().decode(Chart.self, from: data) else { return [] }
        return chart.goldData.compactMap(\.tola)
    }

    private static func timestamp(from raw: String) -> Date? {
        // ISO8601DateFormatter is mutable and not Sendable. This provider can
        // run off the main actor, so use short-lived formatters rather than
        // sharing one static instance across concurrent requests.
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }

        return ISO8601DateFormatter().date(from: raw)
    }

    // MARK: - Payload

    private struct Entry: Decodable {
        let todayDate: String
        let rateType: String
        /// Named "PerGram" upstream but quoted per the unit in `rateType`.
        let todayBaseRatePerGram: Double
        /// Upstream spelling, kept verbatim so decoding does not silently fail.
        let yestardayBaseRatePerGram: Double
    }

    private struct Chart: Decodable {
        let goldData: [Point]

        struct Point: Decodable {
            let tola: Double?
        }
    }
}

enum MetalProviderError: Error, Equatable {
    case invalidResponse
    case noRatesPublished
}
