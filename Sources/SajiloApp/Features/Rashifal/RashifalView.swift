import SwiftUI

/// Today's rashifal, from Hamro Patro and used with their permission.
///
/// The reader's own sign leads and the other eleven follow, because the reason
/// anyone opens this is to read one of the twelve. Until a sign is picked the
/// route asks for one rather than guessing: Nepali rashi is normally the moon
/// sign from a birth chart, not the birth month, so there is nothing to infer
/// it from.
struct RashifalView: View {
    let model: AppModel
    let onBack: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    if model.rashifal != nil {
                        if let mine = model.myRashifal {
                            MyReading(reading: mine, isFromToday: model.isRashifalFromToday) {
                                model.selectedRashi = nil
                            }
                        } else {
                            SignPicker(selected: model.selectedRashi) { model.selectedRashi = $0 }
                        }

                        otherSigns
                        credit
                    } else {
                        UnavailableReading(
                            message: model.rashifalError ?? "No reading cached yet.",
                            isLoading: model.isRashifalLoading
                        )
                    }

                    Spacer(minLength: 0)
                }
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: model.selectedRashi)
        .task { await model.refreshRashifalIfStale() }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.rashifal)
                .font(.headline)

            Spacer(minLength: 0)

            Button(L10n.refresh, systemImage: "arrow.clockwise") {
                Task { await model.refreshRashifal() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(IconButtonStyle())
            .disabled(model.isRashifalLoading)
            .accessibilityLabel("Refresh rashifal")
        }
        .routeHeader()
    }

    @ViewBuilder
    private var otherSigns: some View {
        let others = model.rashifal?.readings.filter { $0.sign != model.selectedRashi } ?? []
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                if model.selectedRashi != nil {
                    Text(L10n.rashifalOtherSigns)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                ForEach(others) { SignReading(reading: $0) }
            }
            .cardSection()
        }
    }

    /// Credited on the same screen as the words, not tucked away in Settings.
    /// These twelve paragraphs are Hamro Patro's writing, carried here by
    /// their permission, so the attribution travels with them.
    private var credit: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            if let published = model.rashifal?.publishedOn {
                Text("\(String(localized: L10n.bazarPublished)) \(published.day) \(published.nepaliMonthName) \(published.year)")
            }
            Text(L10n.rashifalCredit)
            Link("Hamro Patro", destination: URL(string: "https://www.hamropatro.com/rashifal")!)
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Reader's own sign

private struct MyReading: View {
    let reading: Rashifal
    let isFromToday: Bool
    let changeSign: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(spacing: Theme.Space.s) {
                Image(systemName: reading.sign.symbolName)
                    .font(.title3)
                    .foregroundStyle(Theme.Palette.brand)

                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: reading.sign.nepaliName)
                        .font(.nepali(17, weight: .semibold))
                    Text(verbatim: "\(reading.sign.romanName) · \(reading.sign.westernName)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Spacer(minLength: 0)

                Button(L10n.rashifalChangeSign, action: changeSign)
                    .buttonStyle(.link)
                    .font(.caption2)
            }

            // Reproduced exactly as published — never trimmed to fit.
            Text(verbatim: reading.prediction)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)

            if !isFromToday {
                // The source publishes each morning. If the cached reading was
                // written for a different day, say so rather than letting it
                // pass as today's.
                Label(L10n.rashifalStale, systemImage: "clock.arrow.circlepath")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

/// Shown until a sign is chosen. Twelve tiles rather than a dropdown: picking
/// happens once, and the names are what people recognise.
private struct SignPicker: View {
    let selected: RashiSign?
    let choose: (RashiSign) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: Theme.Space.xs), count: 4)

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            Text(L10n.rashifalPickSign)
                .font(.callout.weight(.medium))
            Text(L10n.rashifalPickHint)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: columns, spacing: Theme.Space.xs) {
                ForEach(RashiSign.allCases) { sign in
                    Button { choose(sign) } label: {
                        VStack(spacing: Theme.Space.xxs) {
                            Image(systemName: sign.symbolName)
                                .font(.callout)
                            Text(verbatim: sign.nepaliName)
                                .font(.nepali(11, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Space.s)
                        .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.day))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(sign.romanName), \(sign.westernName)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

/// One of the other eleven — collapsed to its name until opened, so the route
/// is a list rather than twelve paragraphs deep.
private struct SignReading: View {
    let reading: Rashifal

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Button {
                withAnimation(.snappy(duration: 0.22)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: Theme.Space.s) {
                    Image(systemName: reading.sign.symbolName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 18)

                    Text(verbatim: reading.sign.nepaliName)
                        .font(.nepali(14, weight: .medium))

                    Text(verbatim: reading.sign.westernName)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 0 : -90))
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            if isExpanded {
                Text(verbatim: reading.prediction)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.leading, 18 + Theme.Space.s)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(reading.sign.romanName)
    }
}

private struct UnavailableReading: View {
    let message: String
    let isLoading: Bool

    var body: some View {
        Label(
            isLoading ? "Loading…" : message,
            systemImage: isLoading ? "arrow.clockwise" : "wifi.slash"
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

#if DEBUG
#Preview("Rashifal") {
    RashifalView(model: .preview(), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
}
#endif
