import SwiftUI

/// A minimal trend line for the forex card.
///
/// The weather card carries a sky wash and moving precipitation, so a forex
/// card with nothing behind it left the pair looking unfinished rather than
/// deliberate. This gives the rate its own quiet signal using data the provider
/// already fetches — no extra request, no invented content.
struct SparklineView: View {
    let values: [Double]
    var lineWidth: CGFloat = 1.2

    var body: some View {
        GeometryReader { proxy in
            let points = points(in: proxy.size)

            ZStack {
                // A soft fill under the line so it reads as a chart rather than
                // a stray stroke, without adding a second visible element.
                shape(through: points, closedIn: proxy.size)
                    .fill(
                        LinearGradient(
                            colors: [tint.opacity(0.22), tint.opacity(0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                shape(through: points, closedIn: nil)
                    .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            }
        }
        .accessibilityHidden(true)
    }

    /// Green rising, red falling — the same pairing as every figure beside it.
    /// A line that climbs while its percentage reads green in a different
    /// colour would look like two unrelated signals.
    private var tint: Color {
        guard let first = values.first, let last = values.last else { return Theme.Palette.brand }
        return last >= first ? Theme.Palette.positive : Theme.Palette.holiday
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1,
              let low = values.min(),
              let high = values.max(),
              high > low else {
            return []
        }

        let stepX = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            let normalised = (value - low) / (high - low)
            // Inset vertically so the stroke is not clipped at either extreme.
            let y = size.height - (CGFloat(normalised) * (size.height - lineWidth)) - lineWidth / 2
            return CGPoint(x: CGFloat(index) * stepX, y: y)
        }
    }

    private func shape(through points: [CGPoint], closedIn size: CGSize?) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
            if let size, let last = points.last {
                path.addLine(to: CGPoint(x: last.x, y: size.height))
                path.addLine(to: CGPoint(x: first.x, y: size.height))
                path.closeSubpath()
            }
        }
    }
}
