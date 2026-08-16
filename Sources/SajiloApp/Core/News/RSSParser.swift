import Foundation

/// Pulls headlines out of an RSS feed.
///
/// Reads exactly three elements — `title`, `link`, `pubDate` — and ignores
/// everything else, including `description` and `content:encoded`. That is a
/// deliberate limit rather than an oversight: several of these feeds carry the
/// full article body, and this app displays headlines that open in the
/// browser, never the text itself.
enum RSSParser {
    /// `limit` is a safety ceiling, not a page size: RSS has no pagination, so
    /// a feed returns everything it is going to return in one response.
    /// Some feeds ship no `pubDate` but spell the date out in the article URL —
    /// `/national/2026/08/16/landslides-…`. Reading it there costs nothing and
    /// is exactly as precise as the paper's own "Published at" line, so it is
    /// preferred over leaving the story undated.
    static func dateFromLinkPath(_ link: URL) -> Date? {
        let path = link.path
        guard let match = linkDatePattern.firstMatch(
            in: path,
            range: NSRange(path.startIndex..., in: path)
        ) else { return nil }

        func number(_ index: Int) -> Int? {
            Range(match.range(at: index), in: path).flatMap { Int(path[$0]) }
        }
        guard let year = number(1), let month = number(2), let day = number(3),
              year > 1900, 1...12 ~= month, 1...31 ~= day else { return nil }

        return NepalTime.calendar.date(from: DateComponents(year: year, month: month, day: day))
    }

    private static let linkDatePattern = try! NSRegularExpression(
        pattern: "/(\\d{4})/(\\d{2})/(\\d{2})/"
    )

    static func parse(_ data: Data, sourceName: String, limit: Int = 100) -> [NewsItem] {
        let delegate = Delegate(sourceName: sourceName, limit: limit)
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        guard parser.parse() else { return delegate.items }
        return delegate.items
    }

    /// RSS dates are RFC 822. Feeds vary on whether seconds and the zone are
    /// present, so several shapes are tried before giving up — a missing date
    /// is survivable, a crash is not.
    static func date(from raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        for formatter in formatters {
            if let date = formatter.date(from: trimmed) { return date }
        }
        return nil
    }

    private static let formatters: [DateFormatter] = [
        "EEE, dd MMM yyyy HH:mm:ss Z",
        "EEE, dd MMM yyyy HH:mm Z",
        "dd MMM yyyy HH:mm:ss Z",
        "EEE, dd MMM yyyy HH:mm:ss zzz"
    ].map { format in
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = format
        return formatter
    }

    private final class Delegate: NSObject, XMLParserDelegate {
        private(set) var items: [NewsItem] = []

        private let sourceName: String
        private let limit: Int

        private var insideItem = false
        private var currentElement = ""
        private var title = ""
        private var link = ""
        private var pubDate = ""

        init(sourceName: String, limit: Int) {
            self.sourceName = sourceName
            self.limit = limit
        }

        func parser(
            _ parser: XMLParser,
            didStartElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?,
            attributes: [String: String]
        ) {
            currentElement = elementName
            if elementName == "item" {
                insideItem = true
                title = ""; link = ""; pubDate = ""
            }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            guard insideItem else { return }
            // Anything not in this list — description, content:encoded, guid,
            // category — is dropped on the floor by design.
            switch currentElement {
            case "title": title += string
            case "link": link += string
            case "pubDate": pubDate += string
            default: break
            }
        }

        func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
            guard insideItem, let text = String(data: CDATABlock, encoding: .utf8) else { return }
            switch currentElement {
            case "title": title += text
            case "link": link += text
            default: break
            }
        }

        func parser(
            _ parser: XMLParser,
            didEndElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?
        ) {
            defer { currentElement = "" }
            guard elementName == "item" else { return }
            insideItem = false

            guard items.count < limit else {
                parser.abortParsing()
                return
            }

            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanLink = link.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty,
                  let url = URL(string: cleanLink),
                  // Only ever hand the browser a web link.
                  url.scheme == "http" || url.scheme == "https" else {
                return
            }

            // A real `pubDate` always wins; the URL is only consulted when the
            // feed gave nothing, and is day-precise, which the item records so
            // the UI never renders it as an hour-accurate time.
            let feedDate = RSSParser.date(from: pubDate)
            let linkDate = feedDate == nil ? RSSParser.dateFromLinkPath(url) : nil

            items.append(
                NewsItem(
                    title: cleanTitle,
                    link: url,
                    sourceName: sourceName,
                    published: feedDate ?? linkDate,
                    precision: linkDate == nil ? .exact : .day
                )
            )
        }
    }
}
