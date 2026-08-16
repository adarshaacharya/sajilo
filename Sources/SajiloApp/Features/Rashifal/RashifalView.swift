import SwiftUI

/// Today's rashifal, from Hamro Patro and used with their permission.
struct RashifalView: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var viewing: RashiSign?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                RashifalContent(model: model, viewing: $viewing)
                    .padding(Theme.Space.m)
            }
            .softScroll()
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: viewing)
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
}

/// The route's body, outside the `ScrollView` so it can be rendered on its own.
/// `ImageRenderer` does not draw scrolled content, and this screen is worth
/// being able to look at without a running app.
struct RashifalContent: View {
    let model: AppModel
    @Binding var viewing: RashiSign?

    @Environment(\.numeralStyle) private var numerals

    /// Whichever sign is on screen: the one being browsed, else the reader's.
    private var shown: RashiSign? { viewing ?? model.selectedRashi }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            if model.rashifal == nil {
                UnavailableReading(
                    message: model.rashifalError ?? "No reading cached yet.",
                    isLoading: model.isRashifalLoading
                )
            } else if model.selectedRashi == nil {
                SignFinder { model.selectedRashi = $0 }
            } else {
                if let sign = shown, let reading = model.rashifal?.reading(for: sign) {
                    ReadingCard(
                        reading: reading,
                        isMine: sign == model.selectedRashi,
                        isFromToday: model.isRashifalFromToday,
                        backToMine: { viewing = nil },
                        changeSign: {
                            viewing = nil
                            model.selectedRashi = nil
                        }
                    )
                }

                SignStrip(
                    signs: RashiSign.allCases,
                    shown: shown,
                    mine: model.selectedRashi,
                    select: { viewing = $0 }
                )
            }

            credit
        }
    }

    /// Published date beside the forecast text.
    @ViewBuilder
    private var credit: some View {
        if let published = model.rashifal?.publishedOn {
            // `Text("…\(someInt)")` runs through localized-key
            // interpolation, which number-formats integers — so a year
            // renders as "2,083". Built as a string first, and through the
            // numeral preference so it matches every other date on screen.
            Text(verbatim: publishedText(published))
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Theme.Space.xs)
        }
    }

    private func publishedText(_ date: NepaliDate) -> String {
        let label = String(localized: L10n.bazarPublished)
        return "\(label) \(numerals.string(from: date.day)) \(date.nepaliMonthName) \(numerals.string(from: date.year))"
    }
}

// MARK: - The reading

private struct ReadingCard: View {
    let reading: Rashifal
    let isMine: Bool
    let isFromToday: Bool
    let backToMine: () -> Void
    let changeSign: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .top, spacing: Theme.Space.s) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: reading.sign.nepaliName)
                        .font(.nepali(20, weight: .semibold))
                    Text(verbatim: "\(reading.sign.romanName) · \(reading.sign.westernName)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Spacer(minLength: 0)

                // One action, whichever is meaningful: leave someone else's
                // sign, or change the one that is yours.
                Button(isMine ? L10n.rashifalChangeSign : L10n.rashifalBackToMine) {
                    isMine ? changeSign() : backToMine()
                }
                .buttonStyle(.link)
                .font(.caption2)
            }

            SyllableRow(syllables: reading.sign.namingSyllables)

            Divider().opacity(0.5)

            // Reproduced exactly as published, and given room to breathe —
            // this is the one thing on the screen anyone came to read.
            Text(verbatim: reading.prediction)
                .font(.callout)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            if !isFromToday {
                Label(L10n.rashifalStale, systemImage: "clock.arrow.circlepath")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

/// The नामाक्षर, laid out as chips. Small, quiet, and the thing that lets
/// someone confirm the sign is theirs.
private struct SyllableRow: View {
    let syllables: [String]

    var body: some View {
        Text(verbatim: syllables.joined(separator: "  ·  "))
            .font(.nepali(11, weight: .medium))
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Choosing a sign

/// Shown until a sign is picked.
///
/// Built around the नामाक्षर rather than a bare list of names, because that is
/// how the question is actually answered in Nepal — you know your rashi from
/// the syllable your name starts with, not from your birth month. Asking people
/// to already know the answer was the weak part of the first version.
private struct SignFinder: View {
    let choose: (RashiSign) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: Theme.Space.xs),
        GridItem(.flexible(), spacing: Theme.Space.xs),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.rashifalPickSign)
                    .font(.callout.weight(.semibold))
                Text(L10n.rashifalPickHint)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: columns, spacing: Theme.Space.xs) {
                ForEach(RashiSign.allCases) { sign in
                    Button { choose(sign) } label: {
                        HStack(alignment: .top, spacing: Theme.Space.xs) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(verbatim: sign.nepaliName)
                                    .font(.nepali(13, weight: .semibold))
                                Text(verbatim: sign.namingSyllables.prefix(5).joined(separator: " "))
                                    .font(.nepali(10))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(Theme.Space.xs)
                        .frame(maxWidth: .infinity, alignment: .leading)
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

/// All twelve as a compact strip under the reading.
///
/// Replaces the eleven stacked disclosure rows of the first version: those were
/// a wall of identical chevrons, and expanding them stacked paragraphs on top
/// of each other. One panel above, one grid below — a single mechanism.
private struct SignStrip: View {
    let signs: [RashiSign]
    let shown: RashiSign?
    let mine: RashiSign?
    let select: (RashiSign) -> Void
    @State private var hoveredSign: RashiSign?

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: Theme.Space.xs),
        count: 4
    )

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text(L10n.rashifalAllSigns)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            LazyVGrid(columns: columns, spacing: Theme.Space.xs) {
                ForEach(signs) { sign in
                    Button { select(sign) } label: {
                        Text(verbatim: sign.nepaliName)
                            .font(.nepali(11, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        .foregroundStyle(
                            sign == shown
                                ? AnyShapeStyle(Theme.Palette.brand)
                                : AnyShapeStyle(hoveredSign == sign ? .primary : .secondary)
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Space.xs)
                        .background(
                            sign == shown
                                ? Theme.Palette.brand.opacity(0.12)
                                : (hoveredSign == sign ? Theme.Palette.hover : Color.clear),
                            in: .rect(cornerRadius: Theme.Radius.day)
                        )
                        .overlay(
                            // A quiet ring marks the reader's own sign, so it
                            // stays findable while browsing someone else's.
                            RoundedRectangle(cornerRadius: Theme.Radius.day)
                                .strokeBorder(
                                    sign == mine ? Theme.Palette.brand.opacity(0.45) : .clear,
                                    lineWidth: 1
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    .contentShape(.rect)
                    .onHover { isHovering in
                        hoveredSign = isHovering ? sign : nil
                    }
                    .animation(.easeOut(duration: 0.12), value: hoveredSign)
                    .accessibilityLabel(
                        sign == mine ? "\(sign.romanName), your rashi" : sign.romanName
                    )
                }
            }
        }
        .cardSection()
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
