import Foundation

enum AppLanguage: String, CaseIterable, Identifiable, Codable, Sendable {
    case mixed
    case english
    case nepali

    var id: String { rawValue }

    /// Mixed deliberately retains English utility labels while calendar data,
    /// tithi, festivals, and BS numerals remain in their original Nepali.
    var locale: Locale {
        switch self {
        case .nepali: Locale(identifier: "ne_NP")
        case .english, .mixed: Locale(identifier: "en")
        }
    }

    var title: LocalizedStringResource {
        switch self {
        case .mixed: L10n.languageMixed
        case .english: L10n.languageEnglish
        case .nepali: L10n.languageNepali
        }
    }

}

enum L10n {
    static let language = LocalizedStringResource("settings.language", bundle: .module)
    static let languageMixed = LocalizedStringResource("language.mixed", bundle: .module)
    static let languageEnglish = LocalizedStringResource("language.english", bundle: .module)
    static let languageNepali = LocalizedStringResource("language.nepali", bundle: .module)
    static let settings = LocalizedStringResource("screen.settings", bundle: .module)
    static let back = LocalizedStringResource("action.back", bundle: .module)
    static let festivals = LocalizedStringResource("action.festivals", bundle: .module)
    static let convert = LocalizedStringResource("action.convert", bundle: .module)
    static let quit = LocalizedStringResource("action.quit", bundle: .module)
    static let weather = LocalizedStringResource("feature.weather", bundle: .module)
    static let forex = LocalizedStringResource("feature.forex", bundle: .module)
    static let display = LocalizedStringResource("settings.display", bundle: .module)
    static let numerals = LocalizedStringResource("settings.numerals", bundle: .module)
    static let news = LocalizedStringResource("screen.news", bundle: .module)
    static let city = LocalizedStringResource("settings.city", bundle: .module)
    static let reminders = LocalizedStringResource("settings.reminders", bundle: .module)
    static let data = LocalizedStringResource("settings.data", bundle: .module)
    static let openSettings = LocalizedStringResource("accessibility.open-settings", bundle: .module)
    static let backToDashboard = LocalizedStringResource("accessibility.back-dashboard", bundle: .module)
    static let publicHoliday = LocalizedStringResource("calendar.public-holiday", bundle: .module)
    static let upcoming = LocalizedStringResource("screen.upcoming", bundle: .module)
    static let dateConverter = LocalizedStringResource("screen.date-converter", bundle: .module)
    static let dateDetails = LocalizedStringResource("screen.date-details", bundle: .module)
    static let refresh = LocalizedStringResource("action.refresh", bundle: .module)
    static let exchangeRates = LocalizedStringResource("screen.exchange-rates", bundle: .module)
    static let general = LocalizedStringResource("settings.general", bundle: .module)
    static let launchAtLogin = LocalizedStringResource("settings.launch-at-login", bundle: .module)
    static let showDockIcon = LocalizedStringResource("settings.show-dock-icon", bundle: .module)
    static let menuBar = LocalizedStringResource("settings.menu-bar", bundle: .module)
    static let modules = LocalizedStringResource("settings.modules", bundle: .module)
    static let weatherLocation = LocalizedStringResource("settings.weather-location", bundle: .module)
    static let forexFavourites = LocalizedStringResource("settings.forex-favourites", bundle: .module)
    static let weatherSource = LocalizedStringResource("settings.weather-source", bundle: .module)
    static let ratesSource = LocalizedStringResource("settings.rates-source", bundle: .module)
    static let festivalSource = LocalizedStringResource("settings.festival-source", bundle: .module)
    static let calendarRange = LocalizedStringResource("settings.calendar-range", bundle: .module)
    static let festivalsRange = LocalizedStringResource("settings.festivals-range", bundle: .module)
    static let holidayTomorrow = LocalizedStringResource("reminder.holiday-tomorrow", bundle: .module)
    static let festivalTomorrow = LocalizedStringResource("reminder.festival-tomorrow", bundle: .module)
    static let today = LocalizedStringResource("action.today", bundle: .module)
    static let swap = LocalizedStringResource("action.swap", bundle: .module)
    static let copyAs = LocalizedStringResource("action.copy-as", bundle: .module)
    static let previousMonth = LocalizedStringResource("calendar.previous-month", bundle: .module)
    static let nextMonth = LocalizedStringResource("calendar.next-month", bundle: .module)
    static let jumpToToday = LocalizedStringResource("calendar.jump-to-today", bundle: .module)
    static let provisional = LocalizedStringResource("calendar.provisional", bundle: .module)
    static let noEventToday = LocalizedStringResource("calendar.no-event", bundle: .module)
    static let outOfRange = LocalizedStringResource("calendar.out-of-range", bundle: .module)
    static let noUpcoming = LocalizedStringResource("upcoming.empty", bundle: .module)
    static let allCurrencies = LocalizedStringResource("forex.all-currencies", bundle: .module)
    static let favourites = LocalizedStringResource("forex.favourites", bundle: .module)
    static let tomorrow = LocalizedStringResource("weather.tomorrow", bundle: .module)
    static let numeralsDevanagari = LocalizedStringResource("numerals.devanagari", bundle: .module)
    static let numeralsLatin = LocalizedStringResource("numerals.latin", bundle: .module)
    static let offlineDataNote = LocalizedStringResource("settings.offline-data-note", bundle: .module)
    static let reminderOffNote = LocalizedStringResource("settings.reminder-off-note", bundle: .module)
    static let reminderDeniedNote = LocalizedStringResource("settings.reminder-denied-note", bundle: .module)
    static let reminderPermissionNote = LocalizedStringResource("settings.reminder-permission-note", bundle: .module)
    static let reminderEnabledNote = LocalizedStringResource("settings.reminder-enabled-note", bundle: .module)
    static let launchApprovalNote = LocalizedStringResource("settings.launch-approval-note", bundle: .module)
    static let launchUnavailableNote = LocalizedStringResource("settings.launch-unavailable-note", bundle: .module)
}
