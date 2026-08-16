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
    /// unnoticed. This asserts every declared key has real text in both.
    @Test func noKeyFallsBackToItsOwnName() {
        for locale in ["en", "ne"] {
            for (name, resource) in L10nMirror.all {
                var localized = resource
                localized.locale = Locale(identifier: locale)
                let text = String(localized: localized)
                #expect(text != localized.key, "\(name) has no \(locale) translation")
                #expect(!text.isEmpty)
            }
        }
    }

    /// The static resources capture `Locale.current` when first touched.
    @Test func staticResourcesCarryALocale() {
        #expect(L10n.settings.locale != nil)
    }
}

private enum L10nMirror {
    /// Every key L10n declares. Regenerate this list when adding one — the
    /// coverage test is only as complete as this array.
    static let all: [(String, LocalizedStringResource)] = [
        ("language", L10n.language),
        ("languageMixed", L10n.languageMixed),
        ("languageEnglish", L10n.languageEnglish),
        ("languageNepali", L10n.languageNepali),
        ("settings", L10n.settings),
        ("back", L10n.back),
        ("festivals", L10n.festivals),
        ("convert", L10n.convert),
        ("quit", L10n.quit),
        ("weather", L10n.weather),
        ("forex", L10n.forex),
        ("display", L10n.display),
        ("numerals", L10n.numerals),
        ("city", L10n.city),
        ("reminders", L10n.reminders),
        ("data", L10n.data),
        ("openSettings", L10n.openSettings),
        ("backToDashboard", L10n.backToDashboard),
        ("publicHoliday", L10n.publicHoliday),
        ("upcoming", L10n.upcoming),
        ("dateConverter", L10n.dateConverter),
        ("dateDetails", L10n.dateDetails),
        ("refresh", L10n.refresh),
        ("exchangeRates", L10n.exchangeRates),
        ("general", L10n.general),
        ("launchAtLogin", L10n.launchAtLogin),
        ("showDockIcon", L10n.showDockIcon),
        ("menuBar", L10n.menuBar),
        ("modules", L10n.modules),
        ("weatherLocation", L10n.weatherLocation),
        ("forexFavourites", L10n.forexFavourites),
        ("weatherSource", L10n.weatherSource),
        ("ratesSource", L10n.ratesSource),
        ("festivalSource", L10n.festivalSource),
        ("calendarRange", L10n.calendarRange),
        ("festivalsRange", L10n.festivalsRange),
        ("holidayTomorrow", L10n.holidayTomorrow),
        ("festivalTomorrow", L10n.festivalTomorrow),
        ("today", L10n.today),
        ("swap", L10n.swap),
        ("copyAs", L10n.copyAs),
        ("previousMonth", L10n.previousMonth),
        ("nextMonth", L10n.nextMonth),
        ("jumpToToday", L10n.jumpToToday),
        ("provisional", L10n.provisional),
        ("noEventToday", L10n.noEventToday),
        ("outOfRange", L10n.outOfRange),
        ("noUpcoming", L10n.noUpcoming),
        ("allCurrencies", L10n.allCurrencies),
        ("favourites", L10n.favourites),
        ("tomorrow", L10n.tomorrow),
        ("numeralsDevanagari", L10n.numeralsDevanagari),
        ("numeralsLatin", L10n.numeralsLatin),
        ("offlineDataNote", L10n.offlineDataNote),
        ("reminderOffNote", L10n.reminderOffNote),
        ("reminderDeniedNote", L10n.reminderDeniedNote),
        ("reminderPermissionNote", L10n.reminderPermissionNote),
        ("reminderEnabledNote", L10n.reminderEnabledNote),
        ("launchApprovalNote", L10n.launchApprovalNote),
        ("launchUnavailableNote", L10n.launchUnavailableNote)
    ]
}
