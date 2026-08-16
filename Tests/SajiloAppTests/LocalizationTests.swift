import Foundation
import Testing
@testable import SajiloApp

struct LocalizationTests {
    /// Proves the Nepali strings are actually bundled and reachable, rather
    /// than silently falling back to the key name.
    @Test func nepaliStringsResolveFromTheBundle() {
        var resource = L10n.settings
        resource.locale = Locale(identifier: "ne")
        #expect(String(localized: resource) == "सेटिङ")

        var back = L10n.backToDashboard
        back.locale = Locale(identifier: "ne")
        #expect(String(localized: back) == "ड्यासबोर्डमा फर्कनुहोस्")
    }

    @Test func englishStringsResolve() {
        var resource = L10n.settings
        resource.locale = Locale(identifier: "en")
        #expect(String(localized: resource) == "Settings")
    }

    /// A missing key resolves to the key itself, which is how a gap would ship
    /// unnoticed. Both tables are read from the bundle rather than from a
    /// hand-kept list of names — a list only covers the keys someone remembered
    /// to add to it, which is exactly the mistake being tested for.
    @Test func everyKeyIsTranslatedInBothLanguages() throws {
        let english = try Self.table(for: "en")
        let nepali = try Self.table(for: "ne")

        #expect(!english.isEmpty)
        #expect(Set(english.keys) == Set(nepali.keys), """
            missing in ne: \(Set(english.keys).subtracting(nepali.keys).sorted()); \
            missing in en: \(Set(nepali.keys).subtracting(english.keys).sorted())
            """)

        for (locale, table) in [("en", english), ("ne", nepali)] {
            for (key, value) in table {
                #expect(!value.isEmpty, "\(key) is empty in \(locale)")
                #expect(value != key, "\(key) is untranslated in \(locale)")
            }
        }
    }

    /// Nepali is a real translation, not a copy of the English table with a few
    /// words changed.
    @Test func nepaliIsActuallyTranslated() throws {
        let english = try Self.table(for: "en")
        let nepali = try Self.table(for: "ne")

        let identical = english.filter { nepali[$0.key] == $0.value }
        // Some values legitimately match — "%", proper nouns, symbols — so this
        // bounds the overlap rather than forbidding it.
        #expect(identical.count * 4 < english.count, "too many Nepali strings are still English: \(identical.keys.sorted())")
    }

    private static func table(for localization: String) throws -> [String: String] {
        let url = try #require(
            Bundle.sajiloResources.url(
                forResource: "Localizable",
                withExtension: "strings",
                subdirectory: nil,
                localization: localization
            ),
            "no \(localization) strings file in the bundle"
        )
        let contents = try Data(contentsOf: url)
        let table = try PropertyListSerialization.propertyList(from: contents, format: nil)
        return try #require(table as? [String: String])
    }

    /// The static resources capture `Locale.current` when first touched.
    @Test func staticResourcesCarryALocale() {
        #expect(L10n.settings.locale != nil)
    }
}
