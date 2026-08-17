import AppKit
import SwiftUI

// MARK: - Calendar

struct MonthCalendarView: View {
    let model: AppModel
    let onSelectDate: (NepaliDate) -> Void
    let onAddPlan: (NepaliDate) -> Void

    @Environment(\.numeralStyle) private var numerals
    @State private var isMovingForward = true
    @FocusState private var isFocused: Bool
    /// Latches on the first arrow key, so the focus ring is shown to keyboard
    /// users and never to someone who only clicked.
    @State private var hasUsedKeyboard = false
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
                    CalendarDayView(
                        day: day,
                        hasPlan: day.date.map(model.hasDayPlan(on:)) ?? false,
                        onSelect: onSelectDate,
                        onAddPlan: onAddPlan
                    )
                }
            }
            .frame(height: Self.gridHeight, alignment: .top)
            // A new identity per month is what lets the grid transition as a
            // unit rather than having 30-odd cells animate independently.
            .id(model.selectedMonth.firstDate)
            .transition(pushTransition)
            .clipped()

            if model.isShowingProvisionalYear {
                Label(L10n.provisional, systemImage: "exclamationmark.circle")
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
        // Shown only once the keyboard has actually been used. The calendar
        // takes focus the moment the popover opens, so an always-on ring
        // appears for every mouse user and reads as a selection or an error.
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.card)
                .strokeBorder(Theme.Palette.brand, lineWidth: 1)
                .padding(-Theme.Space.m)
                .opacity(isFocused && hasUsedKeyboard ? 0.4 : 0)
        }
        .animation(.easeOut(duration: 0.12), value: isFocused)
        .animation(.easeOut(duration: 0.12), value: hasUsedKeyboard)
        .onKeyPress(.leftArrow) {
            hasUsedKeyboard = true
            move(by: -1)
            return .handled
        }
        .onKeyPress(.rightArrow) {
            hasUsedKeyboard = true
            move(by: 1)
            return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Month calendar for \(monthTitle)")
    }

    /// Slides the outgoing month out the way the user is travelling and brings
    /// the new one in behind it, so the direction of navigation is legible.
    /// Built here rather than read from `CalendarMonth.title`: that string is
    /// composed in the calendar engine, which has no view environment and so
    /// always renders Devanagari digits.
    private var monthTitle: String {
        let date = model.selectedMonth.firstDate
        return "\(date.nepaliMonthName) \(numerals.string(from: date.year))"
    }

    /// "Aug/Sep 2026" — which English months this Bikram Sambat month covers.
    ///
    /// The exact boundary days ("17 Aug – 16 Sep") were more precision than the
    /// question needs: the reader wants to know which English month they are
    /// looking at, not when it starts. A single month when the BS month happens
    /// not to cross one, and both years when it crosses a new year.
    private var gregorianSpan: String? {
        let days = model.selectedMonth.days.compactMap(\.date)
        guard let first = days.first, let last = days.last,
              let start = try? BikramSambatCalendar.gregorianDate(from: first),
              let end = try? BikramSambatCalendar.gregorianDate(from: last) else {
            return nil
        }

        let calendar = NepalTime.calendar
        let startYear = calendar.component(.year, from: start)
        let endYear = calendar.component(.year, from: end)

        if calendar.isDate(start, equalTo: end, toGranularity: .month) {
            return Self.monthYear.string(from: start)
        }
        if startYear == endYear {
            return "\(Self.month.string(from: start))/\(Self.month.string(from: end)) \(startYear)"
        }
        // Poush crosses into a new Gregorian year. Spelling both out in full —
        // "Dec 2026 / Jan 2027" — is wide enough to run under the Today button,
        // so the years are abbreviated into a range. Same shape as every other
        // month, just carrying two years.
        let endYearShort = String(format: "%02d", endYear % 100)
        return "\(Self.month.string(from: start))/\(Self.month.string(from: end)) \(startYear)–\(endYearShort)"
    }

    private static let month = NepalTime.displayFormatter("MMM")
    private static let monthYear = NepalTime.displayFormatter("MMM yyyy")

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

    /// Month navigation.
    ///
    /// The title is laid over the row rather than placed between the buttons.
    /// In an `HStack` the leading side holds one chevron while the trailing
    /// side holds Today *and* a chevron, and Today is hidden with `opacity`,
    /// which keeps its layout space. The two spacers then centred the title in
    /// what was left over, sitting it visibly left of the card's real centre —
    /// and it shifted again whenever Today appeared. An overlay centres on the
    /// row itself, so the title holds still whatever the buttons are doing.
    private var header: some View {
        HStack(spacing: Theme.Space.xs) {
            Button(L10n.previousMonth, systemImage: "chevron.left") {
                move(by: -1)
            }
            .labelStyle(.iconOnly)

            Spacer(minLength: 0)

            // If the user has browsed away, show a proper labelled return
            // affordance rather than a cryptic tiny circle. The selected month
            // cannot show today's cell when it is a different month, so this
            // is the clear route back to the highlighted day.
            Button(L10n.today, systemImage: "smallcircle.filled.circle") {
                jumpToToday()
            }
            .controlSize(.small)
            .buttonStyle(.bordered)
            .disabled(model.isShowingCurrentMonth)
            .opacity(model.isShowingCurrentMonth ? 0 : 1)

            Button(L10n.nextMonth, systemImage: "chevron.right") {
                move(by: 1)
            }
            .labelStyle(.iconOnly)
        }
        .buttonStyle(IconButtonStyle())
        .overlay {
            // Navigation, not a page title. The popover header above already
            // reads "भदौ २०८३ / 17 August 2026"; set at the same weight, the
            // same month name appeared twice in bold a few points apart, in two
            // different English formats. Demoted to one quiet unit it says
            // which month is being browsed without competing with the heading.
            //
            // Each script keeps its own face: Kohinoor is a Devanagari family
            // and its Latin does not match the SF used elsewhere. The Latin is
            // a point smaller because at equal nominal size it reads larger
            // beside Devanagari.
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.xs) {
                Text(monthTitle)
                    .font(.nepali(13, weight: .medium))
                if let span = gregorianSpan {
                    Text(verbatim: "·")
                    Text(verbatim: span)
                        .font(.system(size: 12, weight: .medium))
                }
            }
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            // An overlay reserves no space, so nothing stops it running under
            // the Today button. This keeps it clear of both ends whatever the
            // month is called.
            .padding(.horizontal, 86)
            .id(model.selectedMonth.firstDate)
            .transition(.opacity)
        }
    }
}

