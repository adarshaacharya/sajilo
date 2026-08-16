import Foundation

protocol RashifalProviding: Sendable {
    func todaysRashifal() async throws -> RashifalSnapshot
}

/// Daily rashifal from Hamro Patro, used with their permission.
///
/// This is the one source in Sajilo that carries somebody's **writing** rather
/// than their numbers. A fuel price is a fact and belongs to nobody; these
/// twelve paragraphs are written each day by Hamro Patro's astrologer. They are
/// reproduced whole, credited on the same screen, and linked back to — and the
/// arrangement rests on permission from Hamro Patro rather than on the page
/// being fetchable. See THIRD_PARTY_NOTICES.md.
///
/// Consequences for this file: the text is never edited, truncated, or
/// paraphrased, and there is no offline fallback that would keep serving the
/// readings if that permission were ever withdrawn — pulling the source out
/// pulls the feature.
struct HamroPatroRashifalProvider: RashifalProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    /// The `/en/` path serves the same Nepali prose with only the surrounding
    /// chrome translated, so there is no English edition to prefer. The reading
    /// stays Nepali whatever Sajilo's language is set to — the same call made
    /// for news headlines.
    private static let endpoint = URL(string: "https://www.hamropatro.com/rashifal")!

    func todaysRashifal() async throws -> RashifalSnapshot {
        let (data, response) = try await session.data(from: Self.endpoint)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw RashifalProviderError.invalidResponse
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw RashifalProviderError.invalidResponse
        }
        return try Self.parse(html, fetchedAt: .now)
    }

    static func parse(_ html: String, fetchedAt: Date) throws -> RashifalSnapshot {
        let body = stripped(html)

        let readings = RashiSign.allCases.compactMap { sign -> Rashifal? in
            guard let prediction = prediction(for: sign, in: body) else { return nil }
            return Rashifal(sign: sign, prediction: prediction)
        }

        // All twelve or nothing. A partial page means the markup moved, and
        // showing four signs while silently dropping eight is worse than
        // saying the reading is unavailable.
        guard readings.count == RashiSign.allCases.count else {
            throw RashifalProviderError.incompleteReading(found: readings.count)
        }

        return RashifalSnapshot(
            readings: readings,
            publishedOn: publishedDate(in: html),
            fetchedAt: fetchedAt
        )
    }

    /// Each sign is a heading of its own followed by its paragraph. The first
    /// substantial run of Devanagari after the heading is that paragraph.
    private static func prediction(for sign: RashiSign, in body: [String]) -> String? {
        guard let index = body.firstIndex(where: { $0 == sign.nepaliName }) else { return nil }

        return body[body.index(after: index)...]
            .prefix(6)
            .first { $0.count >= minimumPredictionLength && containsDevanagari($0) }
    }

    /// Long enough to be a reading rather than a stray label like a lucky
    /// colour or a nav item, short of any real paragraph the source publishes.
    private static let minimumPredictionLength = 60

    /// Tag-stripped text runs, in document order.
    private static func stripped(_ html: String) -> [String] {
        var withoutScripts = html
        for tag in ["script", "style", "noscript"] {
            withoutScripts = removeElements(named: tag, from: withoutScripts)
        }

        var runs: [String] = []
        var current = ""
        var isInsideTag = false

        for character in withoutScripts {
            switch character {
            case "<":
                isInsideTag = true
                let text = HTMLTable.text(current)
                if !text.isEmpty { runs.append(text) }
                current = ""
            case ">":
                isInsideTag = false
            default:
                if !isInsideTag { current.append(character) }
            }
        }
        let tail = HTMLTable.text(current)
        if !tail.isEmpty { runs.append(tail) }
        return runs
    }

    private static func removeElements(named tag: String, from html: String) -> String {
        var output = ""
        var remainder = Substring(html)

        while let open = remainder.range(of: "<\(tag)", options: .caseInsensitive) {
            guard let close = remainder.range(
                of: "</\(tag)>",
                options: .caseInsensitive,
                range: open.upperBound..<remainder.endIndex
            ) else { break }
            output += remainder[..<open.lowerBound]
            remainder = remainder[close.upperBound...]
        }
        return output + remainder
    }

    private static func containsDevanagari(_ text: String) -> Bool {
        text.unicodeScalars.contains { (0x0900...0x097F).contains($0.value) }
    }

    /// The page titles itself with the Bikram Sambat day the reading is for —
    /// "आजको राशिफल साउन ३१, २०८३". Read rather than assumed, so a cached
    /// reading that has rolled over midnight can be shown as yesterday's.
    static func publishedDate(in html: String) -> NepaliDate? {
        guard let marker = html.range(of: "आजको राशिफल") else { return nil }

        let window = html[marker.upperBound...].prefix(40)
        guard let month = NepaliMonth.allCases.first(where: { window.contains($0.nepaliName) }) else {
            return nil
        }

        let numbers = NepaliNumerals.arabicString(from: String(window))
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
        guard numbers.count >= 2 else { return nil }

        let day = numbers[0]
        let year = numbers[1]
        guard 1...32 ~= day, BikramSambatCalendar.supportedNepaliYears.contains(year) else {
            return nil
        }
        return NepaliDate(year: year, month: month.rawValue, day: day)
    }
}

enum RashifalProviderError: Error, Equatable {
    case invalidResponse
    case incompleteReading(found: Int)
}
