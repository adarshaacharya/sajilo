import SwiftUI

/// PRD CAL-04: a selected date's BS and AD forms, weekday, tithi, events,
/// holiday status, and copy formats.
struct DayDetailView: View {
    let model: AppModel
    let date: NepaliDate
    let onBack: () -> Void

    @State private var copiedFormat: ConversionOutcome.CopyFormat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                if let outcome = ConversionOutcome.make(for: date) {
                    DateSummaryPanel(outcome: outcome, leadsWithNepali: true)

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

                    CopyFormatsPanel(outcome: outcome, copiedFormat: copiedFormat) { format in
                        copyToPasteboard(
                            outcome.text(for: format),
                            as: format,
                            marking: $copiedFormat,
                            animation: motion
                        )
                    }

                    DayPlanSection(
                        date: date,
                        plans: model.plans(on: date),
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
