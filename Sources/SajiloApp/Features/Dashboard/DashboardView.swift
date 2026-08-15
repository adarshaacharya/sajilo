import AppKit
import SwiftUI

struct DashboardView: View {
    let model: AppModel
    @State private var route: DashboardRoute = .dashboard
    /// Kept after navigating back so the detail layer can animate out with its
    /// content intact instead of blanking mid-transition.
    @State private var selectedDate: NepaliDate?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isShowingDayDetail: Bool {
        if case .dayDetail = route { return true }
        return false
    }

    var body: some View {
        // Both routes stay in the hierarchy rather than being swapped by an
        // `if`. The popover then takes the height of the taller one and holds
        // it, instead of snapping to a new size mid-transition — which is what
        // makes a menu-bar panel feel unstable.
        ZStack(alignment: .top) {
            dashboard
                .modifier(RouteLayer(isActive: route == .dashboard, edge: -1, reduceMotion: reduceMotion))

            DateConverterView(onBack: { navigate(to: .dashboard) })
                .modifier(RouteLayer(isActive: route == .converter, edge: 1, reduceMotion: reduceMotion))

            // Mounted only once a day has been picked, so the popover does not
            // pay for a detail view nobody has opened yet.
            if let selectedDate {
                DayDetailView(date: selectedDate, onBack: { navigate(to: .dashboard) })
                    .modifier(RouteLayer(isActive: isShowingDayDetail, edge: 1, reduceMotion: reduceMotion))
            }

            UpcomingEventsView(
                events: model.upcomingEvents,
                onBack: { navigate(to: .dashboard) },
                onSelectDate: select(_:)
            )
            .modifier(RouteLayer(isActive: route == .upcoming, edge: 1, reduceMotion: reduceMotion))

            SettingsView(model: model, onBack: { navigate(to: .dashboard) })
                .modifier(RouteLayer(isActive: route == .settings, edge: 1, reduceMotion: reduceMotion))

            WeatherDetailView(
                model: model,
                isActive: route == .weather,
                onBack: { navigate(to: .dashboard) }
            )
            .modifier(RouteLayer(isActive: route == .weather, edge: 1, reduceMotion: reduceMotion))
        }
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
        // PRD §5.4: refresh on popover open when the cached reading is stale.
        // `MenuBarExtra` builds this view each time the panel opens, so the
        // task runs per open and no-ops while the cache is warm.
        .task { await model.refreshWeatherIfStale() }
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: route)
        // Escape backs out of a route before the system closes the popover.
        .onExitCommand {
            guard route != .dashboard else { return }
            navigate(to: .dashboard)
        }
    }

    private var dashboard: some View {
        VStack(spacing: 0) {
            DateHeaderView(model: model, openSettings: { navigate(to: .settings) })
            MonthCalendarView(model: model, onSelectDate: select(_:))
                .cardSection()
                .padding(.horizontal, Theme.Space.m)
                .padding(.top, Theme.Space.m)
            VStack(spacing: Theme.Space.s) {
                if let nextEvent = model.nextEvent {
                    NextEventRow(event: nextEvent) { navigate(to: .upcoming) }
                }
                DashboardCardsView(
                    cards: model.visibleCards,
                    weather: model.weather,
                    // Paused unless the dashboard itself is showing, so the
                    // card stops animating behind the other routes.
                    isActive: route == .dashboard,
                    openWeather: { navigate(to: .weather) }
                )
            }
            .padding(.horizontal, Theme.Space.m)
            .padding(.vertical, Theme.Space.m)

            ActionBarView(
                openUpcoming: { navigate(to: .upcoming) },
                openConverter: { navigate(to: .converter) }
            )
        }
        .accessibilityLabel("Sajilo dashboard")
    }

    private func navigate(to destination: DashboardRoute) {
        route = destination
    }

    private func select(_ date: NepaliDate) {
        selectedDate = date
        navigate(to: .dayDetail(date))
    }
}

private enum DashboardRoute: Equatable {
    case dashboard
    case converter
    case dayDetail(NepaliDate)
    case upcoming
    case settings
    case weather
}

/// Presents one route of the popover. The inactive layer stays mounted so the
/// container keeps a constant height, but is pushed aside, faded out, and taken
/// out of both hit-testing and the accessibility tree.
private struct RouteLayer: ViewModifier {
    let isActive: Bool
    /// -1 exits to the leading edge, 1 to the trailing edge.
    let edge: CGFloat
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .opacity(isActive ? 1 : 0)
            .offset(x: isActive || reduceMotion ? 0 : edge * 28)
            // `disabled` rather than `allowsHitTesting`: the hidden layer keeps
            // real text fields, and only disabling takes them out of the
            // keyboard focus chain as well as out of the way of the pointer.
            .disabled(!isActive)
            .accessibilityHidden(!isActive)
    }
}

