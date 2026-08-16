import Foundation
import Testing
@testable import SajiloApp

struct ArticleDateParsingTests {
    /// The story page prints the article's stamp with a clock, and the site
    /// header prints today's date without one, in a different word order.
    private static let page = """
    <html><body>
      <header><span>३१ साउन २०८३, आइतबार</span></header>
      <h1>पहिरोको उच्च जोखिममा रोल्पाका बस्ती</h1>
      <div class="time">साउन ३१, २०८३ आइतबार २१:२१:५</div>
      <p>काठमाडौं : समाचार…</p>
    </body></html>
    """

    @Test func readsTheBikramSambatStamp() throws {
        let date = try #require(AnnapurnaArticleDateResolver.publishedDate(in: Self.page))
        let parts = NepalTime.calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)

        // BS साउन ३१, २०८३ is AD 2026-08-16.
        #expect(parts.year == 2026)
        #expect(parts.month == 8)
        #expect(parts.day == 16)
        #expect(parts.hour == 21)
        #expect(parts.minute == 21)
    }

    /// The header carries today's date with no clock. Matching it would stamp
    /// every article with the day it was fetched — which looks right and is
    /// wrong, the worst combination.
    @Test func ignoresTheUndatedSiteHeader() throws {
        let headerOnly = "<header><span>३१ साउन २०८३, आइतबार</span></header><p>no article stamp</p>"
        #expect(AnnapurnaArticleDateResolver.publishedDate(in: headerOnly) == nil)

        // With both present, the one carrying a time wins.
        let date = try #require(AnnapurnaArticleDateResolver.publishedDate(in: Self.page))
        #expect(NepalTime.calendar.component(.hour, from: date) == 21)
    }

    /// Seconds run to a single digit on the real page — "२१:२१:५".
    @Test(arguments: [
        "साउन ३१, २०८३ आइतबार २१:२१:५",
        "साउन ३१, २०८३ आइतबार २१:२१:०५",
        "साउन ३१, २०८३ आइतबार २१:२१",
        "साउन ३१,२०८३ आइतबार २१:२१:५",
    ])
    func toleratesTheStampsLooseFormatting(stamp: String) throws {
        let date = try #require(AnnapurnaArticleDateResolver.publishedDate(in: "<div>\(stamp)</div>"))
        #expect(NepalTime.calendar.component(.hour, from: date) == 21)
    }

    @Test(arguments: [
        "<p>no date here at all</p>",
        "<p>साउन ३१, २०८३ आइतबार</p>",
        "<p>Sunday, August 16, 2026 21:21</p>",
        "<p>फोओ ३१, २०८३ आइतबार २१:२१:५</p>",
    ])
    func returnsNothingRatherThanGuessing(html: String) {
        #expect(AnnapurnaArticleDateResolver.publishedDate(in: html) == nil)
    }

    /// A year outside the bundled month-length table cannot be converted, and
    /// must fail rather than land on a fabricated day.
    @Test func rejectsAnUnconvertibleYear() {
        #expect(AnnapurnaArticleDateResolver.publishedDate(in: "<p>साउन ३१, २९९९ आइतबार २१:२१:५</p>") == nil)
    }
}

@MainActor
struct ArticleDateStoreTests {
    @Test func fillsInMissingDatesAndLeavesExistingOnesAlone() async {
        let resolver = CountingResolver(date: Date(timeIntervalSince1970: 1_000))
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: resolver, cacheKey: "t")

        let dated = item("has-date", published: Date(timeIntervalSince1970: 5_000))
        let undated = item("no-date", published: nil)
        let result = await store.resolvingDates(in: digest([dated, undated]))

