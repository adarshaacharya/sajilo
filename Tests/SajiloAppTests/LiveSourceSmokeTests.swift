import Foundation
import Testing
@testable import SajiloApp

/// Hits the real endpoints. Off by default so `swift test` stays offline and
/// deterministic; run with `SAJILO_LIVE=1 swift test --filter LiveSource` when
/// checking whether a source has changed shape under us.
@Suite(.enabled(if: ProcessInfo.processInfo.environment["SAJILO_LIVE"] == "1"))
struct LiveSourceSmokeTests {
    @Test func federationStillPublishesGoldAndSilver() async throws {
        let snapshot = try await FenegosidaMetalProvider().latestRates()
        #expect(snapshot.rate(for: .fineGold, unit: .tola) != nil)
        #expect(snapshot.rate(for: .silver, unit: .tola) != nil)
        // A per-gram misread would land three orders of magnitude low.
        #expect(snapshot.rate(for: .fineGold, unit: .tola)!.price > 50_000)
    }

    @Test func kalimatiStillPublishesTheDailyTable() async throws {
        let snapshot = try await KalimatiMarketProvider().latestPrices()

        // The board lists around a hundred items every trading day; a handful
        // would mean the table shape changed under us.
        #expect(snapshot.prices.count > 50)
        #expect(snapshot.publishedOn != nil, "the BS date heading moved or changed shape")
        #expect(snapshot.prices.allSatisfy { $0.average > 0 })
        #expect(snapshot.prices.contains { $0.englishName == "Potato" })
    }

    @Test func hamroPatroStillPublishesAllTwelveReadings() async throws {
        let snapshot = try await HamroPatroRashifalProvider().todaysRashifal()

        #expect(snapshot.readings.count == 12)
        #expect(snapshot.publishedOn != nil, "the date in the page title moved or changed shape")
        // Each reading is a real paragraph, not a stray label picked up near
        // the heading.
        #expect(snapshot.readings.allSatisfy { $0.prediction.count > 60 })
        // Twelve distinct readings, not the same text attached to every sign.
        #expect(Set(snapshot.readings.map(\.prediction)).count == 12)
    }

    /// Annapurna Post's feed has no dates; they are recovered from the story
    /// page, whose Bikram Sambat stamp is the thing most likely to change shape.
    @Test func annapurnaStoryPagesStillCarryAReadableDate() async throws {
        let digest = await RSSNewsProvider().headlines(from: NewsSource.active, limit: 150)
        let undated = try #require(digest.items.first { $0.sourceName == "Annapurna Post" })
        #expect(undated.published == nil, "the feed itself still ships no pubDate")

        let resolved = await AnnapurnaArticleDateResolver().publishedDate(for: undated.link)
        let date = try #require(resolved, "the story page stamp moved or changed shape")
        // A publish time in the last month and not in the future.
        #expect(date < Date().addingTimeInterval(3600))
        #expect(date > Date().addingTimeInterval(-60 * 24 * 3600))
    }

    /// Every feed still parses. A publisher that quietly moves or breaks its
    /// feed shows up here rather than as an empty section in the app.
    @Test func everyNewsSourceStillReturnsHeadlines() async throws {
        for source in NewsSource.allCases {
            let digest = await RSSNewsProvider().headlines(from: [source], limit: 50)
            #expect(!digest.items.isEmpty, "\(source.displayName) returned nothing")
            #expect(digest.failedSources.isEmpty, "\(source.displayName) failed")
        }
    }

    /// The Kathmandu Post ships no pubDate; its dates come out of the link path.
    @Test func kathmanduPostHeadlinesAreDatedFromTheirLinks() async throws {
        let digest = await RSSNewsProvider().headlines(from: [.kathmanduPost], limit: 50)
        let dated = digest.items.filter { $0.published != nil }

        #expect(dated.count == digest.items.count, "every link should carry /YYYY/MM/DD/")
        #expect(dated.allSatisfy { $0.precision == .day })
        let newest = try #require(dated.map(\.published!).max())
        #expect(newest > Date().addingTimeInterval(-7 * 24 * 3600), "the feed looks stale")
    }

    @Test func nocStillPublishesTheRetailTable() async throws {
        let snapshot = try await NOCFuelProvider().latestPrices()
        #expect(snapshot.price(for: .petrol) != nil)
        #expect(snapshot.price(for: .lpg) != nil)
        #expect(snapshot.price(for: .petrol)!.price > 50)
    }
}