// MARK: - Header

/// Today's date, the popover's anchor. The BS day is the single largest
/// element on screen; everything else is supporting detail (PRD §4.2).
private struct DateHeaderView: View {
    let model: AppModel
    let openSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s) {
                // Deliberately not the accent. At 40pt this is already the
                // largest element on the surface, so tinting it too says
                // "today" twice and leaves the accent with nothing to mark.
                Text(NepaliNumerals.string(from: model.today.day))
                    .font(.nepali(Theme.Metric.heroNumeral, weight: .bold))
                    .foregroundStyle(.primary)

                VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                    Text("\(model.today.nepaliMonthName) \(NepaliNumerals.string(from: model.today.year))")
                        .font(.nepali(16, weight: .semibold))
                    Text(model.nepaliWeekday)
                        .font(.nepali(12))
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            Text(model.gregorianDate)
                .font(.caption)
                .tracking(0.4)
                .foregroundStyle(.secondary)

            if let summary = todaySummary {
                Text(summary)
                    .font(.nepali(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        // Grouped before the overlay is added: `.combine` collapses everything
        // beneath it into a single element, so a settings button added earlier
        // would stop being reachable as its own control under VoiceOver.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Today: \(model.nepaliWeekday), \(model.today.day) \(model.today.englishMonthName) \(model.today.year). \(model.gregorianDate)."
                + (todaySummary.map { " \($0)." } ?? "")
        )
        .routeHeader()
        .overlay(alignment: .topTrailing) {
            Button(action: openSettings) {
                Image(systemName: "gearshape")
            }
            .buttonStyle(IconButtonStyle())
            .padding(Theme.Space.s)
            .accessibilityLabel("Open Settings")
        }
    }

    /// Tithi and festival for today, joined into one line. Both come from the
    /// bundled dataset, so nothing is inferred.
    private var todaySummary: String? {
        let parts = [model.todayEvent?.tithi, model.todayEvent?.name].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Calendar

private struct MonthCalendarView: View {
    let model: AppModel
    let onSelectDate: (NepaliDate) -> Void

    @State private var isMovingForward = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let weekdaySymbols = ["आ", "सो", "मं", "बु", "बि", "शु", "श"]
    private static let columns = Array(repeating: GridItem(.flexible(), spacing: Theme.Space.xs), count: 7)
    /// Six rows covers the widest case (six leading blanks plus a 32-day
    /// month), so the popover keeps a stable height while navigating months.
    private static let gridHeight = (Theme.Metric.dayCell * 6) + (Theme.Space.xs * 5)

    var body: some View {
        VStack(spacing: Theme.Space.s) {
            header

            HStack(spacing: Theme.Space.xs) {
                ForEach(Array(Self.weekdaySymbols.enumerated()), id: \.offset) { index, symbol in
                    Text(symbol)
                        .font(.nepali(11, weight: .semibold))
                        .foregroundStyle(index == 6 ? AnyShapeStyle(Theme.Palette.holiday) : AnyShapeStyle(.secondary))
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
            }

            LazyVGrid(columns: Self.columns, spacing: Theme.Space.xs) {
                ForEach(model.selectedMonth.days) { day in
                    CalendarDayView(day: day, onSelect: onSelectDate)
                }
            }
            .frame(height: Self.gridHeight, alignment: .top)
            // A new identity per month is what lets the grid transition as a
            // unit rather than having 30-odd cells animate independently.
            .id(model.selectedMonth.firstDate)
            .transition(pushTransition)
            .clipped()

            if model.isShowingProvisionalYear {
                Label("Provisional — not yet officially published", systemImage: "exclamationmark.circle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
            }
        }
        .focusable()
        .focused($isFocused)
        // AppKit's default focus ring lands on the focusable region rather than
        // the card, so it wrapped the header and first row only and read as a
        // rendering fault. The ring is replaced below with one that follows the
        // card — keyboard users still get an indicator, it just fits.
        .focusEffectDisabled()
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.card)
                .strokeBorder(Theme.Palette.brand, lineWidth: 1.5)
                .padding(-Theme.Space.m)
                .opacity(isFocused ? 0.55 : 0)
        }
        .animation(.easeOut(duration: 0.12), value: isFocused)
        .onKeyPress(.leftArrow) {
            move(by: -1)
            return .handled
        }
        .onKeyPress(.rightArrow) {
            move(by: 1)
            return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Month calendar for \(model.selectedMonth.title)")
    }

    /// Slides the outgoing month out the way the user is travelling and brings
    /// the new one in behind it, so the direction of navigation is legible.
    private var pushTransition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .asymmetric(
            insertion: .move(edge: isMovingForward ? .trailing : .leading).combined(with: .opacity),
            removal: .move(edge: isMovingForward ? .leading : .trailing).combined(with: .opacity)
        )
    }

    private func move(by amount: Int) {
        isMovingForward = amount > 0
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) {
            model.moveMonth(by: amount)
        }
    }

    private func jumpToToday() {
        isMovingForward = model.selectedMonth.firstDate < model.today
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) {
            model.jumpToToday()
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.xs) {
            Button("Previous month", systemImage: "chevron.left") {
                move(by: -1)
            }
            .labelStyle(.iconOnly)

            Spacer(minLength: 0)

            Text(model.selectedMonth.title)
                .font(.nepali(15, weight: .semibold))
                .id(model.selectedMonth.firstDate)
                .transition(.opacity)

            Spacer(minLength: 0)

            // Kept in the layout while disabled so the month title does not
            // shift as the user navigates away from the current month.
            Button("Jump to today", systemImage: "smallcircle.filled.circle") {
                jumpToToday()
            }
            .labelStyle(.iconOnly)
            .disabled(model.isShowingCurrentMonth)
            .opacity(model.isShowingCurrentMonth ? 0 : 1)

            Button("Next month", systemImage: "chevron.right") {
                move(by: 1)
            }
            .labelStyle(.iconOnly)
        }
        .buttonStyle(IconButtonStyle())
    }
}

private struct CalendarDayView: View {
    let day: CalendarDay
    let onSelect: (NepaliDate) -> Void

    @State private var isHovering = false

    var body: some View {
        if let date = day.date {
            Button {
                onSelect(date)
            } label: {
                VStack(spacing: 0) {
                    Text(NepaliNumerals.string(from: date.day))
                        .font(.nepali(14, weight: day.isToday ? .semibold : .regular))
                    if let adDay = day.adDay {
                        Text(verbatim: "\(adDay)")
                            .font(.system(size: 9))
                            .opacity(0.75)
                    }
                    if day.eventName != nil {
                        // Roughly a third of days carry a festival, so an
                        // accent dot on each would repaint the whole grid and
                        // undo the point of demoting the accent. The marker
                        // inherits the cell's own colour instead.
                        Circle()
                            .fill(.secondary)
                            .frame(width: 3, height: 3)
                            .opacity(day.isToday ? 0.9 : 0.55)
                            .accessibilityHidden(true)
                    }
                }
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, minHeight: Theme.Metric.dayCell)
                .background(background, in: .rect(cornerRadius: Theme.Radius.day))
            }
            .buttonStyle(.plain)
            .onHover { isHovering = $0 }
            .animation(.easeOut(duration: 0.12), value: isHovering)
            .accessibilityLabel(accessibilityDescription(for: date))
            .accessibilityHint("Open date details")
            .accessibilityAddTraits(day.isToday ? .isSelected : [])
        } else {
            Color.clear
                .frame(height: Theme.Metric.dayCell)
                .accessibilityHidden(true)
        }
    }

    /// Built in steps: the type-checker times out on a single concatenated
    /// expression with this many optional branches.
    private func accessibilityDescription(for date: NepaliDate) -> String {
        var parts: [String] = ["\(date.day) \(date.englishMonthName)"]
        if let tithi = day.tithi { parts.append(tithi) }
        if let eventName = day.eventName { parts.append(eventName) }
        if day.isHoliday { parts.append("public holiday") }
        return parts.joined(separator: ", ")
    }

    private var foreground: AnyShapeStyle {
        if day.isToday {
            AnyShapeStyle(Theme.Palette.onBrand)
        } else if day.isHoliday {
            AnyShapeStyle(Theme.Palette.holiday)
        } else {
            AnyShapeStyle(.primary)
        }
    }

    private var background: Color {
        if day.isToday {
            Theme.Palette.brand
        } else if isHovering {
            Theme.Palette.hover
        } else {
            .clear
        }
    }
}