        #expect(result.items.first { $0.title == "no-date" }?.published == Date(timeIntervalSince1970: 1_000))
        #expect(result.items.first { $0.title == "has-date" }?.published == Date(timeIntervalSince1970: 5_000))
        #expect(await resolver.calls == 1, "an item that already has a date is never fetched")
    }

    /// The whole justification for fetching article pages: a publish date never
    /// changes, so a link is fetched once and never again.
    @Test func neverFetchesTheSameStoryTwice() async {
        let resolver = CountingResolver(date: Date(timeIntervalSince1970: 1_000))
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: resolver, cacheKey: "t")
        let feed = digest([item("a", published: nil)])

        _ = await store.resolvingDates(in: feed)
        _ = await store.resolvingDates(in: feed)
        _ = await store.resolvingDates(in: feed)

        #expect(await resolver.calls == 1)
    }

    /// A story whose page carries no date must also be remembered, or every
    /// refresh re-fetches it forever.
    @Test func remembersThatAStoryHasNoDate() async {
        let resolver = CountingResolver(date: nil)
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: resolver, cacheKey: "t")
        let feed = digest([item("a", published: nil)])

        _ = await store.resolvingDates(in: feed)
        _ = await store.resolvingDates(in: feed)

        #expect(await resolver.calls == 1)
    }

    @Test func cachedDatesSurviveRelaunch() async {
        let defaults = Self.defaults()
        let first = CountingResolver(date: Date(timeIntervalSince1970: 1_000))
        _ = await ArticleDateStore(defaults: defaults, resolver: first, cacheKey: "t")
            .resolvingDates(in: digest([item("a", published: nil)]))

        let second = CountingResolver(date: Date(timeIntervalSince1970: 9_999))
        let result = await ArticleDateStore(defaults: defaults, resolver: second, cacheKey: "t")
            .resolvingDates(in: digest([item("a", published: nil)]))

        #expect(await second.calls == 0)
        #expect(result.items.first?.published == Date(timeIntervalSince1970: 1_000))
    }

    /// One refresh must never open a connection per feed item.
    @Test func fetchesAtMostOneBatchPerPass() async {
        let resolver = CountingResolver(date: Date(timeIntervalSince1970: 1_000))
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: resolver, cacheKey: "t")
        let many = (0..<40).map { item("story-\($0)", published: nil) }

        _ = await store.resolvingDates(in: digest(many))

        #expect(await resolver.calls == ArticleDateStore.batchLimit)
    }

    /// A newsroom that is slow or down must cost nothing beyond the missing
    /// timestamps — the headlines still arrive.
    @Test func headlinesSurviveAFailedResolver() async {
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: CountingResolver(date: nil), cacheKey: "t")
        let result = await store.resolvingDates(in: digest([item("a", published: nil), item("b", published: nil)]))

        #expect(result.items.count == 2)
        #expect(result.items.allSatisfy { $0.published == nil })
    }

    /// A story that gains a date moves into place among the dated ones.
    @Test func reordersOnceDatesAreRecovered() async {
        let resolver = CountingResolver(date: Date(timeIntervalSince1970: 9_000))
        let store = ArticleDateStore(defaults: Self.defaults(), resolver: resolver, cacheKey: "t")

        let older = item("older", published: Date(timeIntervalSince1970: 1_000))
        let recovered = item("recovered", published: nil)
        let result = await store.resolvingDates(in: digest([older, recovered]))

        #expect(result.items.map(\.title) == ["recovered", "older"])
    }

    // MARK: - Fixtures

    private static func defaults() -> UserDefaults {
        let suite = "com.sajilo.tests.articledates.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func item(_ title: String, published: Date?) -> NewsItem {
        NewsItem(
            title: title,
            link: URL(string: "https://annapurnapost.com/story/\(title)")!,
            sourceName: "Annapurna Post",
            published: published
        )
    }

    private func digest(_ items: [NewsItem]) -> NewsDigest {
        NewsDigest(items: items, fetchedAt: .now, failedSources: [])
    }
}

/// The store fetches concurrently, so the counter is guarded by an actor
/// rather than a lock — `NSLock` cannot be taken across an await.
private actor CallCounter {
    private(set) var count = 0
    func increment() { count += 1 }
}

private struct CountingResolver: ArticleDateResolving {
    private let counter = CallCounter()
    private let date: Date?

    init(date: Date?) { self.date = date }

    var calls: Int {
        get async { await counter.count }
    }

    func publishedDate(for link: URL) async -> Date? {
        await counter.increment()
        return date
    }
}
