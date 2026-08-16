import SwiftUI

/// PRD §5.6 and §5.7: today's gold and silver rate, and NOC's retail fuel price.
///
/// The two live behind one route because they answer the same question — what
/// things cost today — and because the dashboard stays calendar-first. Neither
/// gets a card on the main screen.
struct BazarView: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var section: Section = .metals
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Section: String, CaseIterable, Identifiable {
        case metals, fuel
        var id: String { rawValue }

        var title: LocalizedStringResource {
            switch self {
            case .metals: L10n.bazarMetals
            case .fuel: L10n.bazarFuel
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    Picker(L10n.bazar, selection: $section) {
                        ForEach(Section.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    switch section {
                    case .metals: MetalsSection(model: model)
                    case .fuel: FuelSection(model: model)
                    }

                    Spacer(minLength: 0)
                }
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: section)
        .task { await model.refreshBazarIfStale() }
    }

    private var isLoading: Bool {
        section == .metals ? model.isMetalsLoading : model.isFuelLoading
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.bazar)
                .font(.headline)

            Spacer(minLength: 0)

            Button(L10n.refresh, systemImage: "arrow.clockwise") {
                Task { await model.refreshBazar() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(IconButtonStyle())
            .disabled(isLoading)
            .accessibilityLabel("Refresh rates")
        }
        .routeHeader()
    }
}

// MARK: - Gold and silver

private struct MetalsSection: View {
    let model: AppModel

    var body: some View {
        if let snapshot = model.metals {
            VStack(alignment: .leading, spacing: Theme.Space.m) {
                if let headline = snapshot.headline {
                    HeadlineRate(rate: headline, history: snapshot.goldHistory)
                }

                VStack(alignment: .leading, spacing: Theme.Space.xs) {
                    ForEach(snapshot.rates) { MetalRow(rate: $0) }
                }
                .cardSection()

                MetalCalculator(snapshot: snapshot)
                source(publishedAt: snapshot.publishedAt)
            }
        } else {
            UnavailableNote(
                message: model.metalsError ?? "No rate cached yet.",
                isLoading: model.isMetalsLoading
            )
        }
    }

    private func source(publishedAt: Date) -> some View {
        SourceNote(
            label: L10n.bazarPublished,
            date: publishedAt,
            name: "Federation of Nepal Gold and Silver Dealers' Association",
            url: URL(string: "https://www.fenegosida.org/")!
        )
    }
}

/// The number people are actually looking for, at a size that says so.
private struct HeadlineRate: View {
    let rate: MetalRate
    let history: [Double]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.xs) {
                Text(verbatim: rate.metal.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(verbatim: rate.unit.displayName)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Spacer(minLength: 0)
                ChangeBadge(text: rate.changeText, isUp: rate.isUp, isFlat: rate.change == 0)
            }

            Text(verbatim: rate.priceText)
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .monospacedDigit()
                .contentTransition(.numericText())

            HStack(spacing: Theme.Space.s) {
                Text(verbatim: rate.perGramText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()

                Spacer(minLength: 0)

                // Only drawn once there is enough of a week to be a shape
                // rather than a line between two points.
                if history.count >= 3 {
                    SparklineView(values: history)
                        .frame(width: 88, height: 26)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

private struct MetalRow: View {
    let rate: MetalRate

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Image(systemName: rate.metal.symbolName)
                .font(.caption)
                .foregroundStyle(Theme.Palette.brand)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: rate.metal.displayName)
                    .font(.callout.weight(.medium))
                Text(verbatim: rate.metal.nepaliName)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer(minLength: Theme.Space.s)

            VStack(alignment: .trailing, spacing: 0) {
                Text(verbatim: rate.priceText)
                    .font(.callout.weight(.medium))
                    .monospacedDigit()
                Text(verbatim: rate.unit.displayName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rate.metal.displayName), \(rate.priceText) \(rate.unit.displayName)")
    }
}

/// What a given weight is worth at today's rate — the arithmetic every jeweller
/// visit starts with, and the reason to hold a per-gram figure at all.
private struct MetalCalculator: View {
    let snapshot: MetalRateSnapshot

    @State private var amount = "1"
    @State private var metal: Metal = .fineGold
    @State private var unit: WeightUnit = .tola

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .bottom, spacing: Theme.Space.s) {
                VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                    Text(L10n.bazarQuantity)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    TextField(String(localized: L10n.bazarQuantity), text: $amount)
                        .textFieldStyle(.roundedBorder)
                        .labelsHidden()
                }

                Picker("Unit", selection: $unit) {
                    ForEach(WeightUnit.allCases) { Text(verbatim: $0.displayName).tag($0) }
                }
                .labelsHidden()
                .frame(width: 96)

                Picker("Metal", selection: $metal) {
                    ForEach(available) { Text(verbatim: $0.displayName).tag($0) }
                }
                .labelsHidden()
                .frame(width: 104)
            }

            Text(verbatim: worthText)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.2), value: worthText)
        }
        .cardSection()
        .onAppear {
            // Silver-only days exist; do not leave the picker on a metal the
            // Federation did not publish.
            if !available.contains(metal), let first = available.first { metal = first }
        }
    }

    private var available: [Metal] {
        Metal.allCases.filter { metal in snapshot.rates.contains { $0.metal == metal } }
    }

    /// Priced off the per-gram figure so any input unit works, including ones
    /// the Federation does not quote directly.
    private var worthText: String {
        guard let rate = snapshot.rate(for: metal, unit: .tola)
            ?? snapshot.rates.first(where: { $0.metal == metal }) else {
            return "—"
        }
        let grams = WeightConverter.convert(Double(amount) ?? 0, from: unit, to: .gram)
        let value = grams * rate.pricePerGram
        return "\(String(localized: L10n.bazarWorth)) Rs \(NepaliNumberFormatter.grouped(Int(value.rounded())))"
    }
}

