import Foundation

protocol NewsProviding: Sendable {
    func headlines(from sources: [NewsSource], limit: Int) async -> NewsDigest
}

struct RSSNewsProvider: NewsProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    /// Never throws. One publisher being down should cost that publisher's
    /// headlines, not the whole list — so failures are collected and reported
    /// alongside whatever did arrive.
    func headlines(from sources: [NewsSource], limit: Int) async -> NewsDigest {
        let results = await withTaskGroup(
            of: (NewsSource, [NewsItem]).self
        ) { group -> [(NewsSource, [NewsItem])] in
            for source in sources {
                group.addTask { (source, await fetch(source)) }
            }
            var collected: [(NewsSource, [NewsItem])] = []
            for await result in group { collected.append(result) }
            return collected
        }

        // Restore the caller's order; a task group finishes in whatever order
        // the network happens to return, which would otherwise shuffle the
        // round-robin below on every refresh.
        let ordered = sources.compactMap { source in
            results.first { $0.0 == source }.map { (source, $0.1) }
        }

        return NewsDigest(
            items: Self.newestFirst(Self.interleave(ordered.map(\.1), limit: limit)),
            fetchedAt: .now,
            failedSources: ordered.filter { $0.1.isEmpty }.map(\.0.displayName)
        )
    }

    /// Orders dated stories newest first without undoing the round-robin.
    ///
    /// Sorting the whole list by date sends every undated story to the bottom,
    /// and one publisher — Annapurna Post — dates nothing at all. Their twenty
    /// headlines then land past position 115 of 135, six reveals down, which
    /// reads as the source having disappeared.
    ///
    /// So an undated item keeps the slot `interleave` gave it, and only the
    /// dated slots are refilled in date order. Readers get newest-first among
    /// everything that can be ranked, and a publisher is not punished for the
    /// shape of its feed.
    static func newestFirst(_ items: [NewsItem]) -> [NewsItem] {
        var dated = items
            .enumerated()
            .filter { $0.element.published != nil }
            .sorted { left, right in
                guard let leftDate = left.element.published,
                      let rightDate = right.element.published else { return false }
                // Ties keep their interleaved order, so the sort stays stable
                // and a refresh cannot shuffle equally-timed headlines.
                return leftDate == rightDate ? left.offset < right.offset : leftDate > rightDate
            }
            .map(\.element)
            .makeIterator()

        return items.map { item in
            guard item.published != nil else { return item }
            return dated.next() ?? item
        }
    }

    /// Takes one headline from each source in turn.
    ///
    /// Not a date sort: Annapurna Post publishes no `pubDate` at all, so
    /// sorting by time would bury it permanently. Round-robin also stops a
    /// single prolific feed — OnlineKhabar returns 55 items to Bizkhabar's 10
    /// — from filling the entire list.
    static func interleave(_ feeds: [[NewsItem]], limit: Int) -> [NewsItem] {
        var merged: [NewsItem] = []
        var seen = Set<String>()
        var index = 0

        while merged.count < limit, feeds.contains(where: { index < $0.count }) {
            for feed in feeds where index < feed.count {
                let item = feed[index]
                guard !seen.contains(item.id) else { continue }
                seen.insert(item.id)
                merged.append(item)
                if merged.count >= limit { break }
            }
            index += 1
        }
        return merged
    }

    private func fetch(_ source: NewsSource) async -> [NewsItem] {
        var request = URLRequest(url: source.feedURL)
        request.setValue("application/rss+xml, application/xml", forHTTPHeaderField: "Accept")

        guard let (data, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse,
              200..<300 ~= http.statusCode else {
            return []
        }
        return RSSParser.parse(data, sourceName: source.displayName)
    }
}
