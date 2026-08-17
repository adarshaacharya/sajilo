import SwiftUI

/// What things cost today: gold and silver (PRD §5.6), NOC's retail fuel price
/// (§5.7), and the Kalimati board's daily produce rates.
///
/// All three live behind one route because they answer the same question, and
/// because the dashboard stays calendar-first. None of them gets a card on the
/// main screen.
struct BazarView: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var section: Section = .stocks
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Section: String, CaseIterable, Identifiable {
        case stocks, metals, fuel, vegetables
        var id: String { rawValue }

        var title: LocalizedStringResource {
            switch self {
            case .stocks: L10n.bazarStocks
            case .metals: L10n.bazarMetals
            case .fuel: L10n.bazarFuel
            case .vegetables: L10n.bazarVegetables
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
                    case .stocks: StocksSection(model: model)
                    case .metals: MetalsSection(model: model)
                    case .fuel: FuelSection(model: model)
                    case .vegetables: VegetablesSection(model: model)
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
        switch section {
        case .stocks: model.isStocksLoading
        case .metals: model.isMetalsLoading
        case .fuel: model.isFuelLoading
        case .vegetables: model.isVegetablesLoading
        }
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

// MARK: - Vegetables

/// Kalimati's daily table is around a hundred rows, which is far more than a
/// 380pt popover can usefully show. Search narrows it, and pinning lifts the
/// handful someone actually buys to the top — the list is browsed maybe once
/// and then only ever consulted for the same five things.
private struct VegetablesSection: View {
    let model: AppModel

    @State private var query = ""
    @Environment(\.numeralStyle) private var numerals

    var body: some View {
        if model.vegetables != nil {
            let groups = model.vegetables(matching: query)

            VStack(alignment: .leading, spacing: Theme.Space.m) {
                TextField(String(localized: L10n.bazarSearchProduce), text: $query)
                    .textFieldStyle(.roundedBorder)
                    .labelsHidden()

                if groups.pinned.isEmpty && groups.others.isEmpty {
                    Text(L10n.bazarNoMatch)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSection()
                }

                if !groups.pinned.isEmpty {
                    produceList(L10n.bazarPinned, groups.pinned)
                }
                if !groups.others.isEmpty {
                    produceList(
                        groups.pinned.isEmpty ? nil : L10n.bazarAllProduce,
                        groups.others
                    )
                }

                // Said plainly rather than in a footnote: these are wholesale
                // rates, and someone comparing them with what they paid at a
                // stall should know why the numbers differ.
                Text(L10n.bazarWholesaleNote)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                sourceNote
            }
        } else {
            UnavailableNote(
                message: model.vegetablesError ?? "No prices cached yet.",
                isLoading: model.isVegetablesLoading
            )
        }
    }

    private func produceList(_ title: LocalizedStringResource?, _ prices: [VegetablePrice]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            if let title {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            ForEach(prices) { price in
                ProduceRow(
                    price: price,
                    isPinned: model.vegetableFavourites.contains(price.name),
                    togglePin: { model.toggleVegetableFavourite(price.name) }
                )
            }
        }
        .cardSection()
    }

    @ViewBuilder
    private var sourceNote: some View {
        if let published = model.vegetables?.publishedOn {
            // The board's own Bikram Sambat date, not the fetch time: it does
            // not publish on every holiday, so today's screen sometimes carries
            // the last trading day's rates and should say which day.
            SourceNote(
                label: L10n.bazarPublished,
                nepaliDate: published,
                numerals: numerals,
                name: "Kalimati Fruits and Vegetable Market Development Board",
                url: URL(string: "https://kalimatimarket.gov.np/price")!
            )
        }
    }
}

private struct ProduceRow: View {
    let price: VegetablePrice
    let isPinned: Bool
    let togglePin: () -> Void

    @State private var isHovering = false

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Button(action: togglePin) {
                Image(systemName: isPinned ? "pin.fill" : "pin")
                    .font(.caption2)
                    .foregroundStyle(isPinned ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.tertiary))
                    .frame(width: 14)
            }
            .buttonStyle(.plain)
            // Revealed on hover so ninety unpinned rows are not ninety pins,
            // but always present once pinned.
            .opacity(isPinned || isHovering ? 1 : 0)
            .accessibilityLabel(L10n.bazarPin)

            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: price.name)
                    .font(.callout)
                    .lineLimit(1)
                if let english = price.englishName {
                    Text(verbatim: english)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer(minLength: Theme.Space.s)

            VStack(alignment: .trailing, spacing: 0) {
                Text(verbatim: "\(price.averageText) \(price.unit.displayName)")
                    .font(.callout.weight(.medium))
                    .monospacedDigit()
                Text(verbatim: price.rangeText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .contentShape(.rect)
        .onHover { isHovering = $0 }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(price.englishName ?? price.name), \(price.averageText) \(price.unit.displayName)"
        )
    }
}

// MARK: - Shared

/// A rise reads in the accent and a fall in the holiday red — the two colours
/// the palette already carries. No movement gets neither, because a badge that
/// is always coloured stops meaning anything.
struct ChangeBadge: View {
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

struct SourceNote: View {
    let label: LocalizedStringResource
    let stamp: String
    let name: String
    let url: URL

    init(label: LocalizedStringResource, date: Date, name: String, url: URL) {
        self.label = label
        self.stamp = Self.formatter.string(from: date)
        self.name = name
        self.url = url
    }

    /// Kalimati dates its table in Bikram Sambat, so that is what is shown —
    /// converting it to a Gregorian date would print something the source
    /// never said.
    init(
        label: LocalizedStringResource,
        nepaliDate: NepaliDate,
        numerals: NumeralStyle,
        name: String,
        url: URL
    ) {
        self.label = label
        self.stamp = "\(numerals.string(from: nepaliDate.day)) \(nepaliDate.nepaliMonthName) \(numerals.string(from: nepaliDate.year))"
        self.name = name
        self.url = url
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            Text("\(String(localized: label)) \(stamp)")
            Link(name, destination: url)
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private static let formatter = NepalTime.displayFormatter("d MMM yyyy")
}

struct UnavailableNote: View {
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
