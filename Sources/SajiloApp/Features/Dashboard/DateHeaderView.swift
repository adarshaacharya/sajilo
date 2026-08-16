import AppKit
import SwiftUI

// MARK: - Header

/// Today's date, the popover's anchor. The BS day is the single largest
/// element on screen; everything else is supporting detail (PRD §4.2).
struct DateHeaderView: View {
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
