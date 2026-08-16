import Foundation

/// A single headline.
///
/// Deliberately just a title, a link, and where it came from. The feeds carry
/// more — OnlineKhabar ships `content:encoded` with the whole article body —
/// and none of it is read. Syndicating a feed is not a licence to republish
/// what it contains, and Sajilo ships beyond Nepal, so this holds regardless of
/// which jurisdiction's rules apply.
struct NewsItem: Codable, Equatable, Sendable, Identifiable {
    let title: String
    let link: URL
    let sourceName: String
    /// Absent in some feeds — Annapurna Post publishes no `pubDate` at all —
    /// so nothing may depend on it being there.
    let published: Date?
    /// How precisely `published` is known.
    ///
    /// The Kathmandu Post dates a story only to the day, in its URL and on its
    /// own page ("Published at : August 16, 2026"). Rendering that as a
    /// relative time would tell a reader a story from this afternoon is "22
    /// hours old" — a specific, confident, wrong number. Carrying the precision
    /// lets the row say "Today" instead of inventing an hour.
    var precision: DatePrecision = .exact

    var id: String { link.absoluteString }
}

enum DatePrecision: String, Codable, Equatable, Sendable {
    case exact
    case day
}

struct NewsDigest: Codable, Equatable, Sendable {
    let items: [NewsItem]
    let fetchedAt: Date
    /// Sources that failed this round, so partial results can say so rather
    /// than quietly presenting themselves as the whole picture.
    var failedSources: [String] = []
}

/// The feeds Sajilo reads.
///
/// Every one is an official publisher RSS endpoint, verified to return
/// `application/rss+xml`. Kantipur and Hamro Patro are deliberately absent:
/// neither publishes a real feed, and the alternative — parsing their HTML —
/// is the same technique that silently costs this app 349 days of festival
/// data in the bundled calendar scrape.
enum NewsSource: String, CaseIterable, Identifiable, Sendable {
    case onlineKhabar
    case onlineKhabarEnglish
    case annapurnaPost
    case ratopati
    case bizkhabar
    case kathmanduPost
    case khabarhub
    case risingNepal
    case ratopatiEnglish

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .onlineKhabar: "OnlineKhabar"
        case .onlineKhabarEnglish: "OnlineKhabar English"
        case .annapurnaPost: "Annapurna Post"
        case .ratopati: "Ratopati"
        case .bizkhabar: "Bizkhabar"
        case .kathmanduPost: "The Kathmandu Post"
        case .khabarhub: "Khabarhub"
        case .risingNepal: "The Rising Nepal"
        case .ratopatiEnglish: "Ratopati English"
        }
    }

    var feedURL: URL {
        switch self {
        case .onlineKhabar: URL(string: "https://www.onlinekhabar.com/feed")!
        case .onlineKhabarEnglish: URL(string: "https://english.onlinekhabar.com/feed")!
        case .annapurnaPost: URL(string: "https://annapurnapost.com/rss/")!
        case .ratopati: URL(string: "https://www.ratopati.com/feed")!
        case .bizkhabar: URL(string: "https://www.bizkhabar.com/feed")!
        case .kathmanduPost: URL(string: "https://kathmandupost.com/rss")!
        case .khabarhub: URL(string: "https://english.khabarhub.com/feed")!
        case .risingNepal: URL(string: "https://risingnepaldaily.com/rss")!
        case .ratopatiEnglish: URL(string: "https://english.ratopati.com/feed")!
        }
    }

    var isEnglish: Bool {
        switch self {
        case .onlineKhabarEnglish, .kathmanduPost, .khabarhub, .risingNepal, .ratopatiEnglish: true
        case .onlineKhabar, .annapurnaPost, .ratopati, .bizkhabar: false
        }
    }

    /// The Kathmandu Post ships no `pubDate`, but every one of its links spells
    /// the date out — `/national/2026/08/16/landslides-…`. That is the same
    /// precision the paper itself reports, so it is read from the URL rather
    /// than fetched: no extra request, and nothing invented.
    var datesFromLinkPath: Bool { self == .kathmanduPost }

    /// Every source, always.
    ///
    /// News is deliberately *not* tied to the app language. That setting picks
    /// the language of Sajilo's own chrome; it says nothing about which
    /// newsrooms a reader wants. Someone running the interface in English is
    /// usually still a Nepali reader, and filtering the Devanagari publishers
    /// out would hide most of the country's reporting from them. Nothing is
    /// translated either — each headline appears in the language it was
    /// written in.
    static var active: [NewsSource] { allCases }
}
