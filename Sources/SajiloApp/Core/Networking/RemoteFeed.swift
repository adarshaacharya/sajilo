import Foundation
import Observation

extension URLSession {
    /// The session every Sajilo provider uses.
    ///
    /// `URLSession.shared` waits 60 seconds by default, which in a menu-bar
    /// popover means a minute of "Loading…" before anything is reported.
    /// Ephemeral because Sajilo caches decoded snapshots itself and has no use
    /// for a second copy in URLSession's on-disk cache, and connectivity
    /// waiting is off so being offline fails fast — the cached value is the
    /// better answer than a request held open indefinitely.
    static func sajilo(requestTimeout: TimeInterval = 10, resourceTimeout: TimeInterval = 20) -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = requestTimeout
        configuration.timeoutIntervalForResource = resourceTimeout
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }
}

/// A cached remote value with the freshness rules PRD §6 requires:
/// `loading → fresh → stale cached → unavailable`, where a failed refresh never
/// discards what is already on screen.
///
/// Weather and forex had separately grown the same six pieces — cache read and
/// write, a staleness check, a concurrency guard, a periodic timer, error
/// mapping, and a "refresh only if stale" entry point. Sharing them means the
/// next module (gold, fuel, NEPSE) inherits the behaviour rather than
/// reimplementing it slightly differently.
@MainActor
@Observable
final class RemoteFeed<Value: Codable & Equatable & Sendable> {
    private(set) var value: Value?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    /// Named in fallback error copy: "Unable to refresh weather".
    let subject: String
    let staleInterval: TimeInterval

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let fetchedAt: @Sendable (Value) -> Date
    /// `@MainActor` so the closure can read live model state — the weather
    /// feed must resolve the *current* city each time, not the one that
    /// happened to be selected when the feed was built.
    @ObservationIgnored private let load: @MainActor () async throws -> Value
    /// Maps domain errors to copy. Returning nil falls through to the shared
    /// network wording.
    @ObservationIgnored private let describeError: (any Error) -> String?
    @ObservationIgnored private var cacheKey: String
    @ObservationIgnored private var refreshTask: Task<Void, Never>?

    init(
        subject: String,
        cacheKey: String,
        staleInterval: TimeInterval,
        defaults: UserDefaults,
        fetchedAt: @escaping @Sendable (Value) -> Date,
        describeError: @escaping (any Error) -> String? = { _ in nil },
        load: @escaping @MainActor () async throws -> Value
    ) {
        self.subject = subject
        self.cacheKey = cacheKey
        self.staleInterval = staleInterval
        self.defaults = defaults
        self.fetchedAt = fetchedAt
        self.describeError = describeError
        self.load = load
        value = Self.readCache(from: defaults, key: cacheKey)
    }

    deinit { refreshTask?.cancel() }

    /// No cached value counts as stale, so the first popover open fetches.
    var isStale: Bool {
        guard let value else { return true }
        return Date.now.timeIntervalSince(fetchedAt(value)) >= staleInterval
    }

    /// Called when the popover opens. Cheap on a warm cache, so opening the
    /// panel repeatedly does not hammer the provider.
    func refreshIfStale() async {
        guard isStale else { return }
        await refresh()
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let result = try await load()
            // A late reply for a cache slot the caller has since moved away
            // from must not overwrite the current one.
            guard !Task.isCancelled else { return }
            value = result
            defaults.set(try? JSONEncoder().encode(result), forKey: cacheKey)
        } catch {
            errorMessage = describeError(error) ?? Self.networkErrorText(for: error, subject: subject)
        }
    }

    /// A background refresh so a popover left closed for hours still opens on
    /// something recent. It only issues a request when the cache is actually
    /// stale, so the cost is a wakeup rather than a network call.
    func startPeriodicRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let interval = self?.staleInterval else { return }
                try? await Task.sleep(for: .seconds(interval))
                guard !Task.isCancelled, let self else { return }
                await self.refreshIfStale()
            }
        }
    }

    /// Points the feed at a different cache slot and adopts whatever is stored
    /// there. Weather uses this when the city changes, so one city's reading is
    /// never relabelled as another's.
    func rebind(cacheKey newKey: String) {
        guard newKey != cacheKey else { return }
        cacheKey = newKey
        value = Self.readCache(from: defaults, key: newKey)
        errorMessage = nil
    }

    #if DEBUG
    /// Places a value without touching the network or the cache, so previews
    /// can render every state. Not available in release builds.
    func seed(_ value: Value) {
        self.value = value
    }
    #endif

    private static func readCache(from defaults: UserDefaults, key: String) -> Value? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Value.self, from: data)
    }

    static func networkErrorText(for error: any Error, subject: String) -> String {
        guard let urlError = error as? URLError else { return "Unable to refresh \(subject)" }
        switch urlError.code {
        case .notConnectedToInternet, .dataNotAllowed:
            return "No internet connection"
        case .timedOut:
            return "Request timed out"
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return "Cannot reach the service"
        default:
            return "Unable to refresh \(subject)"
        }
    }
}
