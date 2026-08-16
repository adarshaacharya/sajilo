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