// MARK: - Fuel

private struct FuelSection: View {
    let model: AppModel

    var body: some View {
        if let snapshot = model.fuel {
            VStack(alignment: .leading, spacing: Theme.Space.m) {
                VStack(alignment: .leading, spacing: Theme.Space.s) {
                    ForEach(snapshot.prices) { FuelRow(price: $0) }
                }
                .cardSection()

                SourceNote(
                    label: L10n.bazarEffectiveFrom,
                    date: snapshot.effectiveFrom,
                    name: "Nepal Oil Corporation",
                    url: URL(string: "https://noc.org.np/retailprice")!
                )
            }
        } else {
            UnavailableNote(
                message: model.fuelError ?? "No prices cached yet.",
                isLoading: model.isFuelLoading
            )
        }
    }
}

private struct FuelRow: View {
    let price: FuelPrice

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Image(systemName: price.fuel.symbolName)
                .font(.callout)
                .foregroundStyle(Theme.Palette.brand)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: price.fuel.displayName)
                    .font(.callout.weight(.medium))
                Text(verbatim: price.fuel.nepaliName)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer(minLength: Theme.Space.s)

            VStack(alignment: .trailing, spacing: Theme.Space.xxs) {
                Text(verbatim: price.priceText)
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                Text(verbatim: price.fuel.unitLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ChangeBadge(text: price.changeText, isUp: price.isUp, isFlat: price.isUnchanged)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(price.fuel.displayName), \(price.priceText) \(price.fuel.unitLabel), \(price.changeText)"
        )
    }
}

// MARK: - Shared

/// A rise reads in the accent and a fall in the holiday red — the two colours
/// the palette already carries. No movement gets neither, because a badge that
/// is always coloured stops meaning anything.
private struct ChangeBadge: View {
    let text: String
    let isUp: Bool
    let isFlat: Bool

    var body: some View {
        Text(verbatim: text)
            .font(.caption2.weight(.medium))
            .monospacedDigit()
            .foregroundStyle(tint)
            .padding(.horizontal, Theme.Space.xs)
            .padding(.vertical, 2)
            .background(isFlat ? Color.clear : tint.opacity(0.12), in: .rect(cornerRadius: Theme.Radius.day))
            .lineLimit(1)
    }

    private var tint: Color {
        if isFlat { return .secondary }
        return isUp ? Theme.Palette.brand : Theme.Palette.holiday
    }
}

private struct SourceNote: View {
    let label: LocalizedStringResource
    let date: Date
    let name: String
    let url: URL

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            Text("\(String(localized: label)) \(Self.formatter.string(from: date))")
            Link(name, destination: url)
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private static let formatter = NepalTime.displayFormatter("d MMM yyyy")
}

private struct UnavailableNote: View {
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
#Preview("Bazar") {
    BazarView(model: .preview(), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
}
#endif
