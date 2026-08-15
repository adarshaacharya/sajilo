import SwiftUI

/// The moving layer behind the weather detail: precipitation, stars, or a soft
/// sun glow depending on conditions.
///
/// Two things keep this honest for a menu-bar utility. The timeline is
/// `paused` whenever the route is not on screen — the route layers stay
/// mounted for stable height, so without that it would animate forever behind
/// the dashboard. And under Reduce Motion it renders a single still frame
/// rather than nothing, so the look survives without the movement.
struct WeatherAtmosphereView: View {
    let condition: WeatherCondition
    let phase: SkyPhase
    let isActive: Bool
    /// Particle colour. The hero draws on a dark sky and wants white; the
    /// dashboard card draws on a normal surface and needs an adaptive tone.
    var tint: Color = .white
    /// Scales particle counts for smaller surfaces. The dashboard card is about
    /// a twelfth of the hero's area, so the hero's density would read as static.
    var densityScale: Double = 1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                Canvas { context, size in
                    draw(in: &context, size: size, time: 0)
                }
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isActive)) { timeline in
                    Canvas { context, size in
                        draw(
                            in: &context,
                            size: size,
                            time: timeline.date.timeIntervalSinceReferenceDate
                        )
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(in context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        if phase == .night, condition == .clear || condition == .partlyCloudy {
            drawStars(in: &context, size: size, time: time)
        }
        if phase.isDaylight, condition == .clear {
            drawSunGlow(in: &context, size: size, time: time)
        }
        if condition == .fog || condition == .overcast {
            drawHaze(in: &context, size: size, time: time)
        }

        let precipitation = condition.precipitation
        guard !precipitation.isEmpty, scaledDensity(precipitation.density) > 0 else { return }
        switch precipitation.kind {
        case .rain: drawRain(precipitation, in: &context, size: size, time: time)
        case .snow: drawSnow(precipitation, in: &context, size: size, time: time)
        }
    }

    // MARK: - Layers

    private func scaledDensity(_ density: Int) -> Int {
        Int((Double(density) * densityScale).rounded())
    }

    private func drawRain(
        _ spec: WeatherCondition.Precipitation,
        in context: inout GraphicsContext,
        size: CGSize,
        time: TimeInterval
    ) {
        // A slight lean reads as wind and stops the streaks looking like a
        // static pinstripe pattern.
        let lean = 2.4
        for index in 0..<scaledDensity(spec.density) {
            let x = noise(index, 1) * size.width
            let offset = noise(index, 2)
            let travel = (time * spec.speed / 1.4 + offset).truncatingRemainder(dividingBy: 1)
            let y = travel * (size.height + spec.length) - spec.length
            let opacity = 0.18 + noise(index, 3) * 0.30

            var path = Path()
            path.move(to: CGPoint(x: x, y: y))
            path.addLine(to: CGPoint(x: x + lean, y: y + spec.length))
            context.stroke(
                path,
                with: .color(tint.opacity(opacity)),
                lineWidth: 0.9
            )
        }
    }

    private func drawSnow(
        _ spec: WeatherCondition.Precipitation,
        in context: inout GraphicsContext,
        size: CGSize,
        time: TimeInterval
    ) {
        for index in 0..<scaledDensity(spec.density) {
            let offset = noise(index, 2)
            let travel = (time * spec.speed / 6 + offset).truncatingRemainder(dividingBy: 1)
            let y = travel * (size.height + spec.length) - spec.length
            // Sway, so flakes drift rather than dropping on rails.
            let sway = sin(time * 0.6 + noise(index, 4) * 6.28) * 8
            let x = noise(index, 1) * size.width + sway
            let radius = 1.0 + noise(index, 5) * 1.6

            context.fill(
                Path(ellipseIn: CGRect(x: x, y: y, width: radius, height: radius)),
                with: .color(tint.opacity(0.28 + noise(index, 3) * 0.35))
            )
        }
    }

    private func drawStars(in context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        for index in 0..<scaledDensity(70) {
            let x = noise(index, 11) * size.width
            // Kept to the upper band so stars do not sit behind the readout.
            let y = noise(index, 12) * size.height * 0.62
            let twinkle = 0.35 + 0.35 * sin(time * 0.9 + noise(index, 13) * 6.28)
            let radius = 0.7 + noise(index, 14) * 1.1

            context.fill(
                Path(ellipseIn: CGRect(x: x, y: y, width: radius, height: radius)),
                with: .color(tint.opacity(twinkle * 0.7))
            )
        }
    }

    private func drawSunGlow(in context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        let breathe = 1 + 0.04 * sin(time * 0.35)
        let radius = size.width * 0.30 * breathe
        let centre = CGPoint(x: size.width * 0.80, y: size.height * 0.22)
        let rect = CGRect(
            x: centre.x - radius,
            y: centre.y - radius,
            width: radius * 2,
            height: radius * 2
        )

        context.fill(
            Path(ellipseIn: rect),
            with: .radialGradient(
                Gradient(colors: [tint.opacity(0.34), tint.opacity(0)]),
                center: centre,
                startRadius: 0,
                endRadius: radius
            )
        )
    }

    private func drawHaze(in context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        for index in 0..<max(1, scaledDensity(3)) {
            let drift = (time * 0.012 + noise(index, 21)).truncatingRemainder(dividingBy: 1)
            let x = drift * (size.width + 220) - 220
            let y = size.height * (0.18 + noise(index, 22) * 0.5)
            let width = 180 + noise(index, 23) * 120

            context.fill(
                Path(ellipseIn: CGRect(x: x, y: y, width: width, height: width * 0.32)),
                with: .color(tint.opacity(0.05))
            )
        }
    }

    // MARK: - Deterministic placement

    /// A cheap hash so each particle keeps the same position every frame.
    /// `Math.random` per frame would make them jitter instead of fall.
    private func noise(_ index: Int, _ salt: UInt64) -> Double {
        var x = UInt64(bitPattern: Int64(index &+ 1)) &* 6_364_136_223_846_793_005 &+ salt &* 1_442_695_040_888_963_407
        x ^= x >> 33
        x = x &* 0xff51_afd7_ed55_8ccd
        x ^= x >> 33
        return Double(x % 10_000) / 10_000
    }
}
