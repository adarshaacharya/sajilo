import Foundation
import Testing
@testable import SajiloApp

struct SajiloBackupTests {
    @Test func roundTripsPersonalPlansAndPreferences() throws {
        let plan = DayPlan(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            date: NepaliDate(year: 2083, month: 4, day: 31),
            title: "Mum's birthday",
            recurrence: .yearlyBikramSambat,
            createdAt: Date(timeIntervalSince1970: 1_786_838_400)
        )
        let preferences = SajiloBackup.Preferences(
            menuBarFormat: "nepaliLong",
            customMenuBarShowsFlag: true,
            customMenuBarShowsYear: false,
            appLanguage: "mixed",
            numeralStyle: "devanagari",
            weatherEnabled: true,
            forexEnabled: true,
            newsEnabled: false,
            bazarEnabled: true,
            rashifalEnabled: true,
            radioEnabled: false,
            weatherLocation: "kathmandu",
            forexFavourites: ["USD"],
            vegetableFavourites: ["Tomato"],
            selectedRashi: "taurus",
            showsDockIcon: false,
            notifyHolidayEve: true,
            notifyFestivalEve: false
        )
        let backup = SajiloBackup(
            preferences: preferences,
            dayPlans: [plan],
            exportedAt: Date(timeIntervalSince1970: 1_786_838_400)
        )

        let restored = try SajiloBackup.decode(backup.encoded())

        #expect(restored == backup)
    }

    @Test func rejectsAnUnsupportedFormatVersion() throws {
        let backup = SajiloBackup(
            preferences: samplePreferences,
            dayPlans: [],
            exportedAt: Date(timeIntervalSince1970: 1_786_838_400)
        )
        var object = try #require(JSONSerialization.jsonObject(with: backup.encoded()) as? [String: Any])
        object["formatVersion"] = 99
        let data = try JSONSerialization.data(withJSONObject: object)

        #expect(throws: SajiloBackup.BackupError.unsupportedVersion(99)) {
            try SajiloBackup.decode(data)
        }
    }

    private var samplePreferences: SajiloBackup.Preferences {
        .init(
            menuBarFormat: "nepaliShort",
            customMenuBarShowsFlag: true,
            customMenuBarShowsYear: true,
            appLanguage: "mixed",
            numeralStyle: "devanagari",
            weatherEnabled: true,
            forexEnabled: true,
            newsEnabled: true,
            bazarEnabled: true,
            rashifalEnabled: true,
            radioEnabled: true,
            weatherLocation: "kathmandu",
            forexFavourites: ["USD"],
            vegetableFavourites: [],
            selectedRashi: nil,
            showsDockIcon: false,
            notifyHolidayEve: false,
            notifyFestivalEve: false
        )
    }
}
