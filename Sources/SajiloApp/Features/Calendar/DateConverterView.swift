import AppKit
import SwiftUI

struct DateConverterView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store = DateConverterStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("Date Converter")
                    .font(.title2.weight(.semibold))
                Spacer()
                Button("Close", systemImage: "xmark") { dismiss() }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close date converter")
            }

            Picker("Conversion", selection: $store.mode) {
                ForEach(ConverterMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: store.mode) {
                store.resetForModeChange()
            }

            HStack(spacing: 10) {
                DateInputField(title: "Year", text: $store.yearText)
                DateInputField(title: "Month", text: $store.monthText)
                DateInputField(title: "Day", text: $store.dayText)
            }
            .onSubmit { store.convert() }

            Group {
                if let result = store.result {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Result")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(result.displayText)
                            .font(.title3.weight(.semibold))
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(.quaternary, in: .rect(cornerRadius: 12))
                } else if let errorMessage = store.errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.callout)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(.quaternary, in: .rect(cornerRadius: 12))
                }
            }

            HStack {
                Button("Today") { store.setToday() }
                Button("Swap", systemImage: "arrow.left.arrow.right") { store.swap() }
                Spacer()
                Button("Copy", systemImage: "doc.on.doc") {
                    guard let result = store.result else { return }
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(result.copyText, forType: .string)
                }
                .disabled(store.result == nil)
                Button("Convert") { store.convert() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(width: 440)
    }
}

private struct DateInputField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        TextField(title, text: $text)
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(title)
    }
}
