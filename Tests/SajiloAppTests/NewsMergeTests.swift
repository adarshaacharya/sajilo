import Foundation
import Testing
@testable import SajiloApp

struct NewsMergeTests {
    /// One prolific feed must not fill the whole list. OnlineKhabar returns 55
    /// items where Bizkhabar returns 10, so a naive concatenation would bury
    /// every other publisher.
    @Test func takesOneHeadlineFromEachSourceInTurn() {
        let merged = RSSNewsProvider.interleave(
            [feed("A", 5), feed("B", 5), feed("C", 5)],
            limit: 6
        )

        #expect(merged.map(\.sourceName) == ["A", "B", "C", "A", "B", "C"])
    }

    /// Annapurna Post publishes no `pubDate`, so a date sort would bury it
    /// permanently. Round-robin has to be blind to dates.
    @Test func representsUndatedSourcesEqually() {
        let dated = feed("Dated", 3, dated: true)
        let undated = feed("Undated", 3, dated: false)

        let merged = RSSNewsProvider.interleave([dated, undated], limit: 4)

        #expect(merged.filter { $0.sourceName == "Undated" }.count == 2)
        #expect(merged.allSatisfy { !$0.title.isEmpty })
    }

    @Test func keepsGoingWhenAShortFeedRunsOut() {
        let merged = RSSNewsProvider.interleave([feed("A", 1), feed("B", 4)], limit: 5)

        #expect(merged.count == 5)
        #expect(merged.filter { $0.sourceName == "A" }.count == 1)
        #expect(merged.filter { $0.sourceName == "B" }.count == 4)
    }

    /// Publishers syndicate each other, so the same URL can appear twice.
    @Test func dropsRepeatedLinks() {
        let shared = NewsItem(
            title: "Same story",
            link: URL(string: "https://example.com/shared")!,
            sourceName: "A",
            published: nil
        )
        let alsoShared = NewsItem(
            title: "Same story, other outlet",
            link: URL(string: "https://example.com/shared")!,
            sourceName: "B",
            published: nil
        )

        let merged = RSSNewsProvider.interleave([[shared], [alsoShared]], limit: 8)

        #expect(merged.count == 1)
    }

    @Test func respectsTheLimit() {
        #expect(RSSNewsProvider.interleave([feed("A", 20), feed("B", 20)], limit: 8).count == 8)
        #expect(RSSNewsProvider.interleave([], limit: 8).isEmpty)
        #expect(RSSNewsProvider.interleave([[], []], limit: 8).isEmpty)
    }

    @Test func showsNewestDatedHeadlinesFirstAndLeavesUndatedItemsVisible() {
        let earlier = NewsItem(
            title: "Earlier", link: URL(string: "https://example.com/earlier")!, sourceName: "A",
            published: Date(timeIntervalSince1970: 100)
        )
        let undated = NewsItem(
            title: "Undated", link: URL(string: "https://example.com/undated")!, sourceName: "B",
            published: nil
        )
        let latest = NewsItem(
            title: "Latest", link: URL(string: "https://example.com/latest")!, sourceName: "C",
            published: Date(timeIntervalSince1970: 300)
        )

        let sorted = RSSNewsProvider.newestFirst([earlier, undated, latest])

        // The undated story holds slot 1 — the one interleave gave it — while
        // the two dated slots are refilled newest first. Sorting it to the end
        // instead would bury every Annapurna Post headline, since that feed
        // dates nothing at all.
        #expect(sorted.map(\.title) == ["Latest", "Undated", "Earlier"])
    }

    /// A day-precise date is not a time, so it must not compete on the time
    /// axis. The Kathmandu Post's stories all carry midnight; ranking them
    /// there loses every one of them to anything filed today with a clock.
    @Test func dayPreciseItemsKeepTheirSlotInsteadOfSinkingToMidnight() {
        func item(_ title: String, _ stamp: TimeInterval?, _ precision: DatePrecision) -> NewsItem {
            NewsItem(
                title: title,
                link: URL(string: "https://example.com/\(title)")!,
                sourceName: "S",
                published: stamp.map(Date.init(timeIntervalSince1970:)),
                precision: precision
            )
        }
        // The day-precise item is stamped earliest, but holds slot 1 regardless.
        let merged = [
            item("exact-old", 100, .exact),
            item("day", 1, .day),
            item("exact-new", 900, .exact),
        ]

        #expect(RSSNewsProvider.newestFirst(merged).map(\.title) == ["exact-new", "day", "exact-old"])
    }

    /// The whole point: a publisher that dates nothing must still appear near
    /// the top rather than after everyone else's back catalogue.
    @Test func anUndatedSourceIsNotBuriedBeneathTheDatedOnes() {
        func item(_ title: String, _ source: String, _ stamp: TimeInterval?) -> NewsItem {
            NewsItem(
                title: title,
                link: URL(string: "https://example.com/\(title)")!,
                sourceName: source,
                published: stamp.map(Date.init(timeIntervalSince1970:))
            )
        }
        // Interleaved: one undated headline in every other slot.
        let merged = [
            item("dated-1", "A", 100), item("undated-1", "B", nil),
            item("dated-2", "A", 500), item("undated-2", "B", nil),
            item("dated-3", "A", 300), item("undated-3", "B", nil),
        ]

        let sorted = RSSNewsProvider.newestFirst(merged)

        #expect(sorted.map(\.title) == ["dated-2", "undated-1", "dated-3", "undated-2", "dated-1", "undated-3"])
        let firstUndated = try? #require(sorted.firstIndex { $0.published == nil })
        #expect(firstUndated == 1, "the undated source stays near the top")
    }

    /// News must not follow the app language: that setting is about Sajilo's
    /// own chrome, and an English interface does not mean the reader wants
    /// Nepali newsrooms hidden.
    @Test func readsEverySourceRegardlessOfAppLanguage() {
        #expect(NewsSource.active.count == NewsSource.allCases.count)
        #expect(NewsSource.active.contains(.annapurnaPost))
        #expect(NewsSource.active.contains(.onlineKhabarEnglish))
        #expect(NewsSource.active.contains { !$0.isEnglish })
    }

    @Test func everySourceIsHTTPS() {
        for source in NewsSource.allCases {
            #expect(source.feedURL.scheme == "https", "\(source) must not be plaintext")
            #expect(!source.displayName.isEmpty)
        }
    }

    private func feed(_ name: String, _ count: Int, dated: Bool = true) -> [NewsItem] {
        (0..<count).map { index in
            NewsItem(
                title: "\(name) headline \(index)",
                link: URL(string: "https://example.com/\(name)/\(index)")!,
                sourceName: name,
                published: dated ? Date(timeIntervalSince1970: 1_786_838_400 - Double(index) * 600) : nil
            )
        }
    }
}

@MainActor
struct NewsModuleTests {
    @Test func isOnByDefault() {
        #expect(makeModel().isNewsEnabled)
    }

    /// The distinction that matters: "never set" and "explicitly switched off"
    /// must not collapse into the same stored value, or a disabled module
    /// turns itself back on at every launch.
    @Test func staysOffOnceTheUserTurnsItOff() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults)

        model.isNewsEnabled = false

        #expect(makeModel(defaults: defaults).isNewsEnabled == false)
    }

    @Test func staysOnAfterBeingReEnabled() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults)
        model.isNewsEnabled = false
        model.isNewsEnabled = true

        #expect(makeModel(defaults: defaults).isNewsEnabled)
    }

    private func makeModel(defaults: UserDefaults? = nil) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.news.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}
