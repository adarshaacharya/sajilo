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
        .routeHeader()
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
