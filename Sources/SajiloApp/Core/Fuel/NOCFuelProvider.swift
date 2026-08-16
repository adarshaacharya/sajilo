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

/// A deliberately small reader for one server-rendered table.
///
/// Not a general HTML parser: it knows only rows and cells, which is all this
/// page needs and all it should be trusted with.
enum HTMLTable {
    static func firstTableRows(in html: String) -> [[String]] {
        guard let table = slice(of: html, tag: "table").first else { return [] }
        return slice(of: table, tag: "tr")
            .map(cells(in:))
            .filter { !$0.isEmpty }
    }

    /// Cells in document order, so a heading row mixing `th` and `td` keeps its
    /// column positions — reading all the `th`s and then all the `td`s would
    /// reorder it.
    private static func cells(in row: String) -> [String] {
        slice(of: row, tags: ["td", "th"]).map(text)
    }

    private static func slice(of html: String, tag: String) -> [String] {
        slice(of: html, tags: [tag])
    }

    /// The inner content of every `<tag>…</tag>` pair for any of `tags`, in
    /// document order. Nested pairs of the same tag are not handled — none of
    /// the tags this reads can legally nest inside itself.
    private static func slice(of html: String, tags: [String]) -> [String] {
        var results: [String] = []
        var remainder = Substring(html)

        while true {
            // Whichever tag opens next wins, so mixed `th`/`td` rows stay in
            // the order the document wrote them.
            let candidates = tags.compactMap { tag -> (Range<Substring.Index>, String)? in
                guard let range = openingTag(named: tag, in: remainder) else { return nil }
                return (range, tag)
            }
            guard let (open, tag) = candidates.min(by: { $0.0.lowerBound < $1.0.lowerBound }),
                  let close = remainder.range(of: "</\(tag)>", options: .caseInsensitive),
                  close.lowerBound >= open.upperBound else {
                break
            }
            results.append(String(remainder[open.upperBound..<close.lowerBound]))
            remainder = remainder[close.upperBound...]
        }
        return results
    }

    /// The range of a complete `<tag …>` opening, or nil if there is none left.
    private static func openingTag(named tag: String, in html: Substring) -> Range<Substring.Index>? {
        var remainder = html
        while let match = remainder.range(of: "<\(tag)", options: .caseInsensitive) {
            let afterName = remainder[match.upperBound...]
            // Reject `<table>` matching `<tablefoo>`: whatever follows the name
            // has to end it.
            guard let next = afterName.first,
                  next == ">" || next.isWhitespace,
                  let end = afterName.firstIndex(of: ">") else {
                remainder = remainder[match.upperBound...]
                continue
            }
            return match.lowerBound..<afterName.index(after: end)
        }
        return nil
    }

    /// Tag-stripped, entity-decoded, whitespace-collapsed cell text.
    static func text(_ fragment: String) -> String {
        var output = ""
        var isInsideTag = false
        for character in fragment {
            switch character {
            case "<": isInsideTag = true
            case ">": isInsideTag = false
            default: if !isInsideTag { output.append(character) }
            }
        }
        output = output
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
        return output
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}
