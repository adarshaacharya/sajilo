import Foundation

/// Fills in publish times for headlines whose feed omitted them.
///
/// A publish date never changes, so a story page is worth fetching exactly
/// once. Everything here exists to hold to that: results are cached by link and
/// survive relaunch, a link that has already been tried is never retried, and
/// each pass fetches at most `batchLimit` pages. Steady state is therefore the
/// number of genuinely new stories, not the size of the feed.
@MainActor
final class ArticleDateStore {
    /// Ceiling per refresh. The undated feed carries twenty items, so the first
    /// run resolves them over a couple of passes rather than opening twenty
    /// connections at once, and later runs only ever see new links.
    static let batchLimit = 8
    /// Concurrent fetches. Deliberately small: this is someone's newsroom, not
    /// a CDN, and the result is not urgent.
    private static let concurrency = 3
    /// Enough for weeks of a feed that holds twenty at a time.
    private static let capacity = 400

    private let defaults: UserDefaults
    private let resolver: any ArticleDateResolving
    private let cacheKey: String

    /// Link → publish time. `nil` records "asked, and the page had no date",
    /// so a story that simply lacks one is not re-fetched on every refresh.
    private var cache: [String: Date?]
    /// Insertion order, for trimming.
    private var order: [String]

    init(
        defaults: UserDefaults = .standard,
        resolver: any ArticleDateResolving = AnnapurnaArticleDateResolver(),
        cacheKey: String = "articleDates.v1"
    ) {
        self.defaults = defaults
        self.resolver = resolver
        self.cacheKey = cacheKey

        let stored = defaults.dictionary(forKey: cacheKey) as? [String: Double] ?? [:]
        // A sentinel keeps "known to have no date" distinct from "never asked",
        // since `UserDefaults` cannot hold a nil value.
        cache = stored.mapValues { $0 == Self.noDateSentinel ? nil : Date(timeIntervalSince1970: $0) }
        order = defaults.stringArray(forKey: cacheKey + ".order") ?? Array(stored.keys)
    }

    private static let noDateSentinel: Double = -1

    /// Returns the digest with dates filled in where they could be recovered.
    ///
    /// Only items already missing a date are considered, and only the first
    /// `batchLimit` unknown ones are fetched — so a slow or unreachable
    /// newsroom costs one bounded delay, never a stall proportional to the feed.
    func resolvingDates(in digest: NewsDigest) async -> NewsDigest {
        let unknown = digest.items
            .filter { $0.published == nil && cache.index(forKey: $0.link.absoluteString) == nil }
            .map(\.link)
            .uniqued()
            .prefix(Self.batchLimit)

        if !unknown.isEmpty {
            await fetch(Array(unknown))
        }

        let items = digest.items.map { item -> NewsItem in
            guard item.published == nil,
                  let resolved = cache[item.link.absoluteString] ?? nil else { return item }
            return NewsItem(
                title: item.title,
                link: item.link,
                sourceName: item.sourceName,
                published: resolved
            )
        }

        return NewsDigest(
            // Re-ordered with the recovered dates in hand, so a story that just
            // gained a timestamp moves to where it belongs.
            items: RSSNewsProvider.newestFirst(items),
            fetchedAt: digest.fetchedAt,
            failedSources: digest.failedSources
        )
    }

    private func fetch(_ links: [URL]) async {
        let resolver = self.resolver

        let resolved = await withTaskGroup(of: (String, Date?).self) { group in
            var pending = links[...]
            var results: [(String, Date?)] = []

            func addNext() {
                guard let link = pending.popFirst() else { return }
                group.addTask { (link.absoluteString, await resolver.publishedDate(for: link)) }
            }
            for _ in 0..<min(Self.concurrency, links.count) { addNext() }

            while let result = await group.next() {
                results.append(result)
                addNext()
            }
            return results
        }

        for (key, date) in resolved where cache.index(forKey: key) == nil {
            cache[key] = date
            order.append(key)
        }
        trim()
        persist()
    }

    private func trim() {
        guard order.count > Self.capacity else { return }
        let dropped = order.prefix(order.count - Self.capacity)
        for key in dropped { cache.removeValue(forKey: key) }
        order.removeFirst(dropped.count)
    }

    private func persist() {
        let stored = cache.mapValues { $0?.timeIntervalSince1970 ?? Self.noDateSentinel }
        defaults.set(stored, forKey: cacheKey)
        defaults.set(order, forKey: cacheKey + ".order")
    }
}

private extension Array where Element: Hashable {
    /// Preserves order; the feed can repeat a link across sections.
    func uniqued() -> [Element] {
        var seen: Set<Element> = []
        return filter { seen.insert($0).inserted }
    }
}
