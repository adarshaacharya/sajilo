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

    private var startsAddingPlan: Bool {
        if case let .dayDetail(_, startAddingPlan) = route {
            return startAddingPlan
        }
        return false
    }

    var body: some View {
        // Both routes stay in the hierarchy rather than being swapped by an
        // `if`. The popover then takes the height of the taller one and holds
        // it, instead of snapping to a new size mid-transition — which is what
        // makes a menu-bar panel feel unstable.
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                dashboard
                    .modifier(RouteLayer(isActive: route == .dashboard, edge: -1, reduceMotion: reduceMotion))

            // Mounted only once a day has been picked, so the popover does not
            // pay for a detail view nobody has opened yet.
                if let selectedDate {
                    DayDetailView(
                        model: model,
                        date: selectedDate,
                        onBack: { navigate(to: .dashboard) },
                        startAddingPlan: startsAddingPlan
                    )
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

                ForexDetailView(model: model, onBack: { navigate(to: .dashboard) })
                    .modifier(RouteLayer(isActive: route == .forex, edge: 1, reduceMotion: reduceMotion))

                // Mounted only when switched on, so a disabled module costs nothing.
                if model.isNewsEnabled {
                    NewsView(model: model, onBack: { navigate(to: .dashboard) })
                        .modifier(RouteLayer(isActive: route == .news, edge: 1, reduceMotion: reduceMotion))
                }

                if model.isBazarEnabled {
                    BazarView(model: model, onBack: { navigate(to: .dashboard) })
                        .modifier(RouteLayer(isActive: route == .bazar, edge: 1, reduceMotion: reduceMotion))
                }

                if model.isRashifalEnabled {
                    RashifalView(model: model, onBack: { navigate(to: .dashboard) })
                        .modifier(RouteLayer(isActive: route == .rashifal, edge: 1, reduceMotion: reduceMotion))
                }

                if model.isRadioEnabled {
                    RadioView(model: model, onBack: { navigate(to: .dashboard) })
                        .modifier(RouteLayer(isActive: route == .radio, edge: 1, reduceMotion: reduceMotion))
                }

                ToolsView(onBack: { navigate(to: .dashboard) })
                    .modifier(RouteLayer(isActive: route == .tools, edge: 1, reduceMotion: reduceMotion))
            }

            if let station = model.radioPlayer.currentStation {
                RadioMiniPlayer(
                    station: station,
                    isPlaying: model.radioPlayer.isPlaying,
                    isResolving: model.radioPlayer.isResolving,
                    openRadio: { navigate(to: .radio) },
                    togglePlayback: { Task { await model.radioPlayer.toggle(station) } },
                    stop: { model.radioPlayer.stop() }
                )
            }

            actionBar
        }
        .environment(\.numeralStyle, model.numeralStyle)
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
                MonthCalendarView(
                    model: model,
                    onSelectDate: select(_:),
                    onAddPlan: startPlan(for:)
                )
                .cardSection()
                .padding(.horizontal, Theme.Space.m)
                .padding(.top, Theme.Space.m)
            VStack(spacing: Theme.Space.s) {
                if let upNext = model.upNext {
                    UpNextRow(summary: upNext) {
                        switch upNext.destination {
                        case .today: select(model.today)
                        case .festivals: navigate(to: .upcoming)
                        }
                    }
                }
                DashboardCardsView(
                    cards: model.visibleCards,
                    weather: model.weather,
                    forexTrend: model.headlineTrend,
                    // Paused unless the dashboard itself is showing, so the
                    // card stops animating behind the other routes.
                    isActive: route == .dashboard,
                    openWeather: { navigate(to: .weather) },
                    openForex: { navigate(to: .forex) }
                )
            }
            .padding(.horizontal, Theme.Space.m)
            .padding(.vertical, Theme.Space.m)

        }
        .accessibilityLabel("Sajilo dashboard")
    }

    private var actionBar: some View {
        ActionBarView(
            active: route.actionDestination,
            openUpcoming: { navigate(to: .upcoming) },
            openNews: model.isNewsEnabled ? { navigate(to: .news) } : nil,
            openBazar: model.isBazarEnabled ? { navigate(to: .bazar) } : nil,
            openRashifal: model.isRashifalEnabled ? { navigate(to: .rashifal) } : nil,
            openRadio: model.isRadioEnabled ? { navigate(to: .radio) } : nil,
            openTools: { navigate(to: .tools) }
        )
    }

    private func navigate(to destination: DashboardRoute) {
        route = destination
    }

    private func select(_ date: NepaliDate) {
        selectedDate = date
        navigate(to: .dayDetail(date, startAddingPlan: false))
    }

    private func startPlan(for date: NepaliDate) {
        selectedDate = date
        navigate(to: .dayDetail(date, startAddingPlan: true))
    }
}

enum DashboardRoute: Equatable {
    case dashboard
    case dayDetail(NepaliDate, startAddingPlan: Bool)
    case upcoming
    case settings
    case weather
    case forex
    case news
    case bazar
    case rashifal
    case radio
    case tools

    var actionDestination: ActionBarDestination? {
        switch self {
        case .upcoming, .dayDetail: .festivals
        case .news: .news
        case .bazar: .bazar
        case .rashifal: .rashifal
        case .radio: .radio
        case .tools: .tools
        case .dashboard, .settings, .weather, .forex: nil
        }
    }
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
