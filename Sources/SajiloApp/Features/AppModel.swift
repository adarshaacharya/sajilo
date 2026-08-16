import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    /// The Events route is a full forward-looking list, rather than the small
    /// dashboard preview. The horizon keeps its work bounded when calendar
    /// coverage is extended in a later data update.
    private static let upcomingEventLimit = 100
    private static let upcomingEventHorizonDays = 400

    enum MenuBarFormat: String, CaseIterable, Identifiable {
        case nepaliShort
        case nepaliLong
        case nepaliFlag
        case englishShort
        case numeric
        case custom

        var id: String { rawValue }

        /// Renders the format against a real date. The Settings picker shows
        /// each option applied to today, so what the user previews is exactly
        /// what lands in the menu bar.
        func title(for date: NepaliDate, numerals: NumeralStyle = .default) -> String {
            let day = numerals.string(from: date.day)
            let year = numerals.string(from: date.year)

            switch self {
            case .nepaliShort: return "\(day) \(date.nepaliMonthName)"
            case .nepaliLong: return "\(day) \(date.nepaliMonthName) \(year)"
            case .nepaliFlag: return "🇳🇵 \(day) \(date.nepaliMonthName) \(year)"
            case .englishShort: return "\(date.day) \(date.englishMonthName)"
            case .numeric: return numerals.slashedDate(date)
            case .custom: return "\(day) \(date.nepaliMonthName) \(year)"
            }
        }
    }

    private enum DefaultsKey {
        static let menuBarFormat = "menuBarFormat"
        static let customMenuBarShowsFlag = "customMenuBarShowsFlag"
        static let customMenuBarShowsYear = "customMenuBarShowsYear"
        static let appLanguage = "appLanguage"
        static let numeralStyle = "numeralStyle"
        static let weatherEnabled = "weatherEnabled"
        static let forexEnabled = "forexEnabled"
        static let weatherLocation = "weatherLocation"
        static let forexCache = "forexCache"
        static let forexFavourites = "forexFavourites"
        static let showsDockIcon = "showsDockIcon"
        static let notifyHolidayEve = "notifyHolidayEve"
        static let notifyFestivalEve = "notifyFestivalEve"
        static let newsEnabled = "newsEnabled"
        static let newsCache = "newsCache"
        static let bazarEnabled = "bazarEnabled"
        static let metalsCache = "metalsCache"
        static let fuelCache = "fuelCache"
        static let vegetableCache = "vegetableCache"
        static let vegetableFavourites = "vegetableFavourites"
        static let rashifalEnabled = "rashifalEnabled"
        static let rashifalCache = "rashifalCache"
        static let radioEnabled = "radioEnabled"
        static let radioCache = "radioCache"
        static let selectedRashi = "selectedRashi"

        /// Cached per location, so switching cities never shows one city's
        /// reading under another's name, and switching back keeps the old one.
        static func weatherCache(for location: WeatherLocation) -> String {
            "weatherCache.\(location.rawValue)"
        }
    }

    var selectedMenuBarFormat: MenuBarFormat {
        didSet { defaults.set(selectedMenuBarFormat.rawValue, forKey: DefaultsKey.menuBarFormat) }
    }

    /// The Custom menu-bar option starts with the full Nepali date, then lets
    /// people keep or remove the two pieces that matter most at a glance.
    var customMenuBarShowsFlag: Bool {
        didSet { defaults.set(customMenuBarShowsFlag, forKey: DefaultsKey.customMenuBarShowsFlag) }
    }

    var customMenuBarShowsYear: Bool {
        didSet { defaults.set(customMenuBarShowsYear, forKey: DefaultsKey.customMenuBarShowsYear) }
    }

    var appLanguage: AppLanguage {
        didSet { defaults.set(appLanguage.rawValue, forKey: DefaultsKey.appLanguage) }
    }

    /// PRD §5.10 numeral preference. Not a translation setting — month and
    /// weekday names stay Devanagari either way; this is only which digits
    /// the dates are drawn with.
    var numeralStyle: NumeralStyle {
        didSet { defaults.set(numeralStyle.rawValue, forKey: DefaultsKey.numeralStyle) }
    }

    var isWeatherEnabled: Bool {
        didSet { defaults.set(isWeatherEnabled, forKey: DefaultsKey.weatherEnabled) }
    }

    var isForexEnabled: Bool {
        didSet { defaults.set(isForexEnabled, forKey: DefaultsKey.forexEnabled) }
    }

    /// On by default, like the other modules. The popover stays calendar-first
    /// either way — news lives in its own route, never on the dashboard.
    var isNewsEnabled: Bool {
        didSet {
            guard oldValue != isNewsEnabled else { return }
            defaults.set(isNewsEnabled, forKey: DefaultsKey.newsEnabled)
            guard isNewsEnabled else { return }
            Task { [weak self] in await self?.refreshNewsIfStale() }
        }
    }

    /// Gold, silver, and fuel share one switch and one route: they are the
    /// same errand — what things cost today — and splitting them would put two
    /// more entries in a toolbar that is already full.
    var isBazarEnabled: Bool {
        didSet {
            guard oldValue != isBazarEnabled else { return }
            defaults.set(isBazarEnabled, forKey: DefaultsKey.bazarEnabled)
            guard isBazarEnabled else { return }
            Task { [weak self] in await self?.refreshBazarIfStale() }
        }
    }

    var isRashifalEnabled: Bool {
        didSet {
            guard oldValue != isRashifalEnabled else { return }
            defaults.set(isRashifalEnabled, forKey: DefaultsKey.rashifalEnabled)
            guard isRashifalEnabled else { return }
            Task { [weak self] in await self?.refreshRashifalIfStale() }
        }
    }

    var isRadioEnabled: Bool {
        didSet {
            guard oldValue != isRadioEnabled else { return }
            defaults.set(isRadioEnabled, forKey: DefaultsKey.radioEnabled)
            guard isRadioEnabled else {
                radioPlayer.stop()
                return
            }
            Task { [weak self] in await self?.refreshRadioIfStale() }
        }
    }

    /// Unset until the reader picks. Nepali rashi is normally the moon sign
    /// from a birth chart rather than the birth month, so it cannot be derived
    /// from a date — guessing would hand most people the wrong reading.
    var selectedRashi: RashiSign? {
        didSet {
            guard oldValue != selectedRashi else { return }
            defaults.set(selectedRashi?.rawValue, forKey: DefaultsKey.selectedRashi)
        }
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
    @ObservationIgnored private var newsFeed: RemoteFeed<NewsDigest>!
    @ObservationIgnored private var metalsFeed: RemoteFeed<MetalRateSnapshot>!
    @ObservationIgnored private var fuelFeed: RemoteFeed<FuelPriceSnapshot>!
    @ObservationIgnored private var vegetableFeed: RemoteFeed<VegetableMarketSnapshot>!
    @ObservationIgnored private var rashifalFeed: RemoteFeed<RashifalSnapshot>!
    @ObservationIgnored private var radioFeed: RemoteFeed<RadioDirectory>!

    var weather: WeatherSnapshot? { weatherFeed.value }
    var isWeatherLoading: Bool { weatherFeed.isLoading }
    var weatherError: String? { weatherFeed.errorMessage }
    var isWeatherStale: Bool { weatherFeed.isStale }

    var news: NewsDigest? { newsFeed.value }
    var isNewsLoading: Bool { newsFeed.isLoading }
    var newsError: String? { newsFeed.errorMessage }

    var metals: MetalRateSnapshot? { metalsFeed.value }
    var isMetalsLoading: Bool { metalsFeed.isLoading }
    var metalsError: String? { metalsFeed.errorMessage }

    var fuel: FuelPriceSnapshot? { fuelFeed.value }
    var isFuelLoading: Bool { fuelFeed.isLoading }
    var fuelError: String? { fuelFeed.errorMessage }

    var rashifal: RashifalSnapshot? { rashifalFeed.value }
    var isRashifalLoading: Bool { rashifalFeed.isLoading }
    var rashifalError: String? { rashifalFeed.errorMessage }

    var radio: RadioDirectory? { radioFeed.value }
    var isRadioLoading: Bool { radioFeed.isLoading }
    var radioError: String? { radioFeed.errorMessage }
    let radioPlayer: RadioPlayer

    /// The reader's own reading, once they have picked a sign.
    var myRashifal: Rashifal? {
        guard let selectedRashi else { return nil }
        return rashifal?.reading(for: selectedRashi)
    }

    /// Whether what is cached was written for the day it is being read on. The
    /// source publishes each morning, so a reading fetched yesterday is still
    /// on screen after midnight until the next refresh lands.
    var isRashifalFromToday: Bool {
        guard let published = rashifal?.publishedOn else { return true }
        return published == today
    }

    var vegetables: VegetableMarketSnapshot? { vegetableFeed.value }
    var isVegetablesLoading: Bool { vegetableFeed.isLoading }
    var vegetablesError: String? { vegetableFeed.errorMessage }

    /// The handful of items someone actually buys, pinned above the other
    /// ninety. Stored by the board's own name, which is the only stable key it
    /// publishes.
    var vegetableFavourites: [String] {
        didSet {
            guard oldValue != vegetableFavourites else { return }
            defaults.set(vegetableFavourites, forKey: DefaultsKey.vegetableFavourites)
        }
    }

    func toggleVegetableFavourite(_ name: String) {
        if let index = vegetableFavourites.firstIndex(of: name) {
            vegetableFavourites.remove(at: index)
        } else {
            vegetableFavourites.append(name)
        }
    }

    /// Favourites first, in the order they were pinned, then everything else in
    /// the board's own order.
    func vegetables(matching query: String) -> (pinned: [VegetablePrice], others: [VegetablePrice]) {
        let matches = vegetables?.matching(query) ?? []
        let pinned = vegetableFavourites.compactMap { name in
            matches.first { $0.name == name }
        }
        let others = matches.filter { !vegetableFavourites.contains($0.name) }
        return (pinned, others)
    }

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
        _ = launchAtLoginRevision
        return launchAtLoginManager.state
    }

    /// Invalidates Settings after a registration attempt. The system state is
    /// deliberately computed rather than stored, so it needs this lightweight
    /// observation token to redraw immediately after `register()` returns.
    private var launchAtLoginRevision = 0

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
    @ObservationIgnored private let newsProvider: any NewsProviding
    @ObservationIgnored private let metalProvider: any MetalRateProviding
    @ObservationIgnored private let fuelProvider: any FuelPriceProviding
    @ObservationIgnored private let vegetableProvider: any VegetableMarketProviding
    @ObservationIgnored private let rashifalProvider: any RashifalProviding
    @ObservationIgnored private let articleDates: ArticleDateStore
    @ObservationIgnored private let radioProvider: any RadioProviding
    @ObservationIgnored private let dayPlanStore: DayPlanStore
    @ObservationIgnored private var midnightTask: Task<Void, Never>?

    /// Personal, local-only plans. The model owns the observable snapshot;
    /// `DayPlanStore` only serializes it to JSON for the next launch.
    private(set) var dayPlans: [DayPlan]

    var cards: [DashboardCard] { [weatherCard, forexCard] }

    /// Whichever favourite leads the list; the card has room for one.
    var headlineRate: ForexRate? {
        guard let forex else { return nil }
        return forex.rates(for: forexFavourites).first ?? forex.rate(for: "USD")
    }

    /// Trend for the currency on the card, when the window holds enough
    /// movement to be worth drawing.
    var headlineTrend: [Double]? {
        guard let code = headlineRate?.currencyCode else { return nil }
        return forex?.trend(for: code)
    }

    var favouriteRates: [ForexRate] {
        forex?.rates(for: forexFavourites) ?? []
    }

    /// The soonest festival after today, used for the dashboard teaser.
    var nextEvent: UpcomingEvent? {
        upcomingEvents.first
    }

    /// The dashboard's actionable first item. Uses Nepal local time because a
    /// 9am plan should not be considered future just because the Mac happens
    /// to be in another time zone.
    var upNext: DashboardUpNext? {
        DashboardUpNext.make(
            plans: plans(on: today),
            events: upcomingEvents,
            now: .now
        )
    }

    var menuBarTitle: String {
        menuBarTitle(for: selectedMenuBarFormat)
    }

    func menuBarTitle(for format: MenuBarFormat) -> String {
        guard format == .custom else {
            return format.title(for: today, numerals: numeralStyle)
        }

        let day = numeralStyle.string(from: today.day)
        let year = numeralStyle.string(from: today.year)
        var parts: [String] = []
        if customMenuBarShowsFlag { parts.append("🇳🇵") }
        parts.append("\(day) \(today.nepaliMonthName)")
        if customMenuBarShowsYear { parts.append(year) }
        return parts.joined(separator: " ")
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

    /// Spoken form, used for the accessibility label where the weekday is not
    /// already conveyed by the Nepali one beside it.
    var gregorianDate: String {
        Self.gregorianFormatter.string(from: referenceDate)
    }

    /// Shown form. The weekday is dropped because the Nepali weekday sits on
    /// the same line — printing "आइतबार" and "Sunday" together is the same
    /// word twice.
    var gregorianDisplayDate: String {
        Self.gregorianDisplayFormatter.string(from: referenceDate)
    }

    /// Weekday without the "बार" suffix, for the narrow date tile where the
    /// full form would not fit.
    var nepaliWeekdayShort: String {
        Self.nepaliWeekdayShortNames[Self.nepalCalendar.component(.weekday, from: referenceDate) - 1]
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
        newsProvider: any NewsProviding = RSSNewsProvider(),
        metalProvider: any MetalRateProviding = FenegosidaMetalProvider(),
        fuelProvider: any FuelPriceProviding = NOCFuelProvider(),
        vegetableProvider: any VegetableMarketProviding = KalimatiMarketProvider(),
        rashifalProvider: any RashifalProviding = HamroPatroRashifalProvider(),
        articleDateResolver: (any ArticleDateResolving)? = nil,
        radioProvider: any RadioProviding = RatopatiRadioProvider(),
        dayPlanStore: DayPlanStore? = nil,
        autoLoadWeather: Bool = true
    ) {
        let resolvedDayPlanStore = dayPlanStore ?? DayPlanStore(defaults: defaults)
        self.defaults = defaults
        self.weatherProvider = weatherProvider
        self.forexProvider = forexProvider
        self.launchAtLoginManager = launchAtLoginManager
        self.notificationScheduler = notificationScheduler
        self.newsProvider = newsProvider
        self.metalProvider = metalProvider
        self.fuelProvider = fuelProvider
        self.vegetableProvider = vegetableProvider
        self.rashifalProvider = rashifalProvider
        articleDates = ArticleDateStore(
            defaults: defaults,
            resolver: articleDateResolver ?? AnnapurnaArticleDateResolver()
        )
        self.radioProvider = radioProvider
        radioPlayer = RadioPlayer(provider: radioProvider, defaults: defaults)
        self.dayPlanStore = resolvedDayPlanStore
        dayPlans = resolvedDayPlanStore.load()
        referenceDate = now

        selectedMenuBarFormat = defaults.string(forKey: DefaultsKey.menuBarFormat)
            .flatMap(MenuBarFormat.init(rawValue:)) ?? .nepaliShort
        customMenuBarShowsFlag = defaults.object(forKey: DefaultsKey.customMenuBarShowsFlag) as? Bool ?? true
        customMenuBarShowsYear = defaults.object(forKey: DefaultsKey.customMenuBarShowsYear) as? Bool ?? true
        appLanguage = defaults.string(forKey: DefaultsKey.appLanguage)
            .flatMap(AppLanguage.init(rawValue:)) ?? .mixed
        numeralStyle = defaults.string(forKey: DefaultsKey.numeralStyle)
            .flatMap(NumeralStyle.init(rawValue:)) ?? .default
        // `object(forKey:)` distinguishes "never set" from "set to false", so a
        // user who disables a card keeps it disabled across relaunches.
        isWeatherEnabled = defaults.object(forKey: DefaultsKey.weatherEnabled) as? Bool ?? true
        isForexEnabled = defaults.object(forKey: DefaultsKey.forexEnabled) as? Bool ?? true
        // `object(forKey:)`, not `bool(forKey:)`: the latter returns false for
        // "never set", which is indistinguishable from "the user turned it
        // off" and would silently re-enable it on every launch.
        isNewsEnabled = defaults.object(forKey: DefaultsKey.newsEnabled) as? Bool ?? true
        isBazarEnabled = defaults.object(forKey: DefaultsKey.bazarEnabled) as? Bool ?? true
        let location = defaults.string(forKey: DefaultsKey.weatherLocation)
            .flatMap(WeatherLocation.init(rawValue:)) ?? .default
        selectedWeatherLocation = location
        forexFavourites = defaults.stringArray(forKey: DefaultsKey.forexFavourites)
            ?? ForexCurrency.defaultFavourites
        vegetableFavourites = defaults.stringArray(forKey: DefaultsKey.vegetableFavourites) ?? []
        isRashifalEnabled = defaults.object(forKey: DefaultsKey.rashifalEnabled) as? Bool ?? true
        isRadioEnabled = defaults.object(forKey: DefaultsKey.radioEnabled) as? Bool ?? true
        selectedRashi = defaults.string(forKey: DefaultsKey.selectedRashi)
            .flatMap(RashiSign.init(rawValue:))
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
        upcomingEvents = UpcomingEventsService.events(
            from: resolvedToday,
            limit: Self.upcomingEventLimit,
            horizonDays: Self.upcomingEventHorizonDays
        )

        weatherFeed = RemoteFeed(
            subject: "weather",
            cacheKey: DefaultsKey.weatherCache(for: location),
            // v2: snapshots now carry air quality. A v1 entry decodes fine with
            // `airQuality` nil, so the section would stay missing until the
            // cache aged out rather than appearing on next open.
            cacheVersion: 2,
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

        newsFeed = RemoteFeed(
            subject: "news",
            cacheKey: DefaultsKey.newsCache,
            // v2: sources stopped following the app language.
            // v3: the whole feed is kept rather than the first eight, so a v2
            // entry would leave the list stuck at eight until it aged out.
            // v4: four English papers joined, and items carry date precision. A
            // v3 entry would show neither until it aged out.
            cacheVersion: 4,
            staleInterval: Self.newsStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt
        ) { [weak self, newsProvider] in
            let digest = await newsProvider.headlines(
                from: NewsSource.active,
                limit: Self.newsHeadlineLimit
            )
            // Annapurna Post's feed carries no dates. Recovering them is a
            // second, heavier network step against article pages, so it runs
            // after the digest is assembled and is bounded and cached — a
            // headline never waits on it, and a story is fetched once ever.
            guard let self else { return digest }
            return await self.articleDates.resolvingDates(in: digest)
        }

        metalsFeed = RemoteFeed(
            subject: "gold and silver rates",
            cacheKey: DefaultsKey.metalsCache,
            staleInterval: Self.metalsStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            describeError: { error in
                (error as? MetalProviderError) == .noRatesPublished
                    ? "The Federation has not published today's rate yet"
                    : nil
            }
        ) { [metalProvider] in
            try await metalProvider.latestRates()
        }

        fuelFeed = RemoteFeed(
            subject: "fuel prices",
            cacheKey: DefaultsKey.fuelCache,
            staleInterval: Self.fuelStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            describeError: { error in
                (error as? FuelProviderError) == .tableNotFound
                    ? "Nepal Oil Corporation's price table could not be read"
                    : nil
            }
        ) { [fuelProvider] in
            try await fuelProvider.latestPrices()
        }

        vegetableFeed = RemoteFeed(
            subject: "vegetable prices",
            cacheKey: DefaultsKey.vegetableCache,
            staleInterval: Self.vegetableStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            describeError: { error in
                (error as? MarketProviderError) == .tableNotFound
                    ? "The Kalimati board has not posted today's rates yet"
                    : nil
            }
        ) { [vegetableProvider] in
            try await vegetableProvider.latestPrices()
        }

        rashifalFeed = RemoteFeed(
            subject: "rashifal",
            cacheKey: DefaultsKey.rashifalCache,
            staleInterval: Self.rashifalStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt,
            describeError: { error in
                if case .incompleteReading = error as? RashifalProviderError {
                    return "Today's rashifal could not be read from the source"
                }
                return nil
            }
        ) { [rashifalProvider] in
            try await rashifalProvider.todaysRashifal()
        }

        radioFeed = RemoteFeed(
            subject: "radio stations",
            cacheKey: DefaultsKey.radioCache,
            staleInterval: Self.radioStaleInterval,
            defaults: defaults,
            fetchedAt: \.fetchedAt
        ) { [radioProvider] in
            try await radioProvider.stations()
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

    // MARK: - Day plans

    func plans(on date: NepaliDate) -> [DayPlan] {
        DayPlan.ordered(dayPlans.filter { $0.occurs(on: date) })
    }

    func hasDayPlan(on date: NepaliDate) -> Bool {
        dayPlans.contains { $0.occurs(on: date) }
    }

    /// Saves a short calendar-attached plan locally. A reminder is optional;
    /// only adding one may request macOS notification permission.
    func saveDayPlan(_ plan: DayPlan) {
        if let index = dayPlans.firstIndex(where: { $0.id == plan.id }) {
            dayPlans[index] = plan
        } else {
            dayPlans.append(plan)
        }
        dayPlanStore.save(dayPlans)

        Task { [weak self] in
            guard let self else { return }
            await self.requestPlannerPermissionIfNeeded(for: plan)
            await self.rescheduleNotifications()
        }
    }

    func deleteDayPlan(id: DayPlan.ID) {
        dayPlans.removeAll { $0.id == id }
        dayPlanStore.save(dayPlans)
        Task { [weak self] in await self?.rescheduleNotifications() }
    }

    // MARK: - Notifications

    /// Reads the current permission without prompting, so Settings can explain
    /// a denial. Prompting happens only in `applyNotificationOptions`.
    func refreshNotificationAuthorization() async {
        notificationAuthorization = await notificationScheduler.authorization()
        await rescheduleNotifications()
    }

    /// Recomputes the schedule from the bundled festival list. Safe to call
    /// repeatedly — the scheduler replaces Sajilo's requests rather than
    /// appending, and identifiers are stable per date.
    func rescheduleNotifications() async {
        let festivalReminders = notificationOptions.isAnyEnabled
            ? FestivalNotificationPlanner.plan(
                events: UpcomingEventsService.events(from: today, limit: FestivalNotificationPlanner.limit * 2),
                options: notificationOptions,
                now: .now
            )
            : []
        let planReminders = DayPlanReminderPlanner.plan(entries: dayPlans, now: .now)
        let notifications = festivalReminders + planReminders

        guard !notifications.isEmpty else {
            await notificationScheduler.cancelAll()
            return
        }
        guard notificationAuthorization == .authorized else { return }
        await notificationScheduler.replaceScheduled(with: notifications)
    }

    /// PRD §9: the permission prompt appears only when the user switches a
    /// reminder on, never at launch and never when switching one off.
    private func applyNotificationOptions(wasEnabled: Bool) async {
        guard notificationOptions.isAnyEnabled else {
            await rescheduleNotifications()
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

    private func requestPlannerPermissionIfNeeded(for plan: DayPlan) async {
        guard plan.time != nil, plan.reminder != nil else { return }
        notificationAuthorization = await notificationScheduler.authorization()
        guard notificationAuthorization == .notDetermined else { return }
        _ = await notificationScheduler.requestAuthorization()
        notificationAuthorization = await notificationScheduler.authorization()
    }

    // MARK: - System integration

    /// Toggling this can fail, so the result is reported rather than assumed.
    func setLaunchAtLogin(_ enabled: Bool) {
        do {
            try launchAtLoginManager.setEnabled(enabled)
            launchAtLoginError = nil
        } catch {
            launchAtLoginError = enabled
                ? "Could not enable launch at login. \(error.localizedDescription)"
                : "Could not disable launch at login. You can remove it in System Settings › General › Login Items."
        }
        launchAtLoginRevision &+= 1
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

    // MARK: - Bazar

    /// The Federation posts once a day, usually mid-morning. Checking a few
    /// times a day catches it without hammering a source that rarely moves.
    static let metalsStaleInterval: TimeInterval = 4 * 60 * 60
    /// NOC revises roughly twice a month, so this only needs to notice the day
    /// a revision lands.
    static let fuelStaleInterval: TimeInterval = 12 * 60 * 60
    /// Kalimati posts one table per trading day, in the morning.
    static let vegetableStaleInterval: TimeInterval = 6 * 60 * 60

    /// Both refresh together: they share one route, so a user who opens it
    /// expects both halves to be current.
    func refreshBazarIfStale() async {
        guard isBazarEnabled else { return }
        async let rates: Void = metalsFeed.refreshIfStale()
        async let prices: Void = fuelFeed.refreshIfStale()
        async let produce: Void = vegetableFeed.refreshIfStale()
        _ = await (rates, prices, produce)
    }

    func refreshBazar() async {
        async let rates: Void = metalsFeed.refresh()
        async let prices: Void = fuelFeed.refresh()
        async let produce: Void = vegetableFeed.refresh()
        _ = await (rates, prices, produce)
    }

    // MARK: - Rashifal

    /// Published once each morning, so this only needs to notice the new day's
    /// posting rather than poll.
    static let rashifalStaleInterval: TimeInterval = 6 * 60 * 60

    func refreshRashifalIfStale() async {
        guard isRashifalEnabled else { return }
        await rashifalFeed.refreshIfStale()
    }

    func refreshRashifal() async {
        await rashifalFeed.refresh()
    }

    // MARK: - News

    // MARK: - Radio

    /// Ratopati's catalogue changes slowly; a daily cache keeps the radio
    /// screen instant without treating its directory as a polling API.
    static let radioStaleInterval: TimeInterval = 24 * 60 * 60

    func refreshRadioIfStale() async {
        guard isRadioEnabled else { return }
        await radioFeed.refreshIfStale()
    }

    func refreshRadio() async {
        await radioFeed.refresh()
    }

    /// News moves faster than rates but this is a menu-bar utility, not a
    /// reader; half an hour is plenty and keeps the feeds unbothered.
    static let newsStaleInterval: TimeInterval = 30 * 60
    /// Everything the five feeds carry between them — about 135 headlines.
    ///
    /// There is no pagination to request: RSS returns a fixed snapshot, so this
    /// fetches the whole set once and the view reveals it progressively. The
    /// ceiling exists to bound the cache, not to page.
    static let newsHeadlineLimit = 150

    func refreshNewsIfStale() async {
        guard isNewsEnabled else { return }
        await newsFeed.refreshIfStale()
    }

    func refreshNews() async {
        await newsFeed.refresh()
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
        upcomingEvents = UpcomingEventsService.events(
            from: today,
            limit: Self.upcomingEventLimit,
            horizonDays: Self.upcomingEventHorizonDays
        )
        Task { [weak self] in
            await self?.rescheduleNotifications()
            // Yesterday's reading is still cached at this point and would keep
            // showing until something asked for a new one. Nothing else here
            // is day-scoped in that way — prices stand until the source
            // revises them, but a rashifal expires at midnight by definition.
            await self?.refreshRashifal()
        }
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

    private static let nepaliWeekdayShortNames = [
        "आइत", "सोम", "मंगल", "बुध", "बिही", "शुक्र", "शनि"
    ]

    private static let nepaliWeekdayNames = [
        "आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"
    ]

    private static let nepalCalendar = NepalTime.calendar

    private static let gregorianFormatter = NepalTime.displayFormatter("EEEE, MMMM d, yyyy")
    private static let gregorianDisplayFormatter = NepalTime.displayFormatter("d MMMM yyyy")

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
