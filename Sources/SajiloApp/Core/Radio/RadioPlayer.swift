import AVFoundation
import Foundation
import Observation

/// Native playback plus a small local cache of recently resolved stream URLs.
@MainActor
@Observable
final class RadioPlayer {
    private struct CachedStream: Codable, Sendable {
        let url: URL
        let resolvedAt: Date
    }

    private static let streamCacheKey = "radioStreamCache.v1"
    private static let streamCacheLifetime: TimeInterval = 6 * 60 * 60

    private(set) var currentStation: RadioStation?
    private(set) var isPlaying = false
    private(set) var isResolving = false
    private(set) var errorMessage: String?

    @ObservationIgnored private let provider: any RadioProviding
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var streamCache: [String: CachedStream]

    init(provider: any RadioProviding, defaults: UserDefaults) {
        self.provider = provider
        self.defaults = defaults
        streamCache = Self.readCache(from: defaults)
    }

    func toggle(_ station: RadioStation) async {
        if currentStation?.id == station.id {
            if isPlaying {
                player.pause()
                isPlaying = false
            } else {
                player.play()
                isPlaying = true
            }
            return
        }
        await play(station)
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        currentStation = nil
        isPlaying = false
        errorMessage = nil
    }

    private func play(_ station: RadioStation) async {
        isResolving = true
        errorMessage = nil
        defer { isResolving = false }

        do {
            let streamURL = try await resolvedURL(for: station)
            guard !Task.isCancelled else { return }
            player.replaceCurrentItem(with: AVPlayerItem(url: streamURL))
            player.play()
            currentStation = station
            isPlaying = true
        } catch {
            errorMessage = "This station could not be played right now."
        }
    }

    private func resolvedURL(for station: RadioStation) async throws -> URL {
        if let cached = streamCache[station.id],
           Date.now.timeIntervalSince(cached.resolvedAt) < Self.streamCacheLifetime {
            return cached.url
        }

        let url = try await provider.streamURL(for: station)
        streamCache[station.id] = CachedStream(url: url, resolvedAt: .now)
        defaults.set(try? JSONEncoder().encode(streamCache), forKey: Self.streamCacheKey)
        return url
    }

    private static func readCache(from defaults: UserDefaults) -> [String: CachedStream] {
        guard let data = defaults.data(forKey: streamCacheKey),
              let cache = try? JSONDecoder().decode([String: CachedStream].self, from: data) else {
            return [:]
        }
        return cache
    }
}
