import AppKit
import SwiftUI

// MARK: - Header

/// Today's date, the popover's anchor (PRD §4.2).
///
/// The day sits in a plate rather than running inline with the text. Three
/// reasons: the header was otherwise a flat block of type with half its width
/// unused; the plate repeats the rounded-square language of the today-cell in
/// the grid below, so the popover reads as one design rather than two; and it
/// gives today's festival somewhere to sit as real content instead of a grey
/// line trailing off the bottom.
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

                if let event = todayEvent {
                    eventChip(event)
                        .padding(.top, Theme.Space.xxs)
                }
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
        .routeHeader()
        .overlay(alignment: .topTrailing) {
            Button(action: openSettings) {
                Image(systemName: "gearshape")
            }
            .buttonStyle(IconButtonStyle())
            .padding(Theme.Space.s)
            .accessibilityLabel(L10n.openSettings)
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

    /// Today's festival, promoted from a trailing grey line to a marked chip.
    /// Tithi rides alongside it because both come from the same bundled record.
    private func eventChip(_ event: TodayEvent) -> some View {
        HStack(spacing: Theme.Space.xs) {
            Image(systemName: "sparkle")
                .font(.system(size: 9))
                .foregroundStyle(Theme.Palette.brand)

            Text(event.headline)
                .font(.nepali(12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.tail)

            if let tithi = event.tithi {
                Text(verbatim: "·")
                    .foregroundStyle(.tertiary)
                Text(tithi)
                    .font(.nepali(11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.day))
    }

    /// A day carrying only a tithi still deserves the chip; a day carrying
    /// neither gets nothing rather than an empty container.
    private var todayEvent: TodayEvent? {
        let name = model.todayEvent?.name
        let tithi = model.todayEvent?.tithi
        guard let headline = name ?? tithi else { return nil }
        return TodayEvent(headline: headline, tithi: name == nil ? nil : tithi)
    }

    private var accessibilityDescription: String {
        var parts = [
            "Today: \(model.nepaliWeekday), \(model.today.day) \(model.today.englishMonthName) \(model.today.year)",
            model.gregorianDate
        ]
        if let event = todayEvent {
            parts.append(event.headline)
            if let tithi = event.tithi { parts.append(tithi) }
        }
        return parts.joined(separator: ". ") + "."
    }

    struct TodayEvent {
        let headline: String
        let tithi: String?
    }
}
