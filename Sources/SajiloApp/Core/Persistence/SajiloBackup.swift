import Foundation

/// A portable, user-owned snapshot of Sajilo's personal data and preferences.
/// Live feeds and caches are intentionally excluded: they are recreated from
/// their public sources, while plans and choices cannot be reconstructed.
struct SajiloBackup: Codable, Equatable, Sendable {
    static let currentVersion = 1

    struct Preferences: Codable, Equatable, Sendable {
        var menuBarFormat: String
        var customMenuBarShowsFlag: Bool
        var customMenuBarShowsYear: Bool
        var appLanguage: String
        var numeralStyle: String
        var weatherEnabled: Bool
        var forexEnabled: Bool
        var newsEnabled: Bool
        var bazarEnabled: Bool
        var rashifalEnabled: Bool
        var radioEnabled: Bool
        var weatherLocation: String
        var forexFavourites: [String]
        var vegetableFavourites: [String]
        var selectedRashi: String?
        var showsDockIcon: Bool
        var notifyHolidayEve: Bool
        var notifyFestivalEve: Bool
    }

    let formatVersion: Int
    let exportedAt: Date
    let preferences: Preferences
    let dayPlans: [DayPlan]

    init(preferences: Preferences, dayPlans: [DayPlan], exportedAt: Date = .now) {
        formatVersion = Self.currentVersion
        self.exportedAt = exportedAt
        self.preferences = preferences
        self.dayPlans = dayPlans
    }

    func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(self)
    }

    static func decode(_ data: Data) throws -> Self {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let backup = try decoder.decode(Self.self, from: data)
        guard backup.formatVersion == currentVersion else {
            throw BackupError.unsupportedVersion(backup.formatVersion)
        }
        return backup
    }

    enum BackupError: LocalizedError, Equatable {
        case unsupportedVersion(Int)

        var errorDescription: String? {
            switch self {
            case let .unsupportedVersion(version):
                "This backup uses an unsupported Sajilo format (version \(version))."
            }
        }
    }
}
