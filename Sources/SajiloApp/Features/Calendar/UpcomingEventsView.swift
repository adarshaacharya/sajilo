import SwiftUI

/// PRD §5.3: the full upcoming festival and public-holiday list.
struct UpcomingEventsView: View {
    let events: [UpcomingEvent]
    let onBack: () -> Void
    let onSelectDate: (NepaliDate) -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            if events.isEmpty {
                VStack {
                    Spacer()
                    Label(
                        L10n.noUpcoming,
                        systemImage: "calendar.badge.exclamationmark"
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: Theme.Space.xs) {
                        ForEach(events) { event in
                            UpcomingEventRow(event: event) { onSelectDate(event.date) }
                        }
                    }
                    .padding(Theme.Space.m)
                }
                .softScroll()
            }
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.upcoming)
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

private struct UpcomingEventRow: View {
    let event: UpcomingEvent
    let action: () -> Void

    @Environment(\.numeralStyle) private var numerals

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: Theme.Space.s) {
                VStack(spacing: 0) {
                    Text(numerals.string(from: event.date.day))
                        .font(.nepali(16, weight: .semibold))
                    Text(event.date.nepaliMonthName)
                        .font(.nepali(10))
                        .foregroundStyle(.secondary)
                }
                .frame(width: 40)

                VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                    Text(event.name)
                        .font(.nepali(13))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: Theme.Space.xs) {
                        Text(event.relativeText)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        if event.isPublicHoliday {
                            Text(L10n.publicHoliday)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Theme.Palette.holiday)
                        }
                    }
                }
            }
            .padding(Theme.Space.s)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isHovering ? Theme.Palette.hover : Theme.Palette.surface,
                in: .rect(cornerRadius: Theme.Radius.card)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.easeOut(duration: 0.12), value: isHovering)
        .accessibilityLabel(
            "\(event.name), \(event.relativeText)"
                + (event.isPublicHoliday ? ", public holiday" : "")
        )
        .accessibilityHint("Open date details")
    }
}

/// The one-line teaser on the dashboard.
struct NextEventRow: View {
    let event: UpcomingEvent
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Space.s) {
                Image(systemName: "sparkles")
                    .font(.caption)
                    .foregroundStyle(Theme.Palette.brand)

                Text(event.name)
                    .font(.nepali(12))
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: Theme.Space.xs)

                Text(event.relativeText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .layoutPriority(1)

                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, Theme.Space.s)
            .padding(.vertical, Theme.Space.s)
            .background(
                isHovering ? Theme.Palette.hover : Theme.Palette.surface,
                in: .rect(cornerRadius: Theme.Radius.card)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.easeOut(duration: 0.12), value: isHovering)
        .accessibilityLabel("Next: \(event.name), \(event.relativeText)")
        .accessibilityHint("Show all upcoming festivals")
    }
}
