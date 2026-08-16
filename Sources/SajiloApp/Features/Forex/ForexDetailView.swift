import SwiftUI

/// PRD §5.5: buy/sell for favourite currencies, an NPR converter both ways, and
/// the source's own published time.
struct ForexDetailView: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var amountText = "1"
    @State private var selectedCode = "USD"
    @State private var isReversed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    if let forex = model.forex {
                        converter(using: forex)
                        favourites
                        allRates(forex)
                        source(forex)
                    } else {
                        Label(
                            model.forexError ?? "No rates cached yet.",
                            systemImage: "wifi.slash"
                        )
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .cardSection()
                    }

                    Spacer(minLength: 0)
                }
                .padding(Theme.Space.m)
            }
        }
        .onAppear {
            selectedCode = model.headlineRate?.currencyCode ?? "USD"
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

            Text("Exchange Rates")
                .font(.headline)

            Spacer(minLength: 0)

            Button("Refresh", systemImage: "arrow.clockwise") {
                Task { await model.refreshForex() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(IconButtonStyle())
            .disabled(model.isForexLoading)
            .accessibilityLabel("Refresh rates")
        }
        .routeHeader()
    }

    // MARK: - Converter

    @ViewBuilder
    private func converter(using forex: ForexSnapshot) -> some View {
        let rate = forex.rate(for: selectedCode)

        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(spacing: Theme.Space.s) {
                TextField("Amount", text: $amountText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 96)
                    .accessibilityLabel("Amount")

                Picker("Currency", selection: $selectedCode) {
                    ForEach(forex.rates) { rate in
                        Text(verbatim: rate.currencyCode).tag(rate.currencyCode)
                    }
                }
                .labelsHidden()
                .frame(width: 84)

                Button("Swap", systemImage: "arrow.left.arrow.right") {
                    withAnimation(motion) { isReversed.toggle() }
                }
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(isReversed ? "Convert currency to rupees" : "Convert rupees to currency")

                Spacer(minLength: 0)
            }

            if let rate {
                Text(conversionText(for: rate))
                    .font(.title3.weight(.semibold))
                    .contentTransition(.numericText())
                    .animation(motion, value: amountText)

                Text(isReversed
                     ? "At NRB's sell rate, Rs \(rate.sellText) per \(rate.unitLabel)"
                     : "At NRB's buy rate, Rs \(rate.buyText) per \(rate.unitLabel)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Rate unavailable for \(selectedCode)")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .cardSection()
    }

    /// The bank buys foreign currency from you at `buy` and sells it at `sell`,
    /// so each direction has to use the side the customer actually gets.
    private func conversionText(for rate: ForexRate) -> String {
        let amount = Double(amountText) ?? 0
        if isReversed {
            return "Rs \(ForexRate.amount(amount)) = \(ForexRate.amount(rate.amount(forNPR: amount))) \(rate.currencyCode)"
        }
        return "\(ForexRate.amount(amount)) \(rate.currencyCode) = Rs \(ForexRate.amount(rate.npr(forAmount: amount)))"
    }

    // MARK: - Rate lists

    @ViewBuilder
    private var favourites: some View {
        let rates = model.favouriteRates
        if !rates.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Text("Favourites")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(rates) { RateRow(rate: $0) }
            }
            .cardSection()
        }
    }

    @ViewBuilder
    private func allRates(_ forex: ForexSnapshot) -> some View {
        let others = forex.rates.filter { !model.forexFavourites.contains($0.currencyCode) }
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Text("All currencies")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(others) { RateRow(rate: $0) }
            }
            .cardSection()
        }
    }

    @ViewBuilder
    private func source(_ forex: ForexSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            Text("Published \(Self.publishedFormatter.string(from: forex.sourceTimestamp))")
            Link("Nepal Rastra Bank", destination: URL(string: "https://www.nrb.org.np/")!)
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private static let publishedFormatter = NepalTime.displayFormatter("d MMM yyyy, HH:mm")
}

private struct RateRow: View {
    let rate: ForexRate

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text(rate.unitLabel)
                    .font(.callout.weight(.medium))
                Text(rate.currencyName)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Spacer(minLength: Theme.Space.s)

            VStack(alignment: .trailing, spacing: 0) {
                Text(rate.buyText)
                    .font(.callout.weight(.medium))
                    .monospacedDigit()
                Text("sell \(rate.sellText)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(rate.currencyName), buy \(rate.buyText) rupees, sell \(rate.sellText) rupees"
                + (rate.unit == 1 ? "" : " per \(rate.unit)")
        )
    }
}
