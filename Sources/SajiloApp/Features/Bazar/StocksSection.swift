import SwiftUI

/// NEPSE inside the Bazar route.
///
/// Built to be *read*, not just glanced at. The price table Sajilo already
/// downloads carries twenty-four columns for all ~340 traded companies, and the
/// market page carries the sector sub-indices and four leaderboards, so
/// searching the whole market and opening any company costs no further network
/// at all — every screen here is served from one snapshot.
///
/// Three levels, in the order someone actually uses them: what the market did,
/// what you follow, and then any company you care to look up.
struct StocksSection: View {
    let model: AppModel

    @State private var query = ""
    @State private var opened: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(model: AppModel, opened: String? = nil) {
        self.model = model
        _opened = State(initialValue: opened)
    }

    var body: some View {
        if let snapshot = model.stocks {
            VStack(alignment: .leading, spacing: Theme.Space.m) {
                SearchField(query: $query)

                if let symbol = opened, let quote = snapshot.quote(symbol: symbol) {
                    CompanyDetail(
                        quote: quote,
                        isFollowed: model.stockWatchlist.contains(quote.symbol),
                        toggleFollow: { model.toggleStockWatchlist(quote.symbol) },
                        close: { opened = nil }
                    )
                } else if !query.isEmpty {
                    SearchResults(
                        results: snapshot.search(query),
                        watchlist: model.stockWatchlist,
                        open: { opened = $0 },
                        toggleFollow: { model.toggleStockWatchlist($0) }
                    )
                } else {
                    if let index = snapshot.nepse {
                        IndexHeadline(index: index, publishedOn: snapshot.publishedOn ?? snapshot.fetchedAt)
                    }
                    WatchlistCard(model: model, open: { opened = $0 })
                    MoversCard(snapshot: snapshot, open: { opened = $0 })
                    SectorsCard(indices: snapshot.subIndices)
                }

              
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.22), value: opened)
            .animation(reduceMotion ? nil : .snappy(duration: 0.22), value: query.isEmpty)
        } else {
            UnavailableNote(
                message: model.stocksError ?? "No market snapshot cached yet.",
                isLoading: model.isStocksLoading
            )
        }
    }
}

// MARK: - Search

private struct SearchField: View {
    @Binding var query: String

    var body: some View {
        HStack(spacing: Theme.Space.xs) {
            Image(systemName: "magnifyingglass")
                .font(.caption)
                .foregroundStyle(.tertiary)

            TextField(String(localized: L10n.stocksSearch), text: $query)
                .textFieldStyle(.plain)
                .font(.callout)

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.cancel)
            }
        }
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.day))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.day)
                .strokeBorder(Theme.Palette.surfaceBorder, lineWidth: 1)
        )
    }
}

private struct SearchResults: View {
    let results: [StockQuote]
    let watchlist: [String]
    let open: (String) -> Void
    let toggleFollow: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            if results.isEmpty {
                Text(L10n.stocksNoMatch)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                // Bounded: the market has ~340 companies and a popover cannot
                // usefully show them all. Typing one more letter is faster than
                // scrolling three hundred rows.
                ForEach(results.prefix(25)) { quote in
                    QuoteRow(
                        quote: quote,
                        isFollowed: watchlist.contains(quote.symbol),
                        open: { open(quote.symbol) },
                        toggleFollow: { toggleFollow(quote.symbol) }
                    )
                }
                if results.count > 25 {
                    Text(verbatim: "+\(results.count - 25)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .cardSection()
    }
}

// MARK: - Overview

private struct IndexHeadline: View {
    let index: MarketIndex
    let publishedOn: Date

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: index.name)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                ChangeBadge(text: index.changeText, isUp: index.isUp, isFlat: index.isFlat)
            }

            Text(verbatim: index.valueText)
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .monospacedDigit()
                .contentTransition(.numericText())

            Text(verbatim: "\(String(localized: L10n.bazarMarketTurnover)) · Rs \(NepaliNumberFormatter.grouped(index.turnover, fractionDigits: 0))")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

private struct WatchlistCard: View {
    let model: AppModel
    let open: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text(L10n.stocksWatchlist)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if model.stockWatchlist.isEmpty {
                Text(L10n.stocksEmptyWatchlist)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(model.stockWatchlist, id: \.self) { symbol in
                    if let quote = model.stocks?.quote(symbol: symbol) {
                        QuoteRow(
                            quote: quote,
                            isFollowed: true,
                            open: { open(symbol) },
                            toggleFollow: { model.toggleStockWatchlist(symbol) }
                        )
                    } else {
                        // Followed but not traded today — say so rather than
                        // dropping the row and looking like it was forgotten.
                        HStack(spacing: Theme.Space.s) {
                            Text(verbatim: symbol)
                                .font(.callout.weight(.semibold))
                            Text(L10n.bazarNotTradedToday)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            Spacer(minLength: 0)
                            FollowButton(isFollowed: true) { model.toggleStockWatchlist(symbol) }
                        }
                    }
                }
            }
        }
        .cardSection()
    }
}

