import AppKit
import SwiftUI

// MARK: - Header

/// Today's date, the popover's anchor (PRD §4.2).
///
/// The day sits in a plate rather than running inline with the text. Three
/// reasons: the header was otherwise a flat block of type with half its width
/// unused; the plate repeats the rounded-square language of the today-cell in
/// the grid below, so the popover reads as one design rather than two; and it
/// gives the date a stable anchor above the calendar grid.
struct DateHeaderView: View {
    let model: AppModel
    let openSettings: () -> Void

    @Environment(\.numeralStyle) private var numerals

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Space.m) {
            dateTile

            VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                Text("\(model.today.nepaliMonthName) \(numerals.string(from: model.today.year))")
                    .font(.nepali(19, weight: .semibold))

                Text(model.gregorianDisplayDate)
                    .font(.caption)
                    .tracking(0.3)
                    .foregroundStyle(.secondary)

            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
        .routeHeader()
        .overlay(alignment: .topTrailing) {
            // Settings and Quit sit together here rather than in the action
            // bar. Both are chrome — everything in the bar below navigates
            // somewhere, and mixing an exit into that row costs a slot that a
            // daily destination uses better.
            HStack(spacing: Theme.Space.xxs) {
                Button(action: openSettings) {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.openSettings)

                Button {
                    NSApplication.shared.terminate(nil)
                } label: {
                    Image(systemName: "power")
                }
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.quit)
                .help(Text(L10n.quit))
            }
            .padding(Theme.Space.s)
        }
    }

    /// The day and its weekday as one plate — a torn-off patro page.
    ///
    /// The colour is in the numeral, not the plate. A 54pt filled block of
    /// accent is a mass rather than a mark: at that size a saturated fill
    /// shouts and a muted one goes limp, and no hue fixes either. Carrying the
    /// accent in the glyph keeps the plate's structure while cutting the
    /// coloured area by roughly a tenth — and a small saturated mark reads
    /// brighter than a large soft one.
    private var dateTile: some View {
        VStack(spacing: 0) {
            Text(numerals.string(from: model.today.day))
                .font(.nepali(30, weight: .bold))
                .foregroundStyle(Theme.Palette.brand)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(model.nepaliWeekdayShort)
                .font(.nepali(10, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(width: 54, height: 54)
        .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.card))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card)
                .strokeBorder(Theme.Palette.brand.opacity(0.35), lineWidth: 1)
        )
        .accessibilityHidden(true)
    }

    private var accessibilityDescription: String {
        [
            "Today: \(model.nepaliWeekday), \(model.today.day) \(model.today.englishMonthName) \(model.today.year)",
            model.gregorianDate
        ]
        .joined(separator: ". ") + "."
    }
}
