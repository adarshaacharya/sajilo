import Foundation
import Testing
@testable import SajiloApp

/// A cached value that still *decodes* but no longer *means* what it did is
/// the dangerous case: nothing errors, and the stale entry keeps being served
/// until it ages out. News hit exactly this — a payload cached under an earlier
/// source list kept showing one publisher after that logic was deleted.
@MainActor
struct RemoteFeedCacheTests {
    @Test func readsBackAValueItCached() async {
        let defaults = makeDefaults()
        let first = makeFeed(defaults: defaults, version: 1, load: { Payload(label: "fresh") })
        await first.refresh()
        #expect(first.value?.label == "fresh")

        let relaunched = makeFeed(defaults: defaults, version: 1, load: { Payload(label: "unused") })
        #expect(relaunched.value?.label == "fresh", "a warm cache should survive relaunch")
    }

    @Test func ignoresACacheWrittenUnderAnEarlierVersion() async {
        let defaults = makeDefaults()
        let old = makeFeed(defaults: defaults, version: 1, load: { Payload(label: "old meaning") })
        await old.refresh()
        #expect(old.value != nil)

        let bumped = makeFeed(defaults: defaults, version: 2, load: { Payload(label: "new meaning") })

        #expect(bumped.value == nil, "a v1 entry must not be served to v2")
        #expect(bumped.isStale, "so the next open refetches instead of showing stale data")
    }

    /// Superseded entries would otherwise sit in UserDefaults forever — the
    /// app already had an orphaned `weatherCache` beside `weatherCache.kathmandu`.
    @Test func removesSupersededEntriesFromDefaults() async {
        let defaults = makeDefaults()
        let old = makeFeed(defaults: defaults, version: 1, load: { Payload(label: "old") })
        await old.refresh()
        #expect(defaults.data(forKey: "testFeed.v1") != nil)

        _ = makeFeed(defaults: defaults, version: 2, load: { Payload(label: "new") })

        #expect(defaults.data(forKey: "testFeed.v1") == nil)
        #expect(defaults.data(forKey: "testFeed") == nil, "pre-versioning key cleared too")
    }

    @Test func versionsAreIsolatedPerCacheKey() async {
        let defaults = makeDefaults()
        let a = makeFeed(defaults: defaults, key: "alpha", version: 2, load: { Payload(label: "A") })
        let b = makeFeed(defaults: defaults, key: "beta", version: 2, load: { Payload(label: "B") })
        await a.refresh()
        await b.refresh()

        #expect(a.value?.label == "A")
        #expect(b.value?.label == "B")
    }

    // MARK: - Helpers

    private struct Payload: Codable, Equatable, Sendable {
        var label: String
        var fetchedAt = Date()
    }

    private func makeFeed(
        defaults: UserDefaults,
        key: String = "testFeed",
        version: Int,
        load: @escaping @MainActor () async -> Payload
    ) -> RemoteFeed<Payload> {
        RemoteFeed(
            subject: "test",
            cacheKey: key,
            cacheVersion: version,
            staleInterval: 3600,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            load: { await load() }
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.cache.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}
