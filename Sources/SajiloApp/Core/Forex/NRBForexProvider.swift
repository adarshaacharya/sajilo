import Foundation

protocol ForexProviding: Sendable {
    func latestRates() async throws -> ForexSnapshot
}

/// Nepal Rastra Bank's published rates — the official source, which is why
/// PRD §5.5 names it rather than an aggregator.
struct NRBForexProvider: ForexProviding {
    private let session: URLSession
    private let today: @Sendable () -> Date

    init(session: URLSession? = nil, today: @escaping @Sendable () -> Date = { .now }) {
        self.session = session ?? .sajilo()
        self.today = today
    }


    func latestRates() async throws -> ForexSnapshot {
        // A window rather than a single day: NRB does not publish on every
        // date, and asking for just today would return an empty payload on
        // those days instead of the rates still in force.
        let end = today()
        let start = end.addingTimeInterval(-Self.lookbackDays * 24 * 60 * 60)

        var components = URLComponents(string: "https://www.nrb.org.np/api/forex/v1/rates")!
        components.queryItems = [
            URLQueryItem(name: "page", value: "1"),
            URLQueryItem(name: "per_page", value: "100"),
            URLQueryItem(name: "from", value: Self.dayFormatter.string(from: start)),
            URLQueryItem(name: "to", value: Self.dayFormatter.string(from: end))
        ]

        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, 200..<300 ~= response.statusCode else {
            throw ForexProviderError.invalidResponse
        }
        return try Self.decode(data, fetchedAt: .now)
    }

    private static let lookbackDays: TimeInterval = 7

    static func decode(_ data: Data, fetchedAt: Date) throws -> ForexSnapshot {
        let response = try JSONDecoder().decode(Response.self, from: data)

        // The payload is ascending, so the last entry is the most recent set of
        // rates in force.
        let entries = response.data.payload.compactMap { entry -> (Day, Date)? in
            guard let date = dayFormatter.date(from: entry.date) else { return nil }
            return (entry, date)
        }
        guard let (entry, date) = entries.max(by: { $0.1 < $1.1 }) else {
            throw ForexProviderError.noRatesPublished
        }

        let rates: [ForexRate] = entry.rates.compactMap { rate in
            guard let buy = Double(rate.buy), let sell = Double(rate.sell) else { return nil }
            return ForexRate(
                currencyCode: rate.currency.iso3,
                currencyName: rate.currency.name,
                unit: max(1, rate.currency.unit),
                buy: buy,
                sell: sell
            )
        }
        guard !rates.isEmpty else { throw ForexProviderError.noRatesPublished }

        return ForexSnapshot(
            rates: rates,
            date: date,
            publishedOn: entry.publishedOn.flatMap(timestampFormatter.date(from:)),
            modifiedOn: entry.modifiedOn.flatMap(timestampFormatter.date(from:)),
            fetchedAt: fetchedAt
        )
    }

    private static let dayFormatter = NepalTime.formatter("yyyy-MM-dd")
    private static let timestampFormatter = NepalTime.formatter("yyyy-MM-dd HH:mm:ss")

    // MARK: - Payload

    private struct Response: Decodable {
        let data: Payload
    }

    private struct Payload: Decodable {
        let payload: [Day]
    }

    private struct Day: Decodable {
        let date: String
        let publishedOn: String?
        let modifiedOn: String?
        let rates: [Rate]

        enum CodingKeys: String, CodingKey {
            case date
            case publishedOn = "published_on"
            case modifiedOn = "modified_on"
            case rates
        }
    }

    private struct Rate: Decodable {
        let currency: Currency
        let buy: String
        let sell: String
    }

    private struct Currency: Decodable {
        let iso3: String
        let name: String
        let unit: Int
    }
}

enum ForexProviderError: Error, Equatable {
    case invalidResponse
    /// NRB returned a well-formed response with nothing in force for the
    /// requested window.
    case noRatesPublished
}
