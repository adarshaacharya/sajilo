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
        static let weatherLocation = "weatherLocation"

        /// Cached per location, so switching cities never shows one city's
        /// reading under another's name, and switching back keeps the old one.
        static func weatherCache(for location: WeatherLocation) -> String {
            "weatherCache.\(location.rawValue)"
        }
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

    var selectedWeatherLocation: WeatherLocation {
        didSet {
            guard oldValue != selectedWeatherLocation else { return }
            defaults.set(selectedWeatherLocation.rawValue, forKey: DefaultsKey.weatherLocation)
            // Swap to that city's cache immediately so the card never shows the
            // previous city's numbers under the new name, then refresh.
            weather = Self.readWeatherCache(from: defaults, location: selectedWeatherLocation)
            weatherError = nil
            Task { [weak self] in await self?.refreshWeatherIfStale() }
        }
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
    private(set) var weather: WeatherSnapshot?
    private(set) var isWeatherLoading = false
    private(set) var weatherError: String?

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let weatherProvider: any WeatherProviding
    @ObservationIgnored private var midnightTask: Task<Void, Never>?
    @ObservationIgnored private var weatherTimerTask: Task<Void, Never>?

    var cards: [DashboardCard] { [weatherCard, Self.forexCard] }

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

    init(
        now: Date = .now,
        defaults: UserDefaults = .standard,
        weatherProvider: any WeatherProviding = OpenMeteoWeatherProvider(),
        autoLoadWeather: Bool = true
    ) {
        self.defaults = defaults
        self.weatherProvider = weatherProvider
        referenceDate = now

        selectedMenuBarFormat = defaults.string(forKey: DefaultsKey.menuBarFormat)
            .flatMap(MenuBarFormat.init(rawValue:)) ?? .nepaliShort
        // `object(forKey:)` distinguishes "never set" from "set to false", so a
        // user who disables a card keeps it disabled across relaunches.
        isWeatherEnabled = defaults.object(forKey: DefaultsKey.weatherEnabled) as? Bool ?? true
        isForexEnabled = defaults.object(forKey: DefaultsKey.forexEnabled) as? Bool ?? true
        let location = defaults.string(forKey: DefaultsKey.weatherLocation)
            .flatMap(WeatherLocation.init(rawValue:)) ?? .default
        selectedWeatherLocation = location
        weather = Self.readWeatherCache(from: defaults, location: location)

        let fallbackDate = NepaliDate(year: 2083, month: 4, day: 30)
        let resolvedToday = (try? BikramSambatCalendar.nepaliDate(from: now)) ?? fallbackDate
        today = resolvedToday
        selectedMonth = (try? BikramSambatCalendar.month(containing: resolvedToday, today: resolvedToday))
            ?? CalendarMonth(firstDate: fallbackDate, title: "साउन २०८३", days: [])
        todayEvent = CalendarEventStore.events(year: resolvedToday.year, month: resolvedToday.month)[resolvedToday.day]
        upcomingEvents = UpcomingEventsService.events(from: resolvedToday)

        scheduleMidnightRefresh()
        if autoLoadWeather {
            startWeatherRefreshTimer()
            Task { [weak self] in
                await self?.refreshWeatherIfStale()
            }
        }
    }

    deinit {
        midnightTask?.cancel()
        weatherTimerTask?.cancel()
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

    // MARK: - Weather

    /// PRD §5.4 targets a refresh every 30–60 minutes.
    static let weatherStaleInterval: TimeInterval = 30 * 60

    /// Whether the cached reading has aged past the refresh target. No cache at
    /// all counts as stale, so the first popover open fetches.
    var isWeatherStale: Bool {
        guard let weather else { return true }
        return Date.now.timeIntervalSince(weather.fetchedAt) >= Self.weatherStaleInterval
    }

    /// Called when the popover opens. Cheap when the cache is warm, so opening
    /// the panel repeatedly does not hammer the provider.
    func refreshWeatherIfStale() async {
        guard isWeatherEnabled, isWeatherStale else { return }
        await refreshWeather()
    }

    /// Refreshes the Kathmandu weather card. A cached result stays visible
    /// while the request runs, so a slow connection never turns the dashboard
    /// into an empty loading state.
    func refreshWeather() async {
        guard !isWeatherLoading else { return }
        isWeatherLoading = true
        weatherError = nil
        defer { isWeatherLoading = false }

        do {
            let requested = selectedWeatherLocation
            let result = try await weatherProvider.currentWeather(at: requested)
            // The user may have switched cities mid-request; a late reply for
            // the previous one must not overwrite the current card.
            guard requested == selectedWeatherLocation else { return }
            weather = result
            defaults.set(try? JSONEncoder().encode(result), forKey: DefaultsKey.weatherCache(for: requested))
        } catch {
            weatherError = Self.weatherErrorText(for: error)
        }
    }

    /// A background refresh so a popover left closed for hours still opens on
    /// something recent. It only fires the request when the cache is actually
    /// stale, so the cost is a wakeup, not a network call.
    private func startWeatherRefreshTimer() {
        weatherTimerTask?.cancel()
        weatherTimerTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.weatherStaleInterval))
                guard !Task.isCancelled, let self else { return }
                await self.refreshWeatherIfStale()
            }
        }
    }

    private static func weatherErrorText(for error: any Error) -> String {
        guard let urlError = error as? URLError else { return "Unable to refresh weather" }
        switch urlError.code {
        case .notConnectedToInternet, .dataNotAllowed:
            return "No internet connection"
        case .timedOut:
            return "Weather request timed out"
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return "Cannot reach the weather service"
        default:
            return "Unable to refresh weather"
        }
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
    /// A preview model already holding a reading, so the weather previews can
    /// render every sky and condition without touching the network.
    static func previewWeather(_ snapshot: WeatherSnapshot) -> AppModel {
        let model = preview()
        model.applyPreviewWeather(snapshot)
        return model
    }

    private func applyPreviewWeather(_ snapshot: WeatherSnapshot) {
        weather = snapshot
        selectedWeatherLocation = snapshot.location
    }

    static func preview(now: Date = .now) -> AppModel {
        AppModel(
            now: now,
            defaults: UserDefaults(suiteName: "com.sajilo.preview") ?? .standard,
            autoLoadWeather: false
        )
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

    private var weatherCard: DashboardCard {
        if let weather {
            return DashboardCard(
                id: "weather",
                kind: .weather,
                title: weather.location.displayName,
                primaryValue: weather.temperatureText,
                detail: "\(weather.condition.title) · \(weather.rangeText)",
                symbol: weather.condition.symbolName,
                freshness: isWeatherLoading ? "Refreshing…" : Self.freshnessText(for: weather.observedAt)
            )
        }

        return DashboardCard(
            id: "weather",
            kind: .weather,
            title: selectedWeatherLocation.displayName,
            primaryValue: isWeatherLoading ? "Loading…" : "Unavailable",
            detail: weatherError ?? "Tap to refresh",
            symbol: "cloud.fill",
            freshness: isWeatherLoading ? "Contacting the weather service" : "Tap to try again"
        )
    }

    private static let forexCard = DashboardCard(
        id: "forex",
        kind: .forex,
        title: "USD / NPR",
        primaryValue: "152.39",
        detail: "Buy · Sell 152.99",
        symbol: "dollarsign.circle.fill",
        freshness: "Prototype data"
    )

    private static func readWeatherCache(
        from defaults: UserDefaults,
        location: WeatherLocation
    ) -> WeatherSnapshot? {
        guard let data = defaults.data(forKey: DefaultsKey.weatherCache(for: location)),
              let snapshot = try? JSONDecoder().decode(WeatherSnapshot.self, from: data),
              // Belt and braces: a key collision or an older cache format must
              // never surface another city's reading.
              snapshot.location == location else {
            return nil
        }
        return snapshot
    }

    /// PRD §6 requires cached data to be labelled with its age, so this has to
    /// keep resolving past an hour — otherwise a day-old reading and a
    /// 61-minute-old one are presented identically.
    static func freshnessText(for date: Date, now: Date = .now) -> String {
        let minutes = Int(now.timeIntervalSince(date) / 60)
        switch minutes {
        case ..<1: return "Updated just now"
        case 1: return "Updated 1 min ago"
        case 2..<60: return "Updated \(minutes) min ago"
        default: break
        }

        let hours = minutes / 60
        switch hours {
        case 1: return "Updated 1 hour ago"
        case 2..<24: return "Updated \(hours) hours ago"
        case 24..<48: return "Updated yesterday"
        default: return "Updated \(hours / 24) days ago"
        }
    }
}
