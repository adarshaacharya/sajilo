import SwiftUI

/// PRD CAL-04: a selected date's BS and AD forms, weekday, tithi, events,
/// holiday status, and copy formats.
struct DayDetailView: View {
    let model: AppModel
    let date: NepaliDate
    let onBack: () -> Void
    let startAddingPlan: Bool

    @State private var copiedFormat: ConversionOutcome.CopyFormat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                if let outcome = ConversionOutcome.make(for: date) {
                    // One card for the day itself: the date, what falls on it,
                    // and the copy actions. The copy formats used to be a card
                    // of their own that reprinted every value already above it.
                    DateSummaryPanel(outcome: outcome, leadsWithNepali: true) {
                        CompactCopyRow(outcome: outcome, copiedFormat: copiedFormat) { format in
                            copyToPasteboard(
                                outcome.text(for: format),
                                as: format,
                                marking: $copiedFormat,
                                animation: motion
                            )
                        }
                    }

                    if outcome.event == nil {
                        // The bundled grid drops the trailing day of some
                        // months; saying so beats rendering a blank card that
                        // reads as "nothing happens today".
                        Label(
                            L10n.noEventToday,
                            systemImage: "info.circle"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }

                    PanchangaPanel(date: outcome.gregorian)

                    DayPlanSection(
                        date: date,
                        plans: model.plans(on: date),
                        startAddingPlan: startAddingPlan,
                        onSave: model.saveDayPlan,
                        onDelete: model.deleteDayPlan
                    )
                } else {
                    Label(
                        L10n.outOfRange,
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .cardSection()
                }

                    Spacer(minLength: 0)
                }
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
    }

    private var motion: Animation? {
        reduceMotion ? nil : .snappy(duration: 0.25)
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.dateDetails)
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

/// Sunrise, sunset and Rahu Kaal for the day being viewed.
///
/// Computed rather than fetched, so it is here for every date in the calendar —
/// a festival three months out included — with no network and regardless of
/// whether the weather module is switched on.
private struct PanchangaPanel: View {
    let date: Date

    var body: some View {
        if let panchanga = Panchanga.forDate(date, tithi: nil) {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Text(L10n.panchangaTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                HStack(spacing: Theme.Space.s) {
                    reading("sunrise", L10n.panchangaSunrise, Self.clock.string(from: panchanga.sunrise))
                    reading("sunset", L10n.panchangaSunset, Self.clock.string(from: panchanga.sunset))
                    reading("clock", L10n.panchangaDaylight, panchanga.daylightText)
                }

                if let rahu = panchanga.rahuKaal {
                    Divider().opacity(0.5)

                    HStack(alignment: .top, spacing: Theme.Space.s) {
                        Image(systemName: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.holiday)
                            .frame(width: 16)

                        VStack(alignment: .leading, spacing: 1) {
                            Text(verbatim: "\(String(localized: L10n.panchangaRahuKaal))  \(Self.clock.string(from: rahu.start))–\(Self.clock.string(from: rahu.end))")
                                .font(.callout.weight(.medium))
                                .monospacedDigit()
                            Text(L10n.panchangaRahuNote)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                Text(L10n.panchangaComputed)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSection()
        }
    }

    private func reading(_ symbol: String, _ title: LocalizedStringResource, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Label(title, systemImage: symbol)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .labelStyle(.titleAndIcon)
            Text(verbatim: value)
                .font(.callout.weight(.medium))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static let clock = NepalTime.displayFormatter("HH:mm")
}
