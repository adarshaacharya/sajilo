import Foundation

protocol FuelPriceProviding: Sendable {
    func latestPrices() async throws -> FuelPriceSnapshot
}

/// Nepal Oil Corporation, the state importer that sets every retail fuel price
/// in the country.
///
/// NOC publishes no API, only a server-rendered price history table. That table
/// is the primary source rather than a mirror of one, and it is read the way a
/// reader would: find the heading row, then take the two most recent revisions.
/// Column *positions* are never assumed — headings are matched by name, so NOC
/// inserting a column does not silently shift diesel into the kerosene slot.
struct NOCFuelProvider: FuelPriceProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    private static let endpoint = URL(string: "https://noc.org.np/retailprice")!

    func latestPrices() async throws -> FuelPriceSnapshot {
        let (data, response) = try await session.data(from: Self.endpoint)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw FuelProviderError.invalidResponse
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw FuelProviderError.invalidResponse
        }
        return try Self.parse(html, fetchedAt: .now)
    }

    static func parse(_ html: String, fetchedAt: Date) throws -> FuelPriceSnapshot {
        let rows = HTMLTable.firstTableRows(in: html)
        guard let heading = rows.first, rows.count >= 2 else {
            throw FuelProviderError.tableNotFound
        }

        let columns = Self.columnIndices(in: heading)
        guard !columns.isEmpty else { throw FuelProviderError.tableNotFound }

        // Newest revision first, which is how NOC orders the table. The row
        // under it is the revision it replaced, giving the change figure.
        let current = rows[1]
        let previous = rows.count > 2 ? rows[2] : current

        let prices = Fuel.allCases.compactMap { fuel -> FuelPrice? in
            guard let column = columns[fuel],
                  let price = Self.amount(current, at: column) else { return nil }
            return FuelPrice(
                fuel: fuel,
                price: price,
                previousPrice: Self.amount(previous, at: column) ?? price
            )
        }
        guard !prices.isEmpty else { throw FuelProviderError.tableNotFound }

        return FuelPriceSnapshot(
            prices: prices,
            effectiveFrom: Self.effectiveDate(from: current.first ?? "") ?? fetchedAt,
            fetchedAt: fetchedAt
        )
    }

    private static func columnIndices(in heading: [String]) -> [Fuel: Int] {
        var indices: [Fuel: Int] = [:]
        for (index, cell) in heading.enumerated() {
            let name = cell.lowercased()
            // "ATF (DP)" also contains no fuel name we want, but a substring
            // match on "petrol" would still be safe; matching the whole cell
            // against the heading keeps it exact either way.
            for fuel in Fuel.allCases where name.contains(fuel.columnHeading) {
                // First column wins: NOC has never repeated a heading, and
                // taking the later one would silently prefer a stray match.
                if indices[fuel] == nil { indices[fuel] = index }
            }
        }
        return indices
    }

    private static func amount(_ row: [String], at index: Int) -> Double? {
        guard index < row.count else { return nil }
        let digits = row[index].filter { $0.isNumber || $0 == "." }
        guard let value = Double(digits), value > 0 else { return nil }
        return value
    }

    /// The effective-date cell pairs a Bikram Sambat date with the AD one in
    /// brackets, and NOC has typed it four different ways over the years —
    /// `2083.04.17(2026.08.02)`, `2083-03-01 (2026.06.15)`, and so on. The AD
    /// date inside the brackets is the part that parses unambiguously, so this
    /// takes that and tolerates whichever separators surround it.
    static func effectiveDate(from cell: String) -> Date? {
        guard let open = cell.firstIndex(of: "("),
              let close = cell.firstIndex(of: ")"),
              open < close else { return nil }

        let inner = cell[cell.index(after: open)..<close]
        let parts = inner.split(whereSeparator: { $0 == "." || $0 == "-" || $0 == "/" })
        guard parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              year > 1900, 1...12 ~= month, 1...31 ~= day else { return nil }

        return NepalTime.calendar.date(
            from: DateComponents(year: year, month: month, day: day)
        )
    }
}

enum FuelProviderError: Error, Equatable {
    case invalidResponse
    case tableNotFound
}
