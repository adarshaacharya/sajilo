import AppKit
import SwiftUI

/// The converter is a route inside the popover, not a sheet. A modal sheet over
/// a menu-bar popover reads as a second window and breaks the illusion of one
/// surface, so this presents as a push with its own back affordance.
struct DateConverterView: View {
    let onBack: () -> Void

    @State private var store = DateConverterStore()
    @State private var copiedFormat: ConversionOutcome.CopyFormat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            VStack(alignment: .leading, spacing: Theme.Space.m) {
                Picker("Conversion", selection: $store.mode) {
                    ForEach(ConverterMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .onChange(of: store.mode) {
                    withAnimation(motion) { store.resetForModeChange() }
                }

                HStack(spacing: Theme.Space.s) {
                    DateInputField(title: "Year", text: $store.yearText)
                    DateInputField(title: "Month", text: $store.monthText)
                    DateInputField(title: "Day", text: $store.dayText)
                }
                .onSubmit { convert() }

                resultPanel

                if store.outcome != nil {
                    copyFormats
                }

                // Pushes the actions to the bottom edge so the route fills the
                // popover's height instead of leaving a void beneath itself.
                Spacer(minLength: 0)

                HStack(spacing: Theme.Space.s) {
                    Button("Today") { withAnimation(motion) { store.setToday() } }
                    Button("Swap", systemImage: "arrow.left.arrow.right") {
                        withAnimation(motion) { store.swap() }
                    }
                    Spacer(minLength: 0)
                    Button("Convert") { convert() }
                        .buttonStyle(BrandButtonStyle())
                }
            }
            .padding(Theme.Space.m)
        }
    }

    private var motion: Animation? {
        reduceMotion ? nil : .snappy(duration: 0.25)
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button("Back", systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel("Back to dashboard")

            Text("Date Converter")
                .font(.headline)

            Spacer(minLength: 0)
        }
        .padding(Theme.Space.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.brandWash)
    }

    @ViewBuilder
    private var resultPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            if let outcome = store.outcome {
                Text(outcome.gregorianLongText)
                    .font(.title3.weight(.semibold))
                    // Interpolates the glyphs instead of hard-cutting when the
                    // result changes, which is most of what makes this calm.
                    .contentTransition(.numericText())
                Text(outcome.nepaliLongText)
                    .font(.nepali(15))
                    .foregroundStyle(.secondary)

                if outcome.event != nil || outcome.isSaturday {
                    Divider().padding(.vertical, Theme.Space.xxs)
                    eventDetail(for: outcome)
                }
            } else if let errorMessage = store.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.orange)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .cardSection()
        .animation(motion, value: store.outcome)
        .animation(motion, value: store.errorMessage)
    }

    @ViewBuilder
    private func eventDetail(for outcome: ConversionOutcome) -> some View {
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
            // Saturday is Nepal's weekly holiday, so it counts even when the
            // bundled dataset carries no named event for the day.
            if outcome.event?.isPublicHoliday == true || outcome.isSaturday {
                Label("Public holiday", systemImage: "circle.fill")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(Theme.Palette.holiday)
                    .imageScale(.small)
            }
        }
    }

    @ViewBuilder
    private var copyFormats: some View {
        if let outcome = store.outcome {
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
                        copy(outcome.text(for: format), as: format)
                    }
                }
            }
            .cardSection()
        }
    }

    private func copy(_ text: String, as format: ConversionOutcome.CopyFormat) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        withAnimation(motion) { copiedFormat = format }
        Task {
            try? await Task.sleep(for: .seconds(1.4))
            guard copiedFormat == format else { return }
            withAnimation(motion) { copiedFormat = nil }
        }
    }

    private func convert() {
        withAnimation(motion) { store.convert() }
    }
}

private struct CopyRow: View {
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

private struct DateInputField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField(title, text: $text)
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}
