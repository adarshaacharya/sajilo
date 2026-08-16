import Foundation
import Testing
@testable import SajiloApp

struct EnglishNewsSourceTests {
    /// Every source must be reachable and distinct; a duplicated feed URL would
    /// silently double one publisher's share of the round-robin.
    @Test func everySourceHasADistinctFeed() {
        let urls = NewsSource.allCases.map(\.feedURL.absoluteString)
        #expect(Set(urls).count == urls.count)
        #expect(Set(NewsSource.allCases.map(\.displayName)).count == NewsSource.allCases.count)
        #expect(NewsSource.active.count == NewsSource.allCases.count, "news never follows the app language")
    }

    @Test func theEnglishPapersAreMarkedEnglish() {
        let english = NewsSource.allCases.filter(\.isEnglish).map(\.displayName)
        #expect(Set(english) == [
            "OnlineKhabar English", "The Kathmandu Post", "Khabarhub",
            "The Rising Nepal", "Ratopati English",
        ])
    }

    /// Ratopati publishes separate Nepali and English editions, so the two must
    /// not collapse into one name or one feed.
    @Test func theTwoRatopatiEditionsStayDistinct() {
        #expect(NewsSource.ratopati.feedURL != NewsSource.ratopatiEnglish.feedURL)
        #expect(NewsSource.ratopati.isEnglish == false)
        #expect(NewsSource.ratopatiEnglish.isEnglish)
    }

    @Test func onlyTheKathmanduPostDatesFromItsLinks() {
        #expect(NewsSource.kathmanduPost.datesFromLinkPath)
        #expect(NewsSource.allCases.filter(\.datesFromLinkPath) == [.kathmanduPost])
    }
}

struct LinkPathDateTests {
    @Test func readsTheDateOutOfAKathmanduPostLink() throws {
        let link = URL(string: "https://kathmandupost.com/national/2026/08/16/landslides-pile-on-the-misery")!
        let date = try #require(RSSParser.dateFromLinkPath(link))
        let parts = NepalTime.calendar.dateComponents([.year, .month, .day], from: date)

        #expect(parts.year == 2026)
        #expect(parts.month == 8)
        #expect(parts.day == 16)
    }

    @Test(arguments: [
        "https://kathmandupost.com/national/landslides",
        "https://kathmandupost.com/2026/08/story",
        "https://kathmandupost.com/national/2026/13/40/impossible-date",
        "https://example.com/",
    ])
    func returnsNothingWhenTheLinkCarriesNoUsableDate(raw: String) {
        #expect(RSSParser.dateFromLinkPath(URL(string: raw)!) == nil)
    }

    /// A feed date is authoritative; the URL is only a fallback. Otherwise a
    /// slug containing digits could override a real timestamp.
    @Test func aRealPubDateAlwaysWins() throws {
        let feed = Data("""
        <rss><channel><item>
          <title>Dated by the feed</title>
          <link>https://kathmandupost.com/national/2026/08/16/story</link>
          <pubDate>Sat, 15 Aug 2026 09:30:00 +0545</pubDate>
        </item></channel></rss>
        """.utf8)

        let item = try #require(RSSParser.parse(feed, sourceName: "The Kathmandu Post").first)
        #expect(item.precision == .exact)
        #expect(NepalTime.calendar.component(.day, from: item.published!) == 15, "the feed said the 15th")
    }

    @Test func fallsBackToTheLinkAndRecordsDayPrecision() throws {
        let feed = Data("""
        <rss><channel><item>
          <title>No pubDate here</title>
          <link>https://kathmandupost.com/national/2026/08/16/story</link>
        </item></channel></rss>
        """.utf8)

        let item = try #require(RSSParser.parse(feed, sourceName: "The Kathmandu Post").first)
        #expect(item.precision == .day)
        #expect(NepalTime.calendar.component(.day, from: item.published!) == 16)
    }

    /// A feed with neither stays undated, and undated items keep their
    /// interleaved slot rather than sinking.
    @Test func staysUndatedWhenNeitherSourceHasADate() throws {
        let feed = Data("""
        <rss><channel><item>
          <title>Nothing at all</title><link>https://annapurnapost.com/story/505589</link>
        </item></channel></rss>
        """.utf8)

        let item = try #require(RSSParser.parse(feed, sourceName: "Annapurna Post").first)
        #expect(item.published == nil)
        #expect(item.precision == .exact, "precision is meaningless without a date")
    }
}

struct HeadlineAgeTests {
    private static let now = Date(timeIntervalSince1970: 1_786_838_400)

    /// A day-precise date must never be rendered as an hour count. The
    /// Kathmandu Post files at midday and its URL says midnight; "12 hours ago"
    /// would be a confident lie.
    @Test func aDayPreciseDateNamesTheDayInsteadOfAnHourCount() {
        let today = HeadlineRow.age(of: Self.now, precision: .day, now: Self.now)
        #expect(today == "Today")

        let yesterday = NepalTime.calendar.date(byAdding: .day, value: -1, to: Self.now)!
        #expect(HeadlineRow.age(of: yesterday, precision: .day, now: Self.now) == "Yesterday")

        let older = NepalTime.calendar.date(byAdding: .day, value: -6, to: Self.now)!
        let label = HeadlineRow.age(of: older, precision: .day, now: Self.now)
        #expect(label != "Today" && label != "Yesterday")
        #expect(!label.contains("hour"))
    }

    /// An exact timestamp still reads as a relative time.
    @Test func anExactDateStillReadsRelatively() {
        let twoHoursAgo = Self.now.addingTimeInterval(-2 * 3600)
        let label = HeadlineRow.age(of: twoHoursAgo, precision: .exact, now: Self.now)
        #expect(label != "Today")
        #expect(!label.isEmpty)
    }
}