// MARK: - Cards

private struct DashboardCardsView: View {
    let cards: [DashboardCard]
    let weather: WeatherSnapshot?
    let isActive: Bool
    let openWeather: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(spacing: Theme.Space.m) {
                ForEach(cards) { card in
                    DashboardCardView(card: card, weather: weather, isActive: isActive, openWeather: openWeather)
                }
            }

            if let weatherCard = cards.first(where: { card in
                if case .weather = card.kind { return true }
                return false
            }) {
                HStack(spacing: Theme.Space.xs) {
                    Text(weatherCard.freshness)
                    Spacer(minLength: 0)
                    Link("Open-Meteo", destination: URL(string: "https://open-meteo.com/")!)
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            } else if let freshness = cards.first?.freshness {
                Text(freshness)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}

private struct DashboardCardView: View {
    let card: DashboardCard
    let weather: WeatherSnapshot?
    let isActive: Bool
    let openWeather: () -> Void

    var body: some View {
        switch card.kind {
        case .weather:
            Button(action: openWeather) {
                content
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(card.title), \(card.primaryValue). \(card.detail). \(card.freshness)")
            .accessibilityHint("Open the weather forecast")
        case .forex:
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(card.title), \(card.primaryValue). \(card.detail). \(card.freshness)")
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(spacing: Theme.Space.xs) {
                Image(systemName: card.symbol)
                    .font(.system(size: 11))
                    .foregroundStyle(card.kind.tint)
                    .accessibilityHidden(true)
                Text(card.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(card.primaryValue)
                .font(.title3.weight(.semibold))

            Text(card.detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
        .background(atmosphere)
        .cardSection(padding: Theme.Space.s)
    }

    /// A miniature of the detail hero: a faint sky wash so time of day reads at
    /// a glance, plus the same precipitation at a fraction of the density.
    ///
    /// Kept deliberately low-contrast — the card sits next to the calendar, and
    /// the popover should stay calm. Text keeps its normal colours rather than
    /// going white, so nothing here can hurt legibility.
    @ViewBuilder
    private var atmosphere: some View {
        if card.kind == .weather, let weather {
            let phase = SkyPhase.current(sunrise: weather.sunrise, sunset: weather.sunset)

            ZStack {
                LinearGradient(sky: phase)
                    .opacity(0.16)

                WeatherAtmosphereView(
                    condition: weather.condition,
                    phase: phase,
                    isActive: isActive,
                    tint: Theme.Palette.particle,
                    densityScale: 0.16
                )
            }
            .clipShape(.rect(cornerRadius: Theme.Radius.card))
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Actions

private struct ActionBarView: View {
    let openUpcoming: () -> Void
    let openConverter: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button("Festivals", systemImage: "sparkles", action: openUpcoming)
            Button("Convert", systemImage: "arrow.left.arrow.right", action: openConverter)
            Button("Tools", systemImage: "wrench.and.screwdriver") {}
            Button("Quit", systemImage: "power") {
                NSApplication.shared.terminate(nil)
            }
        }
        .buttonStyle(ToolbarActionStyle())
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(.bar)
    }
}

// MARK: - Previews

#if DEBUG
private func previewDate(year: Int, month: Int, day: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
    return calendar.date(from: DateComponents(year: year, month: month, day: day))!
}

#Preview("Settings route") {
    let model = AppModel.preview(now: previewDate(year: 2026, month: 8, day: 15))
    return SettingsView(model: model, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}

#Preview("Dashboard") {
    DashboardView(model: .preview(now: previewDate(year: 2026, month: 8, day: 15)))
}

/// The month calendar has to survive a six-row month without changing height;
/// Shrawan 2083 is the case that forced the fixed grid.
#Preview("Six-row month") {
    DashboardView(model: .preview(now: previewDate(year: 2026, month: 7, day: 17)))
}

/// Renders the provisional banner, which only appears past BS 2084.
#Preview("Provisional year") {
    let model = AppModel.preview(now: previewDate(year: 2026, month: 8, day: 15))
    model.moveMonth(by: 24)
    return DashboardView(model: model)
}

#Preview("Converter") {
    DateConverterView(onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}

/// A day carrying a festival, tithi, and holiday flag from the bundled data.
#Preview("Day detail") {
    DayDetailView(date: NepaliDate(year: 2083, month: 4, day: 1), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}

/// A day the source grid truncated, so it has no event at all.
#Preview("Day detail — no event") {
    DayDetailView(date: NepaliDate(year: 2083, month: 4, day: 31), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}
#endif

#if DEBUG
// MARK: - Skin comparison
//
// One preview per skin so the three directions can be judged side by side
// rather than described. `Theme.skin` is set before the view is built.

@MainActor
private func skinnedDashboard(_ skin: Theme.Skin) -> some View {
    Theme.skin = skin
    return DashboardView(model: .preview(now: previewDate(year: 2026, month: 8, day: 15)))
}

#Preview("Skin — Himalayan Dusk") {
    skinnedDashboard(.himalayanDusk)
}

#Preview("Skin — Ink & Paper") {
    skinnedDashboard(.inkAndPaper)
}

#Preview("Skin — Mac Native") {
    skinnedDashboard(.macNative)
}
#endif
