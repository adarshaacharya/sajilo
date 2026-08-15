import AppKit
import SwiftUI

/// The date summary and copy list, shared by the converter and the day-detail
/// route so a date reads identically wherever it is shown.

// MARK: - Summary

struct DateSummaryPanel: View {
    let outcome: ConversionOutcome
    /// The day detail leads with the Nepali date; the converter leads with the
    /// Gregorian one, because that is the answer the user asked for.
    var leadsWithNepali = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            if leadsWithNepali {
                Text(outcome.nepaliLongText)
                    .font(.nepali(22, weight: .bold))
                    .foregroundStyle(Theme.Palette.brand)
                Text(outcome.gregorianLongText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text(outcome.gregorianLongText)
                    .font(.title3.weight(.semibold))
                    .contentTransition(.numericText())
                Text(outcome.nepaliLongText)
                    .font(.nepali(15))
                    .foregroundStyle(.secondary)
            }

            if hasDetail {
                Divider().padding(.vertical, Theme.Space.xxs)
                detail
            }
        }
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .cardSection()
    }

    private var hasDetail: Bool {
        outcome.event?.tithi != nil || outcome.event?.name != nil || isHoliday
    }

    /// Saturday is Nepal's weekly holiday, so it counts even when the bundled
    /// dataset carries no named event for that day.
    private var isHoliday: Bool {
        outcome.event?.isPublicHoliday == true || outcome.isSaturday
    }

    @ViewBuilder
    private var detail: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            if let tithi = outcome.event?.tithi {
                Text(tithi)
                    .font(.nepali(13))
                    .foregroundStyle(.secondary)
            }
            if let name = outcome.event?.name {
                Text(name)
                    .font(.nepali(13))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if isHoliday {
                Label("Public holiday", systemImage: "circle.fill")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(Theme.Palette.holiday)
                    .imageScale(.small)
            }
        }
    }
}

// MARK: - Copy formats

struct CopyFormatsPanel: View {
    let outcome: ConversionOutcome
    let copiedFormat: ConversionOutcome.CopyFormat?
    let onCopy: (ConversionOutcome.CopyFormat) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text("Copy as")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ForEach(ConversionOutcome.CopyFormat.allCases) { format in
                CopyRow(
                    label: format.label,
                    value: outcome.text(for: format),
                    isCopied: copiedFormat == format
                ) {
                    onCopy(format)
                }
            }
        }
        .cardSection()
    }
}

struct CopyRow: View {
    let label: String
    let value: String
    let isCopied: Bool
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Space.s) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(label)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(value)
                        .font(.callout)
                        .textSelection(.enabled)
                }

                Spacer(minLength: 0)

                Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                    .font(.caption)
                    .foregroundStyle(isCopied ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.secondary))
                    .contentTransition(.symbolEffect(.replace))
            }
            .padding(.horizontal, Theme.Space.s)
            .padding(.vertical, Theme.Space.xs)
            .background(
                isHovering ? Theme.Palette.hover : .clear,
                in: .rect(cornerRadius: Theme.Radius.day)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.easeOut(duration: 0.12), value: isHovering)
        .accessibilityLabel("\(label): \(value)")
        .accessibilityHint(isCopied ? "Copied" : "Copy to clipboard")
    }
}

/// Copies to the pasteboard and flashes a confirmation on the row that was
/// used, reverting on its own.
@MainActor
func copyToPasteboard(
    _ text: String,
    as format: ConversionOutcome.CopyFormat,
    marking copied: Binding<ConversionOutcome.CopyFormat?>,
    animation: Animation?
) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
    withAnimation(animation) { copied.wrappedValue = format }
    Task {
        try? await Task.sleep(for: .seconds(1.4))
        guard copied.wrappedValue == format else { return }
        withAnimation(animation) { copied.wrappedValue = nil }
    }
}
