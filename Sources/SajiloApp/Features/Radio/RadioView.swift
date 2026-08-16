import SwiftUI

/// Live Nepal radio, played directly from the broadcaster stream Ratopati
/// publishes for each station. Sajilo stores only the directory and resolved
/// stream URL; it does not relay or record audio.
struct RadioView: View {
    let model: AppModel
    let onBack: () -> Void

    @State private var query = ""
    @State private var hoveredStation: String?

    private var stations: [RadioStation] {
        guard let stations = model.radio?.stations else { return [] }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return stations }
        return stations.filter {
            $0.name.localizedStandardContains(trimmed)
                || ($0.frequency?.localizedStandardContains(trimmed) ?? false)
                // Ratopati's stable URL slug is the English/Romanised name,
                // while its visible station name is usually Devanagari.
                || $0.slug.replacingOccurrences(of: "-", with: " ").localizedStandardContains(trimmed)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            if model.radio != nil {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Space.m) {
                        if let station = model.radioPlayer.currentStation {
                            NowPlayingCard(
                                station: station,
                                isPlaying: model.radioPlayer.isPlaying,
                                isResolving: model.radioPlayer.isResolving,
                                toggle: { Task { await model.radioPlayer.toggle(station) } },
                                stop: { model.radioPlayer.stop() }
                            )
                        }

                        TextField(String(localized: L10n.radioSearch), text: $query)
                            .textFieldStyle(.roundedBorder)

                        LazyVStack(spacing: Theme.Space.xs) {
                            ForEach(stations) { station in
                                StationRow(
                                    station: station,
                                    isCurrent: model.radioPlayer.currentStation?.id == station.id,
                                    isPlaying: model.radioPlayer.currentStation?.id == station.id && model.radioPlayer.isPlaying,
                                    isResolving: model.radioPlayer.isResolving && model.radioPlayer.currentStation?.id != station.id,
                                    isHovering: hoveredStation == station.id,
                                    action: { Task { await model.radioPlayer.toggle(station) } }
                                )
                                .onHover { hoveredStation = $0 ? station.id : nil }
                            }
                        }

                        if stations.isEmpty {
                            Text(L10n.radioNoStations)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, Theme.Space.l)
                        }

                        if let error = model.radioPlayer.errorMessage ?? model.radioError {
                            Text(verbatim: error)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(Theme.Space.m)
                }
                .softScroll()
            } else {
                ContentUnavailableView(
                    L10n.radio,
                    systemImage: "dot.radiowaves.left.and.right",
                    description: Text(model.radioError ?? (model.isRadioLoading ? "Loading stations…" : "No stations yet."))
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await model.refreshRadioIfStale() }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.radio)
                .font(.headline)

            Spacer(minLength: 0)

            Button(L10n.refresh, systemImage: "arrow.clockwise") {
                Task { await model.refreshRadio() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(IconButtonStyle())
            .disabled(model.isRadioLoading)
            .accessibilityLabel("Refresh radio stations")
        }
        .routeHeader()
    }
}

private struct NowPlayingCard: View {
    let station: RadioStation
    let isPlaying: Bool
    let isResolving: Bool
    let toggle: () -> Void
    let stop: () -> Void

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.title3)
                .foregroundStyle(Theme.Palette.brand)
                .frame(width: 28)

            EqualizerView(isPlaying: isPlaying)

            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: station.name)
                    .font(.callout.weight(.semibold))
                    .lineLimit(1)
                if let frequency = station.frequency {
                    Text(verbatim: frequency)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 0)

            Button(action: toggle) {
                Image(systemName: isResolving ? "arrow.clockwise" : (isPlaying ? "pause.fill" : "play.fill"))
            }
            .buttonStyle(IconButtonStyle())
            .disabled(isResolving)

            Button(action: stop) {
                Image(systemName: "stop.fill")
            }
            .buttonStyle(IconButtonStyle())
            .accessibilityLabel("Stop radio")
        }
        .padding(Theme.Space.s)
        .background(Theme.Palette.brand.opacity(0.10), in: .rect(cornerRadius: Theme.Radius.card))
    }
}

