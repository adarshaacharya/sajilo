import Foundation
import Testing
@testable import SajiloApp

struct SkyPhaseTests {
    /// Real Kathmandu sun times for 2026-08-16, as returned by the provider.
    private let sunrise = SajiloAppTestsNepalDate(hour: 5, minute: 34)
    private let sunset = SajiloAppTestsNepalDate(hour: 18, minute: 41)

    @Test func usesTheRealSunTimesRatherThanFixedHours() {
        // 07:00 is past sunrise here, so it is full day — a fixed-hour rule
        // that called everything before 07:00 dawn would get this wrong.
        #expect(phase(at: 7, 0) == .day)
        #expect(phase(at: 5, 0) == .dawn)
        #expect(phase(at: 3, 0) == .night)
    }

    @Test func movesThroughEveryPhaseAcrossADay() {
        #expect(phase(at: 2, 0) == .night)
        #expect(phase(at: 5, 40) == .dawn)
        #expect(phase(at: 12, 0) == .day)
        #expect(phase(at: 18, 30) == .dusk)
        #expect(phase(at: 22, 0) == .night)
    }

    @Test func treatsTheTwilightBandsSymmetrically() {
        // 45 minutes either side of each crossing.
        #expect(phase(at: 4, 40) == .night)
        #expect(phase(at: 4, 55) == .dawn)
        #expect(phase(at: 6, 15) == .dawn)
        #expect(phase(at: 6, 25) == .day)
        #expect(phase(at: 17, 50) == .day)
        #expect(phase(at: 18, 5) == .dusk)
        #expect(phase(at: 19, 20) == .dusk)
        #expect(phase(at: 19, 30) == .night)
    }

    /// A cached reading from before sun times were stored must still render.
    @Test func fallsBackToHourBandsWithoutSunTimes() {
        #expect(SkyPhase.current(now: Self.nepalDate(hour: 2, minute: 0), sunrise: nil, sunset: nil) == .night)
        #expect(SkyPhase.current(now: Self.nepalDate(hour: 6, minute: 0), sunrise: nil, sunset: nil) == .dawn)
        #expect(SkyPhase.current(now: Self.nepalDate(hour: 12, minute: 0), sunrise: nil, sunset: nil) == .day)
        #expect(SkyPhase.current(now: Self.nepalDate(hour: 18, minute: 0), sunrise: nil, sunset: nil) == .dusk)
    }

    @Test func everyPhaseSuppliesATwoStopGradient() {
        for phase in [SkyPhase.night, .dawn, .day, .dusk] {
            #expect(phase.gradient.count == 2, "\(phase) gradient")
            #expect(!phase.accessibilityDescription.isEmpty)
        }
        #expect(SkyPhase.day.isDaylight)
        #expect(SkyPhase.dawn.isDaylight)
        #expect(!SkyPhase.night.isDaylight)
        #expect(!SkyPhase.dusk.isDaylight)
    }

    // MARK: - Helpers

    private func phase(at hour: Int, _ minute: Int) -> SkyPhase {
        SkyPhase.current(now: Self.nepalDate(hour: hour, minute: minute), sunrise: sunrise, sunset: sunset)
    }

    private static func nepalDate(hour: Int, minute: Int) -> Date {
        SajiloAppTestsNepalDate(hour: hour, minute: minute)
    }
}

/// Free function so both the instance properties and the static helpers can
/// build fixture dates before `self` exists.
private func SajiloAppTestsNepalDate(hour: Int, minute: Int) -> Date {
    Calendar.nepal.date(
        from: DateComponents(year: 2026, month: 8, day: 16, hour: hour, minute: minute)
    )!
}