/// The four leaderboards behind one segmented control, because they answer the
/// same question — what moved — and stacking all four would be a wall.
private struct MoversCard: View {
    let snapshot: StockMarketSnapshot
    let open: (String) -> Void

    @State private var board: MarketMover.Board = .gainers

    var body: some View {
        let rows = snapshot.movers(board)
        if !snapshot.movers.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Picker(L10n.stocksMovers, selection: $board) {
                    ForEach(MarketMover.Board.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                ForEach(rows) { mover in
                    Button { open(mover.symbol) } label: {
                        HStack(spacing: Theme.Space.s) {
                            Text(verbatim: mover.symbol)
                                .font(.caption.weight(.semibold))
                                .frame(width: 68, alignment: .leading)

                            Text(verbatim: NepaliNumberFormatter.grouped(mover.ltp, fractionDigits: 2))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()

                            Spacer(minLength: 0)

                            Text(verbatim: mover.metricText)
                                .font(.caption.weight(.medium))
                                .monospacedDigit()
                                .foregroundStyle(tint(for: mover))
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }

                if rows.isEmpty {
                    Text(L10n.stocksNoMatch)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .cardSection()
        }
    }

    private func tint(for mover: MarketMover) -> Color {
        switch mover.board {
        case .gainers: Theme.Palette.positive
        case .losers: Theme.Palette.holiday
        case .turnover, .volume: .secondary
        }
    }
}

/// Where the day actually happened. The headline index says the market moved;
/// this says which sectors carried it.
private struct SectorsCard: View {
    let indices: [MarketIndex]

    private let columns = [
        GridItem(.flexible(), spacing: Theme.Space.xxs),
        GridItem(.flexible(), spacing: Theme.Space.xxs),
    ]

    /// "Banking SubIndex" and "Hydropower Index" both end in a word that adds
    /// nothing once the card is titled Sectors, and dropping it buys the
    /// percentage room to sit clear of the name.
    static func shortName(_ name: String) -> String {
        var trimmed = name
        for suffix in [" SubIndex", " Sub Index", " Index"] where trimmed.hasSuffix(suffix) {
            trimmed.removeLast(suffix.count)
        }
        return trimmed
    }

    var body: some View {
        if !indices.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Text(L10n.stocksSectors)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: columns, spacing: Theme.Space.xxs) {
                    ForEach(indices) { index in
                        HStack(spacing: Theme.Space.xxs) {
                            Text(verbatim: Self.shortName(index.name))
                                .font(.caption2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            Spacer(minLength: Theme.Space.xxs)
                            Text(verbatim: index.percentText)
                                .font(.caption2.weight(.medium))
                                .monospacedDigit()
                                .foregroundStyle(
                                    index.isFlat ? AnyShapeStyle(.secondary)
                                        : AnyShapeStyle(index.isUp ? Theme.Palette.positive : Theme.Palette.holiday)
                                )
                        }
                        // Each sector sits on its own plate. Bare rows in
                        // adjacent columns ran together into one line —
                        // "Banking SubIndex -0.14% Hydropower Index +1.38%".
                        .padding(.horizontal, Theme.Space.xs)
                        .padding(.vertical, 3)
                        .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.day))
                    }
                }
            }
            .cardSection()
        }
    }
}

// MARK: - One company