private struct CalendarDayView: View {
    let day: CalendarDay
    let hasPlan: Bool
    @Environment(\.numeralStyle) private var numerals
    let onSelect: (NepaliDate) -> Void
    let onAddPlan: (NepaliDate) -> Void

    @State private var isHovering = false

    var body: some View {
        if let date = day.date {
            Button {
                onSelect(date)
            } label: {
                VStack(spacing: 0) {
                    Text(numerals.string(from: date.day))
                        .font(.nepali(14, weight: day.isToday ? .semibold : .regular))
                    if let adDay = day.adDay {
                        Text(verbatim: "\(adDay)")
                            .font(.system(size: 9))
                            .opacity(0.75)
                    }
                    if day.eventName != nil || hasPlan {
                        // Roughly a third of days carry a festival, so an
                        // accent dot on each would repaint the whole grid and
                        // undo the point of demoting the accent. The marker
                        // inherits the cell's own colour instead.
                        Circle()
                            .fill(hasPlan ? Theme.Palette.brand : .secondary)
                            .frame(width: 3, height: 3)
                            .opacity(day.isToday ? 0.9 : 0.55)
                            .accessibilityHidden(true)
                    }
                }
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, minHeight: Theme.Metric.dayCell)
                .background(background, in: .rect(cornerRadius: Theme.Radius.day))
                // A filled cell carries the immediate "today" state, while
                // the brass keyline keeps it distinct from a normal selected
                // or hovered day on both light and dark materials.
                .overlay {
                    if day.isToday {
                        RoundedRectangle(cornerRadius: Theme.Radius.day)
                            .strokeBorder(Theme.Palette.brand, lineWidth: 1.5)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.plain)
            .onHover { isHovering = $0 }
            .animation(.easeOut(duration: 0.12), value: isHovering)
            .contextMenu {
                Button(L10n.addPlan, systemImage: "calendar.badge.plus") {
                    onAddPlan(date)
                }
            }
            .accessibilityLabel(accessibilityDescription(for: date))
            .accessibilityHint("Open date details. Use the context menu to add a plan.")
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
        if hasPlan { parts.append(String(localized: L10n.hasPlan)) }
        if day.isHoliday { parts.append("public holiday") }
        return parts.joined(separator: ", ")
    }

    private var foreground: AnyShapeStyle {
        if day.isToday {
            AnyShapeStyle(Theme.Palette.onBrandFill)
        } else if day.isHoliday {
            AnyShapeStyle(Theme.Palette.holiday)
        } else {
            AnyShapeStyle(.primary)
        }
    }

    private var background: Color {
        if day.isToday {
            Theme.Palette.brandFill
        } else if isHovering {
            Theme.Palette.hover
        } else {
            .clear
        }
    }
}