/// Remains visible above Sajilo's navigation while a station is playing, so
/// leaving the Radio screen never makes audio feel detached from the app.
struct RadioMiniPlayer: View {
    let station: RadioStation
    let isPlaying: Bool
    let isResolving: Bool
    let openRadio: () -> Void
    let togglePlayback: () -> Void
    let stop: () -> Void

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            EqualizerView(isPlaying: isPlaying)

            Button(action: openRadio) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.radio)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(verbatim: station.name)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Now playing \(station.name)")
            .accessibilityHint("Opens radio")

            Button(action: togglePlayback) {
                Image(systemName: isResolving ? "arrow.clockwise" : (isPlaying ? "pause.fill" : "play.fill"))
            }
            .buttonStyle(IconButtonStyle())
            .disabled(isResolving)
            .accessibilityLabel(isPlaying ? "Pause radio" : "Play radio")

            Button(action: stop) {
                Image(systemName: "stop.fill")
            }
            .buttonStyle(IconButtonStyle())
            .accessibilityLabel("Stop radio")
        }
        .padding(.horizontal, Theme.Space.m)
        .padding(.vertical, Theme.Space.xs)
        .background(Theme.Palette.brand.opacity(0.10))
        .overlay(alignment: .top) {
            Divider().opacity(0.45)
        }
    }
}

private struct StationRow: View {
    let station: RadioStation
    let isCurrent: Bool
    let isPlaying: Bool
    let isResolving: Bool
    let isHovering: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Space.s) {
                if isCurrent {
                    EqualizerView(isPlaying: isPlaying)
                } else {
                    Image(systemName: "play.circle")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: station.name)
                        .font(.callout.weight(isCurrent ? .semibold : .regular))
                        .lineLimit(1)
                    if let frequency = station.frequency {
                        Text(verbatim: frequency)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 0)

                if isCurrent && isResolving {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(Theme.Space.s)
            .background(
                isCurrent ? Theme.Palette.brand.opacity(0.10) : (isHovering ? Theme.Palette.hover : Theme.Palette.surface),
                in: .rect(cornerRadius: Theme.Radius.card)
            )
        }
        .buttonStyle(.plain)
        .contentShape(.rect)
        .animation(.easeOut(duration: 0.12), value: isHovering)
        .accessibilityLabel(station.frequency.map { "\(station.name), \($0)" } ?? station.name)
        .accessibilityHint(isCurrent && isPlaying ? "Pauses radio" : "Plays radio")
    }
}

/// A modest playback indicator, deliberately not an audio meter: a streamed
/// station does not expose safe per-sample levels to this view. It moves only
/// while the active station is playing and stays still for Reduce Motion.
private struct EqualizerView: View {
    let isPlaying: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isRaised = false

    private let low: [CGFloat] = [0.32, 0.75, 0.42, 0.62]
    private let high: [CGFloat] = [0.92, 0.44, 0.78, 1.0]

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(low.indices, id: \.self) { index in
                Capsule()
                    .fill(Theme.Palette.brand)
                    .frame(width: 2.5, height: 15)
                    .scaleEffect(y: height(for: index), anchor: .center)
            }
        }
        .frame(width: 18, height: 18)
        .accessibilityHidden(true)
        .onAppear { updateAnimation() }
        .onChange(of: isPlaying) { updateAnimation() }
        .onChange(of: reduceMotion) { updateAnimation() }
    }

    private func height(for index: Int) -> CGFloat {
        guard isPlaying else { return 0.28 }
        guard reduceMotion == false else { return high[index] }
        return isRaised ? high[index] : low[index]
    }

    private func updateAnimation() {
        guard isPlaying, reduceMotion == false else {
            isRaised = false
            return
        }
        withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) {
            isRaised = true
        }
    }
}
