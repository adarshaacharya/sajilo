import AppKit
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
        static let forexCache = "forexCache"
        static let forexFavourites = "forexFavourites"
        static let showsDockIcon = "showsDockIcon"
        static let notifyHolidayEve = "notifyHolidayEve"
        static let notifyFestivalEve = "notifyFestivalEve"

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
            // Point the feed at that city's cache immediately so the card
            // never shows the previous city's numbers under the new name.
            weatherFeed.rebind(cacheKey: DefaultsKey.weatherCache(for: selectedWeatherLocation))
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
    /// Both remote modules share one cache/staleness/refresh implementation.
    /// The members below forward to it, so views and tests keep reading
    /// `model.weather` rather than reaching through a feed.
    @ObservationIgnored private var weatherFeed: RemoteFeed<WeatherSnapshot>!
    @ObservationIgnored private var forexFeed: RemoteFeed<ForexSnapshot>!

    var weather: WeatherSnapshot? { weatherFeed.value }
    var isWeatherLoading: Bool { weatherFeed.isLoading }
    var weatherError: String? { weatherFeed.errorMessage }
    var isWeatherStale: Bool { weatherFeed.isStale }

    var forex: ForexSnapshot? { forexFeed.value }
    var isForexLoading: Bool { forexFeed.isLoading }
    var forexError: String? { forexFeed.errorMessage }
    var isForexStale: Bool { forexFeed.isStale }

    /// PRD §4.1: the Dock icon is hidden by default, and a preference may
    /// show it. Applied immediately so the toggle is its own preview.
    var showsDockIcon: Bool {
        didSet {
            guard oldValue != showsDockIcon else { return }
            defaults.set(showsDockIcon, forKey: DefaultsKey.showsDockIcon)
            applyActivationPolicy()
        }
    }

    /// PRD §5.3: opt-in and individually configurable. Turning either on is
    /// the only thing that ever triggers the system permission prompt.
    var notificationOptions: NotificationOptions {
        didSet {
            guard oldValue != notificationOptions else { return }
            defaults.set(notificationOptions.eveOfPublicHoliday, forKey: DefaultsKey.notifyHolidayEve)
            defaults.set(notificationOptions.eveOfFestival, forKey: DefaultsKey.notifyFestivalEve)
            Task { [weak self] in await self?.applyNotificationOptions(wasEnabled: oldValue.isAnyEnabled) }
        }
    }

    /// Surfaced in Settings so a denied permission explains itself rather than
    /// leaving a toggle that appears on but never fires.
    private(set) var notificationAuthorization: NotificationAuthorization = .notDetermined

    /// Read from the system on every access rather than mirrored into
    /// `UserDefaults`: the user can change it in System Settings, and a stored
    /// copy would drift out of agreement with what macOS actually does.
    var launchAtLogin: LaunchAtLoginState {
        launchAtLoginManager.state
    }

    /// Set when a registration attempt fails, so the UI can explain instead of
    /// silently snapping the toggle back.
    private(set) var launchAtLoginError: String?

    var forexFavourites: [String] {
        didSet {
            guard oldValue != forexFavourites else { return }
            defaults.set(forexFavourites, forKey: DefaultsKey.forexFavourites)
        }
    }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let weatherProvider: any WeatherProviding
    @ObservationIgnored private let forexProvider: any ForexProviding
    @ObservationIgnored private let launchAtLoginManager: any LaunchAtLoginManaging
    @ObservationIgnored private let notificationScheduler: any NotificationScheduling
    @ObservationIgnored private var midnightTask: Task<Void, Never>?

    var cards: [DashboardCard] { [weatherCard, forexCard] }

    /// Whichever favourite leads the list; the card has room for one.
    var headlineRate: ForexRate? {
        guard let forex else { return nil }
        return forex.rates(for: forexFavourites).first ?? forex.rate(for: "USD")
    }

    var favouriteRates: [ForexRate] {
        forex?.rates(for: forexFavourites) ?? []
    }

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
        forexProvider: any ForexProviding = NRBForexProvider(),
        launchAtLoginManager: any LaunchAtLoginManaging = SystemLaunchAtLogin(),
        notificationScheduler: any NotificationScheduling = SystemNotificationScheduler(),
        autoLoadWeather: Bool = true
    ) {
        self.defaults = defaults
        self.weatherProvider = weatherProvider
        self.forexProvider = forexProvider
        self.launchAtLoginManager = launchAtLoginManager
        self.notificationScheduler = notificationScheduler
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
        forexFavourites = defaults.stringArray(forKey: DefaultsKey.forexFavourites)
            ?? ForexCurrency.defaultFavourites
        showsDockIcon = defaults.bool(forKey: DefaultsKey.showsDockIcon)
        notificationOptions = NotificationOptions(
            eveOfPublicHoliday: defaults.bool(forKey: DefaultsKey.notifyHolidayEve),
            eveOfFestival: defaults.bool(forKey: DefaultsKey.notifyFestivalEve)
        )

        let fallbackDate = NepaliDate(year: 2083, month: 4, day: 30)
        let resolvedToday = (try? BikramSambatCalendar.nepaliDate(from: now)) ?? fallbackDate
        today = resolvedToday
        selectedMonth = (try? BikramSambatCalendar.month(containing: resolvedToday, today: resolvedToday))
            ?? CalendarMonth(firstDate: fallbackDate, title: "साउन २०८३", days: [])
        todayEvent = CalendarEventStore.events(year: resolvedToday.year, month: resolvedToday.month)[resolvedToday.day]
        upcomingEvents = UpcomingEventsService.events(from: resolvedToday)

        weatherFeed = RemoteFeed(
            subject: "weather",
            cacheKey: DefaultsKey.weatherCache(for: location),
            staleInterval: Self.weatherStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt
        ) { [weak self, weatherProvider] in
            // Resolved per request, not captured: the user can change city
            // between the feed being built and this running.
            guard let self else { throw CancellationError() }
            return try await weatherProvider.currentWeather(at: self.selectedWeatherLocation)
        }

        forexFeed = RemoteFeed(
            subject: "rates",
            cacheKey: DefaultsKey.forexCache,
            staleInterval: Self.forexStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            describeError: { error in
                (error as? ForexProviderError) == .noRatesPublished
                    ? "Nepal Rastra Bank has not published rates yet"
                    : nil
            }
        ) { [forexProvider] in
            try await forexProvider.latestRates()
        }

        scheduleMidnightRefresh()
        if autoLoadWeather {
            weatherFeed.startPeriodicRefresh()
            forexFeed.startPeriodicRefresh()
            Task { [weak self] in
                await self?.refreshWeatherIfStale()
                await self?.refreshForexIfStale()
            }
        }
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

    // MARK: - Notifications

    /// Reads the current permission without prompting, so Settings can explain
    /// a denial. Prompting happens only in `applyNotificationOptions`.
    func refreshNotificationAuthorization() async {
        notificationAuthorization = await notificationScheduler.authorization()
    }

    /// Recomputes the schedule from the bundled festival list. Safe to call
    /// repeatedly — the scheduler replaces Sajilo's requests rather than
    /// appending, and identifiers are stable per date.
    func rescheduleNotifications() async {
        guard notificationOptions.isAnyEnabled else {
            await notificationScheduler.cancelAll()
            return
        }
        guard notificationAuthorization == .authorized else { return }

        let planned = FestivalNotificationPlanner.plan(
            events: UpcomingEventsService.events(from: today, limit: FestivalNotificationPlanner.limit * 2),
            options: notificationOptions,
            now: .now
        )
        await notificationScheduler.replaceScheduled(with: planned)
    }

    /// PRD §9: the permission prompt appears only when the user switches a
    /// reminder on, never at launch and never when switching one off.
    private func applyNotificationOptions(wasEnabled: Bool) async {
        guard notificationOptions.isAnyEnabled else {
            await notificationScheduler.cancelAll()
            return
        }

        if !wasEnabled || notificationAuthorization == .notDetermined {
            notificationAuthorization = await notificationScheduler.authorization()
            if notificationAuthorization == .notDetermined {
                _ = await notificationScheduler.requestAuthorization()
                notificationAuthorization = await notificationScheduler.authorization()
            }
        }
        await rescheduleNotifications()
    }

    // MARK: - System integration

    /// Toggling this can fail — macOS refuses to register an app running from
    /// a temporary directory — so the result is reported rather than assumed.
    func setLaunchAtLogin(_ enabled: Bool) {
        do {
            try launchAtLoginManager.setEnabled(enabled)
            launchAtLoginError = nil
        } catch {
            launchAtLoginError = enabled
                ? "Could not enable launch at login. Move Sajilo to your Applications folder and try again."
                : "Could not disable launch at login. You can remove it in System Settings › General › Login Items."
        }
    }

    /// PRD §4.1: menu-bar-only by default, with the Dock icon behind a
    /// preference. `.accessory` also keeps AppKit from trying to restore a
    /// document window this app does not have.
    func applyActivationPolicy() {
        #if DEBUG
        // The debug preview window is unreachable from an accessory app, so
        // local builds stay regular whatever the preference says.
        NSApplication.shared.setActivationPolicy(.regular)
        #else
        NSApplication.shared.setActivationPolicy(showsDockIcon ? .regular : .accessory)
        #endif
    }

    // MARK: - Weather

    /// PRD §5.4 targets a refresh every 30–60 minutes.
    static let weatherStaleInterval: TimeInterval = 30 * 60

    func refreshWeatherIfStale() async {
        guard isWeatherEnabled else { return }
        await weatherFeed.refreshIfStale()
    }

    func refreshWeather() async {
        await weatherFeed.refresh()
    }

    // MARK: - Forex

    /// PRD §5.5 targets 6–12 hours. NRB publishes once a day, so refreshing
    /// harder than this adds load without adding information.
    static let forexStaleInterval: TimeInterval = 6 * 60 * 60

    func refreshForexIfStale() async {
        guard isForexEnabled else { return }
        await forexFeed.refreshIfStale()
    }

    func refreshForex() async {
        await forexFeed.refresh()
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
        Task { [weak self] in await self?.rescheduleNotifications() }
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
        selectedWeatherLocation = snapshot.location
        weatherFeed.seed(snapshot)
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

    private static let nepalCalendar = NepalTime.calendar

    private static let gregorianFormatter = NepalTime.displayFormatter("EEEE, MMMM d, yyyy")

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

    private var forexCard: DashboardCard {
        if let rate = headlineRate, let forex {
            return DashboardCard(
                id: "forex",
                kind: .forex,
                title: "\(rate.unitLabel) / NPR",
                primaryValue: rate.buyText,
                detail: "Buy · Sell \(rate.sellText)",
                symbol: "banknote.fill",
                freshness: Self.freshnessText(for: forex.sourceTimestamp)
            )
        }

        return DashboardCard(
            id: "forex",
            kind: .forex,
            title: "NPR rates",
            primaryValue: isForexLoading ? "Loading…" : "Unavailable",
            detail: forexError ?? "Tap to try again",
            symbol: "banknote",
            freshness: "Nepal Rastra Bank"
        )
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
