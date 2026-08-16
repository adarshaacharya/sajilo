import AppKit
import SwiftUI

/// Headlines, each opening in the default browser.
///
/// PRD §11 is explicit that news means "links that open in the default
/// browser, never an embedded reader", and this route holds to that: no
/// article text is stored, shown, or fetched beyond the feed's own title.
struct NewsView: View {
    let model: AppModel
    let onBack: () -> Void

    @Environment(\.openURL) private var openURL

    /// How much of the fetched set is on screen.
    ///
    /// This is progressive reveal, not pagination. RSS has no pages: the five
    /// feeds return everything they are going to return in one response — about
    /// 135 headlines — so it is all fetched once and shown a screenful at a
    /// time. Rendering 135 rows up front would cost layout for content nobody
    /// has scrolled to.
    @State private var visibleCount = Self.pageSize

    private static let pageSize = 20

    var body: some View {
        VStack(spacing: 0) {
            header

            if let items = model.news?.items, !items.isEmpty {
                ScrollView {
                    LazyVStack(spacing: Theme.Space.xs) {
                        ForEach(Array(items.prefix(visibleCount))) { item in
                            HeadlineRow(item: item) { openURL(item.link) }
                                .onAppear {
                                    // Reveal the next screenful as the last
                                    // visible row scrolls in.
                                    guard item.id == items.prefix(visibleCount).last?.id,
                                          visibleCount < items.count else { return }
                                    visibleCount = min(visibleCount + Self.pageSize, items.count)
                                }
                        }

                        if visibleCount < items.count {
                            Text("\(items.count - visibleCount) more")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Theme.Space.xs)
                        }

                        if let failed = model.news?.failedSources, !failed.isEmpty {
                            // Partial results say so rather than presenting
                            // themselves as the whole picture.
                            Text("Could not reach \(failed.joined(separator: ", ")).")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, Theme.Space.xs)
                        }

                        if let fetchedAt = model.news?.fetchedAt {
                            Text(AppModel.freshnessText(for: fetchedAt))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(Theme.Space.m)
                }
                .softScroll()
            } else {
                VStack {
                    Spacer()
                    Label(
                        model.newsError ?? (model.isNewsLoading ? "Loading headlines…" : "No headlines yet."),
                        systemImage: model.newsError == nil ? "newspaper" : "wifi.slash"
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .task { await model.refreshNewsIfStale() }
        // A refresh replaces the list, so start from the top again rather than
        // leaving the reveal window pointing into the middle of new content.
        .onChange(of: model.news?.fetchedAt) { visibleCount = Self.pageSize }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.news)
                .font(.headline)

            Spacer(minLength: 0)

            Button(L10n.refresh, systemImage: "arrow.clockwise") {
                Task { await model.refreshNews() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(IconButtonStyle())
            .disabled(model.isNewsLoading)
        }
        .routeHeader()
    }
}

struct HeadlineRow: View {
    let item: NewsItem
    let action: () -> Void

    @State private var isHovering = false

    /// The Kathmandu Post dates a story only to the day, so a relative time
    /// would report a story filed this afternoon as "22 hours ago" — precise,
    /// confident, and wrong. A day-precise date says which day instead.
    static func age(of date: Date, precision: DatePrecision, now: Date = .now) -> String {
        switch precision {
        case .exact:
            return relative.localizedString(for: date, relativeTo: now)
        case .day:
            let calendar = NepalTime.calendar
            if calendar.isDate(date, inSameDayAs: now) { return "Today" }
            if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
               calendar.isDate(date, inSameDayAs: yesterday) {
                return "Yesterday"
            }
            return dayOnly.string(from: date)
        }
    }

    private static let dayOnly = NepalTime.displayFormatter("d MMM")

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                Text(item.title)
                    .font(.nepali(13))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: Theme.Space.xs) {
                    Text(item.sourceName)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(Theme.Palette.brand)

                    if let published = item.published {
                        Text(verbatim: "·")
                            .foregroundStyle(.tertiary)
                        Text(verbatim: HeadlineRow.age(of: published, precision: item.precision))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 0)

                    Image(systemName: "arrow.up.forward")
                        .font(.system(size: 8))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(Theme.Space.s)
            .background(
                isHovering ? Theme.Palette.hover : Theme.Palette.surface,
                in: .rect(cornerRadius: Theme.Radius.card)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.easeOut(duration: 0.12), value: isHovering)
        .accessibilityLabel("\(item.title). \(item.sourceName).")
        .accessibilityHint("Opens in your browser")
    }

    private static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}
