import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    enum MenuBarFormat: String, CaseIterable, Identifiable {
        case nepaliShort
        case nepaliLong
        case nepaliFlag
        case englishShort
        case numeric

        var id: String { rawValue }

        /// Renders the format against a real date. The Settings picker shows
        /// each option applied to today, so what the user previews is exactly
        /// what lands in the menu bar.
        func title(for date: NepaliDate) -> String {
            let day = NepaliNumerals.string(from: date.day)
            let year = NepaliNumerals.string(from: date.year)

            switch self {
            case .nepaliShort: return "\(day) \(date.nepaliMonthName)"
            case .nepaliLong: return "\(day) \(date.nepaliMonthName) \(year)"
            case .nepaliFlag: return "🇳🇵 \(day) \(date.nepaliMonthName)"
            case .englishShort: return "\(date.day) \(date.englishMonthName)"
            case .numeric: return date.nepaliNumerals
            }
        }
    }

    private enum DefaultsKey {
        static let menuBarFormat = "menuBarFormat"
        static let weatherEnabled = "weatherEnabled"
        static let forexEnabled = "forexEnabled"
    }

    var selectedMenuBarFormat: MenuBarFormat {
        didSet { defaults.set(selectedMenuBarFormat.rawValue, forKey: DefaultsKey.menuBarFormat) }
    }

    var isWeatherEnabled: Bool {
        didSet { defaults.set(isWeatherEnabled, forKey: DefaultsKey.weatherEnabled) }
    }

    var isForexEnabled: Bool {
        didSet { defaults.set(isForexEnabled, forKey: DefaultsKey.forexEnabled) }
    }

    var selectedMonth: CalendarMonth
    private(set) var today: NepaliDate
    private(set) var referenceDate: Date
    /// Cached rather than computed: reading it decodes a bundled JSON file, and
    /// the header would otherwise re-decode on every redraw.
    private(set) var todayEvent: CalendarEvent?
    /// Scanning ahead decodes a JSON file per month, so it runs once per day
    /// rather than on every redraw.
    private(set) var upcomingEvents: [UpcomingEvent] = []

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var midnightTask: Task<Void, Never>?

    let cards: [DashboardCard] = [
        DashboardCard(
            id: "weather",
            kind: .weather,
            title: "Kathmandu",
            primaryValue: "27°",
            detail: "Mostly clear · H 29° L 21°",
            symbol: "sun.max.fill",
            freshness: "Prototype data"
        ),
        DashboardCard(
            id: "forex",
            kind: .forex,
            title: "USD / NPR",
            primaryValue: "152.39",
            detail: "Buy · Sell 152.99",
            symbol: "dollarsign.circle.fill",
            freshness: "Prototype data"
        )
    ]

    /// The soonest festival after today, used for the dashboard teaser.
    var nextEvent: UpcomingEvent? {
        upcomingEvents.first
    }

    var menuBarTitle: String {
        selectedMenuBarFormat.title(for: today)
    }

    var visibleCards: [DashboardCard] {
        cards.filter { card in
            switch card.kind {
            case .weather: isWeatherEnabled
            case .forex: isForexEnabled
            }
        }
    }

    /// Whether the visible month is the one containing today, used to hide the
    /// Today button when it would be a no-op.
    var isShowingCurrentMonth: Bool {
        selectedMonth.firstDate.year == today.year && selectedMonth.firstDate.month == today.month
    }

    /// BS 2084 onward is extrapolated rather than officially published, so the
    /// calendar says so rather than presenting it as settled (PRD §10).
    var isShowingProvisionalYear: Bool {
        BikramSambatCalendar.provisionalNepaliYears.contains(selectedMonth.firstDate.year)
    }

    var gregorianDate: String {
        Self.gregorianFormatter.string(from: referenceDate)
    }

    var nepaliWeekday: String {
        Self.nepaliWeekdayNames[Self.nepalCalendar.component(.weekday, from: referenceDate) - 1]
    }

    init(now: Date = .now, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        referenceDate = now

        selectedMenuBarFormat = defaults.string(forKey: DefaultsKey.menuBarFormat)
            .flatMap(MenuBarFormat.init(rawValue:)) ?? .nepaliShort
        // `object(forKey:)` distinguishes "never set" from "set to false", so a
        // user who disables a card keeps it disabled across relaunches.
        isWeatherEnabled = defaults.object(forKey: DefaultsKey.weatherEnabled) as? Bool ?? true
        isForexEnabled = defaults.object(forKey: DefaultsKey.forexEnabled) as? Bool ?? true

        let fallbackDate = NepaliDate(year: 2083, month: 4, day: 30)
        let resolvedToday = (try? BikramSambatCalendar.nepaliDate(from: now)) ?? fallbackDate
        today = resolvedToday
        selectedMonth = (try? BikramSambatCalendar.month(containing: resolvedToday, today: resolvedToday))
            ?? CalendarMonth(firstDate: fallbackDate, title: "साउन २०८३", days: [])
        todayEvent = CalendarEventStore.events(year: resolvedToday.year, month: resolvedToday.month)[resolvedToday.day]
        upcomingEvents = UpcomingEventsService.events(from: resolvedToday)

        scheduleMidnightRefresh()
    }

    deinit {
        midnightTask?.cancel()
    }

    func moveMonth(by direction: Int) {
        guard let date = try? BikramSambatCalendar.addingMonths(direction, to: selectedMonth.firstDate),
              let month = try? BikramSambatCalendar.month(containing: date, today: today) else {
            return
        }
        selectedMonth = month
    }

    func jumpToToday() {
        guard let month = try? BikramSambatCalendar.month(containing: today, today: today) else { return }
        selectedMonth = month
    }

    // MARK: - Date rollover

    /// The menu-bar label must change at Nepal local midnight (PRD §4.1), which
    /// can be mid-afternoon for the user's own time zone. A one-shot timer per
    /// day reschedules itself rather than polling.
    private func scheduleMidnightRefresh() {
        midnightTask?.cancel()

        // A few seconds past midnight avoids firing on the boundary itself,
        // where a slow wake could still read the previous day.
        guard let nextMidnight = Self.nepalCalendar.nextDate(
            after: .now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) else { return }

        let interval = nextMidnight.timeIntervalSinceNow
        guard interval > 0 else { return }

        // `Task.sleep(for:)` runs on the continuous clock, so the wait keeps
        // elapsing while the Mac is asleep — a `Timer` would fire late.
        midnightTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(interval))
            guard !Task.isCancelled else { return }
            self?.refreshForNewDay()
        }
    }

    private func refreshForNewDay() {
        referenceDate = .now
        if let resolved = try? BikramSambatCalendar.nepaliDate(from: referenceDate) {
            today = resolved
        }
        todayEvent = CalendarEventStore.events(year: today.year, month: today.month)[today.day]
        upcomingEvents = UpcomingEventsService.events(from: today)
        // Rebuild the visible month so the `isToday` highlight moves even when
        // the user left the popover open on another month.
        if let month = try? BikramSambatCalendar.month(containing: selectedMonth.firstDate, today: today) {
            selectedMonth = month
        }
        scheduleMidnightRefresh()
    }

    static let prototype = AppModel()

    #if DEBUG
    /// A throwaway model for `#Preview`. It writes to its own defaults suite so
    /// rendering a preview can never mutate the real settings, and takes an
    /// explicit date so previews stay deterministic.
    static func preview(now: Date = .now) -> AppModel {
        AppModel(now: now, defaults: UserDefaults(suiteName: "com.sajilo.preview") ?? .standard)
    }
    #endif

    private static let nepaliWeekdayNames = [
        "आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"
    ]

    private static let nepalCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar
    }()

    private static let gregorianFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "Asia/Kathmandu")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter
    }()
}
