import AppKit
import SwiftUI

struct DashboardView: View {
    let model: AppModel
    @State private var route: DashboardRoute = .dashboard
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
        }
        .frame(width: Theme.Metric.popoverWidth)
        .background(.regularMaterial)
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: route)
        // Escape backs out of a route before the system closes the popover.
        .onExitCommand {
            guard route != .dashboard else { return }
            navigate(to: .dashboard)
        }
    }

    private var dashboard: some View {
        VStack(spacing: 0) {
            DateHeaderView(model: model)
            MonthCalendarView(model: model)
                .cardSection()
                .padding(.horizontal, Theme.Space.m)
                .padding(.top, Theme.Space.m)
            DashboardCardsView(cards: model.visibleCards)
                .padding(.horizontal, Theme.Space.m)
                .padding(.vertical, Theme.Space.m)
            ActionBarView(openConverter: { navigate(to: .converter) })
        }
        .accessibilityLabel("Sajilo dashboard")
    }

    private func navigate(to destination: DashboardRoute) {
        route = destination
    }
}

private enum DashboardRoute {
    case dashboard
    case converter
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

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s) {
                Text(NepaliNumerals.string(from: model.today.day))
                    .font(.nepali(Theme.Metric.heroNumeral, weight: .bold))
                    .foregroundStyle(Theme.Palette.brand)

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
                .foregroundStyle(.secondary)
        }
        .padding(Theme.Space.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.brandWash)
        .overlay(alignment: .topTrailing) {
            SettingsLink {
                Image(systemName: "gearshape")
            }
            .buttonStyle(IconButtonStyle())
            .padding(Theme.Space.s)
            .accessibilityLabel("Open Settings")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Today: \(model.nepaliWeekday), \(model.today.day) \(model.today.englishMonthName) \(model.today.year). \(model.gregorianDate)."
        )
    }
}

// MARK: - Calendar

private struct MonthCalendarView: View {
    let model: AppModel

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
                    CalendarDayView(day: day)
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
    @State private var isHovering = false

    var body: some View {
        if let date = day.date {
            Button {
                // Date detail scene is the next calendar milestone.
            } label: {
                VStack(spacing: 0) {
                    Text(NepaliNumerals.string(from: date.day))
                        .font(.nepali(14, weight: day.isToday ? .semibold : .regular))
                    if let adDay = day.adDay {
                        Text(verbatim: "\(adDay)")
                            .font(.system(size: 9))
                            .opacity(0.6)
                    }
                    if day.eventName != nil {
                        Circle()
                            .fill(day.isToday ? .white : Theme.Palette.brand)
                            .frame(width: 3, height: 3)
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
            .accessibilityLabel("\(date.day) \(date.englishMonthName)\(day.isHoliday ? ", holiday" : "")")
            .accessibilityHint(day.eventName ?? day.tithi ?? "Open date details")
            .accessibilityAddTraits(day.isToday ? .isSelected : [])
        } else {
            Color.clear
                .frame(height: Theme.Metric.dayCell)
                .accessibilityHidden(true)
        }
    }

    private var foreground: AnyShapeStyle {
        if day.isToday {
            AnyShapeStyle(.white)
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

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(spacing: Theme.Space.m) {
                ForEach(cards) { card in
                    DashboardCardView(card: card)
                }
            }

            // One shared freshness line instead of a timestamp per card; the
            // state model in PRD §6 replaces this once providers are wired up.
            if let freshness = cards.first?.freshness {
                Text(freshness)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}

private struct DashboardCardView: View {
    let card: DashboardCard

    var body: some View {
        Button {
            // Detail scenes are introduced once each provider is live.
        } label: {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                HStack(spacing: Theme.Space.xs) {
                    Image(systemName: card.symbol)
                        .font(.system(size: 11))
                        .foregroundStyle(card.kind.tint)
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
            .cardSection(padding: Theme.Space.s)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(card.title), \(card.primaryValue). \(card.detail). \(card.freshness)")
    }
}

// MARK: - Actions

private struct ActionBarView: View {
    let openConverter: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button("Calendar", systemImage: "calendar") {}
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
}
#endif
