import AppKit
import SwiftUI

/// The offline toolkit (PRD §5.9).
///
/// Everything here is local arithmetic — no network, no provider, no cache, no
/// source to go stale. That is the point: these work on a plane, and they are
/// the calculations people currently do on a phone calculator and get wrong.
struct ToolsView: View {
    let onBack: () -> Void

    @State private var tool: Tool = .land

    enum Tool: String, CaseIterable, Identifiable {
        case land, weight, vat, interest
        var id: String { rawValue }

        var title: LocalizedStringResource {
            switch self {
            case .land: L10n.toolLand
            case .weight: L10n.toolWeight
            case .vat: L10n.toolVAT
            case .interest: L10n.toolInterest
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    Picker(L10n.tools, selection: $tool) {
                        ForEach(Tool.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    switch tool {
                    case .land: LandToolView()
                    case .weight: WeightToolView()
                    case .vat: VATToolView()
                    case .interest: InterestToolView()
                    }

                    Spacer(minLength: 0)
                }
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.tools)
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

// MARK: - Land

private struct LandToolView: View {
    @State private var amount = "1"
    @State private var unit: LandUnit = .ropani

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            HStack(alignment: .bottom, spacing: Theme.Space.s) {
                ToolField(text: $amount, label: L10n.amount)
                ToolControl(label: L10n.unit) {
                    Picker(L10n.unit, selection: $unit) {
                        ForEach(LandUnit.allCases) { Text(verbatim: $0.displayName).tag($0) }
                    }
                    .labelsHidden()
                }
                .frame(width: 116)
            }

            // Both systems at once: the cross conversion is the part nobody can
            // do in their head, and a deed in one system is often being
            // compared against a listing in the other.
            ResultCard(title: L10n.hillSystem, value: hill.compact, caption: hillDetail)
            ResultCard(title: L10n.teraiSystem, value: terai.compact, caption: teraiDetail)
            ResultCard(title: L10n.area, value: areaText, caption: nil)
        }
    }

    private var squareFeet: Double {
        LandConverter.convert(Double(amount) ?? 0, from: unit, to: .squareFeet)
    }

    private var hill: LandConverter.HillArea { LandConverter.hillArea(squareFeet: squareFeet) }
    private var terai: LandConverter.TeraiArea { LandConverter.teraiArea(squareFeet: squareFeet) }

    private var hillDetail: String { "रोपनी–आना–पैसा–दाम" }
    private var teraiDetail: String { "बिघा–कठ्ठा–धुर" }

    private var areaText: String {
        let metres = LandConverter.convert(squareFeet, from: .squareFeet, to: .squareMetre)
        return "\(number(squareFeet)) sq ft · \(number(metres)) m²"
    }
}

// MARK: - Weight

private struct WeightToolView: View {
    @State private var amount = "1"
    @State private var unit: WeightUnit = .tola

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            HStack(alignment: .bottom, spacing: Theme.Space.s) {
                ToolField(text: $amount, label: L10n.amount)
                ToolControl(label: L10n.unit) {
                    Picker(L10n.unit, selection: $unit) {
                        ForEach(WeightUnit.allCases) { Text(verbatim: $0.displayName).tag($0) }
                    }
                    .labelsHidden()
                }
                .frame(width: 116)
            }

            ForEach(WeightUnit.allCases.filter { $0 != unit }) { target in
                ResultCard(
                    title: LocalizedStringResource(stringLiteral: target.displayName),
                    value: number(WeightConverter.convert(Double(amount) ?? 0, from: unit, to: target)),
                    caption: target.nepaliName
                )
            }
        }
    }
}

// MARK: - VAT

private struct VATToolView: View {
    @State private var amount = "1000"
    @State private var isInclusive = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            ToolField(text: $amount, label: L10n.amount)

            Toggle(L10n.priceIncludesVAT, isOn: $isInclusive)

            ResultCard(title: L10n.baseAmount, value: "Rs \(number(result.base))", caption: nil)
            ResultCard(title: L10n.vatAmount, value: "Rs \(number(result.vat))", caption: "13%")
            ResultCard(title: L10n.total, value: "Rs \(number(result.total))", caption: nil)
        }
    }

    private var result: FinanceCalculator.VATBreakdown {
        let value = Double(amount) ?? 0
        return isInclusive
            ? FinanceCalculator.removingVAT(from: value)
            : FinanceCalculator.addingVAT(to: value)
    }
}

// MARK: - Interest

private struct InterestToolView: View {
    @State private var principal = "100000"
    @State private var rate = "12"
    @State private var years = "2"

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            ToolField(text: $principal, label: L10n.principal)
            HStack(alignment: .bottom, spacing: Theme.Space.s) {
                ToolField(text: $rate, label: L10n.ratePercent)
                ToolField(text: $years, label: L10n.years)
            }

            ResultCard(title: L10n.interest, value: "Rs \(number(result.interest))", caption: nil)
            ResultCard(title: L10n.total, value: "Rs \(number(result.total))", caption: scale)
        }
    }

    private var result: FinanceCalculator.InterestResult {
        FinanceCalculator.simpleInterest(
            principal: Double(principal) ?? 0,
            annualRatePercent: Double(rate) ?? 0,
            years: Double(years) ?? 0
        )
    }

    /// Large sums are read in lakh and crore, so the figure is spelled out.
    private var scale: String? {
        NepaliNumberFormatter.scaleDescription(Int(result.total))
    }
}

// MARK: - Shared

/// A caption above a control.
///
/// Every control in this route uses it, including the pickers. A labelled field
/// is two lines tall and a bare picker is one, so mixing them in an `HStack`
/// centres the short one against the tall one and the row looks broken. Giving
/// both the same structure keeps the baselines aligned by construction rather
/// than by nudging padding.
private struct ToolControl<Content: View>: View {
    let label: LocalizedStringResource
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xxs) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            content
        }
    }
}

private struct ToolField: View {
    @Binding var text: String
    let label: LocalizedStringResource

    var body: some View {
        ToolControl(label: label) {
            TextField(String(localized: label), text: $text)
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
        }
        .frame(maxWidth: .infinity)
    }
}

private struct ResultCard: View {
    let title: LocalizedStringResource
    let value: String
    let caption: String?

    @State private var didCopy = false

    var body: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(value, forType: .string)
            withAnimation(.snappy(duration: 0.2)) { didCopy = true }
            Task {
                try? await Task.sleep(for: .seconds(1.4))
                withAnimation(.snappy(duration: 0.2)) { didCopy = false }
            }
        } label: {
            HStack(spacing: Theme.Space.s) {
                VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                    Text(title)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(verbatim: value)
                        .font(.title3.weight(.semibold))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    if let caption {
                        Text(verbatim: caption)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: didCopy ? "checkmark" : "doc.on.doc")
                    .font(.caption)
                    .foregroundStyle(didCopy ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.tertiary))
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSection(padding: Theme.Space.s)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(String(localized: title)): \(value)")
        .accessibilityHint(didCopy ? "Copied" : "Copy to clipboard")
    }
}

/// Grouped South Asian style, because these results are read in lakh and crore.
private func number(_ value: Double) -> String {
    guard value.isFinite else { return "—" }
    let whole = Int(value.rounded())
    let fraction = abs(value - Double(whole))
    guard fraction > 0.005 else { return NepaliNumberFormatter.grouped(whole) }
    let truncated = Int(value)
    return NepaliNumberFormatter.grouped(truncated)
        + String(format: "%.2f", abs(value - Double(truncated))).dropFirst()
}
