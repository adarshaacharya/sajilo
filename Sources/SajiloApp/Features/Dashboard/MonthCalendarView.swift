import AppKit
import SwiftUI

// MARK: - Calendar

struct MonthCalendarView: View {
    let model: AppModel
    let onSelectDate: (NepaliDate) -> Void

    @State private var isMovingForward = true
    @FocusState private var isFocused: Bool
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
