import AppKit
import SwiftUI

/// A standalone wrapper retained for previews. The dashboard reaches the same
/// converter through Tools, where `DateConverterContent` is reused directly.
struct DateConverterView: View {
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            DateConverterContent()
                .padding(Theme.Space.m)
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.dateConverter)
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

/// The actual converter, shared by the Tools route and the standalone preview.
struct DateConverterContent: View {
    @State private var store = DateConverterStore()
    @State private var copiedFormat: ConversionOutcome.CopyFormat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
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

                if let outcome = store.outcome {
                    DateSummaryPanel(outcome: outcome)
                        .animation(motion, value: store.outcome)

                    CopyFormatsPanel(outcome: outcome, copiedFormat: copiedFormat) { format in
                        copyToPasteboard(
                            outcome.text(for: format),
                            as: format,
                            marking: $copiedFormat,
                            animation: motion
                        )
                    }
                } else if let errorMessage = store.errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.callout)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        .cardSection()
                }

                // Pushes the actions to the bottom edge so the route fills the
                // popover's height instead of leaving a void beneath itself.
                Spacer(minLength: 0)

                HStack(spacing: Theme.Space.s) {
                    Button(L10n.today) { withAnimation(motion) { store.setToday() } }
                    Button(L10n.swap, systemImage: "arrow.left.arrow.right") {
                        withAnimation(motion) { store.swap() }
                    }
                    Spacer(minLength: 0)
                    Button(L10n.convert) { convert() }
                        .buttonStyle(BrandButtonStyle())
                }
        }
    }

    private var motion: Animation? {
        reduceMotion ? nil : .snappy(duration: 0.25)
    }

    private func convert() {
        withAnimation(motion) { store.convert() }
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
