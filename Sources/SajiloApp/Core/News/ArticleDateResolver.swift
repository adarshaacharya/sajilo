import Foundation

protocol ArticleDateResolving: Sendable {
    func publishedDate(for link: URL) async -> Date?
}

/// Recovers a publish time for feeds that ship none.
///
/// Annapurna Post's RSS carries only `title`, `link`, `description`, and `guid`
/// — no `pubDate`, no `dc:date`, no Atom `published`. The date is not missing
/// from their newsroom, only from the feed: every story page prints it, in
/// Bikram Sambat with Devanagari numerals.
///
///     साउन ३१, २०८३ आइतबार २१:२१:५
///
/// RSS `pubDate` must be RFC-822 — English month names, Gregorian — so a BS
/// newsroom would have to convert to publish one. Sajilo converts in the other
/// direction instead, which it can already do.
///
/// **This fetches article pages, not a feed**, which is a heavier thing to do to
/// a publisher than reading their syndication. Two limits keep it proportionate,
/// and both are the caller's job (see `ArticleDateStore`): a page is fetched at
/// most once ever, and only a bounded number are fetched per refresh.
struct AnnapurnaArticleDateResolver: ArticleDateResolving {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    func publishedDate(for link: URL) async -> Date? {
        guard let (data, response) = try? await session.data(from: link),
              let http = response as? HTTPURLResponse,
              200..<300 ~= http.statusCode,
              let html = String(data: data, encoding: .utf8) else {
            return nil
        }
        return Self.publishedDate(in: html)
    }

    /// The story page also carries today's date in the site header, in a
    /// different order and with no clock — `३१ साउन २०८३, आइतबार`. Requiring a
    /// time is what separates the article's own stamp from that furniture, so
    /// a story never gets dated "today" just because the page was rendered
    /// today.
    static func publishedDate(in html: String) -> Date? {
        let text = plainText(html)
        guard let match = timestampPattern.firstMatch(
            in: text,
            range: NSRange(text.startIndex..., in: text)
        ) else { return nil }

        func number(_ index: Int) -> Int? {
            guard let range = Range(match.range(at: index), in: text) else { return nil }
            return Int(NepaliNumerals.arabicString(from: String(text[range])))
        }
        guard let monthRange = Range(match.range(at: 1), in: text),
              let month = NepaliMonth.allCases.first(where: { $0.nepaliName == String(text[monthRange]) }),
              let day = number(2), let year = number(3),
              let hour = number(4), let minute = number(5) else {
            return nil
        }

        let nepaliDate = NepaliDate(year: year, month: month.rawValue, day: day)
        guard let midnight = try? BikramSambatCalendar.gregorianDate(from: nepaliDate) else {
            return nil
        }
        // The clock on the page is Nepal local time, which is what
        // `NepalTime.calendar` resolves against.
        return NepalTime.calendar.date(
            bySettingHour: min(hour, 23),
            minute: min(minute, 59),
            second: 0,
            of: midnight
        )
    }

    /// `साउन ३१, २०८३ आइतबार २१:२१:५` — note the seconds run to a single digit,
    /// so nothing here assumes two. Seconds are parsed and discarded; a
    /// headline list has no use for them.
    private static let timestampPattern: NSRegularExpression = {
        let months = NepaliMonth.allCases.map(\.nepaliName).joined(separator: "|")
        let digits = "[\u{0966}-\u{096F}]"
        return try! NSRegularExpression(
            pattern: """
            (\(months))\\s*(\(digits){1,2}),?\\s*(\(digits){4})\\s*\\S*\\s*\
            (\(digits){1,2}):(\(digits){1,2})(?::\(digits){1,2})?
            """
        )
    }()

    private static func plainText(_ html: String) -> String {
        var output = ""
        var isInsideTag = false
        for character in html {
            switch character {
            case "<": isInsideTag = true
            case ">": isInsideTag = false
            default: if !isInsideTag { output.append(character) }
            }
        }
        return output.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