/// Everything the day's row holds about one company.
///
/// No extra request: every figure here came down with the price table, so
/// opening a company is instant and works offline from the cached snapshot.
private struct CompanyDetail: View {
    let quote: StockQuote
    let isFollowed: Bool
    let toggleFollow: () -> Void
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .top, spacing: Theme.Space.s) {
                Button(action: close) {
                    Image(systemName: "chevron.left")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.back)

                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: quote.symbol)
                        .font(.title3.weight(.semibold))
                    if let name = quote.companyName {
                        Text(verbatim: name)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer(minLength: 0)

                FollowButton(isFollowed: isFollowed, toggle: toggleFollow)
            }

            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s) {
                Text(verbatim: quote.ltpText)
                    .font(.system(.title, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                ChangeBadge(text: quote.changeText, isUp: quote.isUp, isFlat: quote.isFlat)
                Spacer(minLength: 0)
            }

            if let low = quote.week52Low, let high = quote.week52High {
                RangeBar(
                    title: L10n.stocksWeek52,
                    low: low,
                    high: high,
                    position: quote.week52Position
                )
            }

            if let low = quote.low, let high = quote.high, high > low {
                RangeBar(
                    title: L10n.stocksDayRange,
                    low: low,
                    high: high,
                    position: (quote.ltp - low) / (high - low)
                )
            }

            Divider().opacity(0.5)

            StatGrid(quote: quote)

            Link(destination: quote.companyURL) {
                Text(L10n.stocksOpenSharesansar)
                    .font(.caption2)
            }
            .padding(.top, Theme.Space.xxs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSection()
    }
}

/// Where the price sits inside a range — one glance instead of comparing three
/// numbers. The marker is the point; the numbers underneath are the reference.
private struct RangeBar: View {
    let title: LocalizedStringResource
    let low: Double
    let high: Double
    let position: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Theme.Palette.surface)
                    if let position {
                        Capsule()
                            .fill(Theme.Palette.brand)
                            .frame(width: 3)
                            .offset(x: (proxy.size.width - 3) * position)
                    }
                }
            }
            .frame(height: 6)

            HStack {
                Text(verbatim: NepaliNumberFormatter.grouped(low, fractionDigits: 2))
                Spacer(minLength: 0)
                Text(verbatim: NepaliNumberFormatter.grouped(high, fractionDigits: 2))
            }
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(String(localized: title)) \(low) to \(high)")
    }
}

private struct StatGrid: View {
    let quote: StockQuote

    private let columns = [
        GridItem(.flexible(), alignment: .leading),
        GridItem(.flexible(), alignment: .leading),
        GridItem(.flexible(), alignment: .leading),
    ]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: Theme.Space.s) {
            stat(L10n.stocksOpen, quote.open)
            stat(L10n.stocksHigh, quote.high)
            stat(L10n.stocksLow, quote.low)
            stat(L10n.stocksPrevClose, quote.previousClose)
            stat(L10n.stocksVwap, quote.vwap)
            stat(L10n.stocksTraded, quote.volume, fractionDigits: 0)
            stat(L10n.stocksTrades, quote.transactions, fractionDigits: 0)
            stat(L10n.stocksAvg120, quote.average120Day)
            stat(L10n.stocksAvg180, quote.average180Day)
        }
    }

    /// A figure the source did not publish shows an em dash rather than a zero,
    /// which would read as a real value of nothing.
    @ViewBuilder
    private func stat(_ title: LocalizedStringResource, _ value: Double?, fractionDigits: Int = 2) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(verbatim: value.map { NepaliNumberFormatter.grouped($0, fractionDigits: fractionDigits) } ?? "—")
                .font(.caption.weight(.medium))
                .monospacedDigit()
        }
    }
}

// MARK: - Shared rows

private struct QuoteRow: View {
    let quote: StockQuote
    let isFollowed: Bool
    let open: () -> Void
    let toggleFollow: () -> Void

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Button(action: open) {
                HStack(spacing: Theme.Space.s) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: quote.symbol)
                            .font(.callout.weight(.semibold))
                        if let name = quote.companyName {
                            Text(verbatim: name)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: Theme.Space.xs)

                    VStack(alignment: .trailing, spacing: 1) {
                        Text(verbatim: quote.ltpText)
                            .font(.callout.weight(.medium))
                            .monospacedDigit()
                        Text(verbatim: quote.percentText)
                            .font(.caption2.weight(.medium))
                            .monospacedDigit()
                            .foregroundStyle(
                                quote.isFlat ? AnyShapeStyle(.secondary)
                                    : AnyShapeStyle(quote.isUp ? Theme.Palette.positive : Theme.Palette.holiday)
                            )
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            FollowButton(isFollowed: isFollowed, toggle: toggleFollow)
        }
    }
}

private struct FollowButton: View {
    let isFollowed: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            Image(systemName: isFollowed ? "star.fill" : "star")
                .font(.caption)
                .foregroundStyle(isFollowed ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.tertiary))
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFollowed ? L10n.stocksUnfollow : L10n.stocksFollow)
    }
}
