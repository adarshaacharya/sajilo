import SwiftUI

// MARK: - Surfaces

/// Groups related content into a raised panel.
///
/// This is the app's replacement for `Divider()`: sections read as separate
/// because they sit on their own surface, not because a rule was drawn between
/// them. macOS popovers group by material, not by lines.
struct CardSection: ViewModifier {
    var padding: CGFloat = Theme.Space.m

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.surface, in: .rect(cornerRadius: Theme.Radius.card))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card)
                    .strokeBorder(Theme.Palette.surfaceBorder, lineWidth: 1)
            )
    }
}

extension View {
    func cardSection(padding: CGFloat = Theme.Space.m) -> some View {
        modifier(CardSection(padding: padding))
    }
}

// MARK: - Buttons

/// The single prominent action per surface, in the app's accent.
struct BrandButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .padding(.horizontal, Theme.Space.m)
            .padding(.vertical, Theme.Space.s)
            .foregroundStyle(.white)
            .background(
                Theme.Palette.brand.opacity(configuration.isPressed ? 0.72 : 1),
                in: .rect(cornerRadius: Theme.Radius.day)
            )
    }
}

/// A borderless glyph button that only reveals its background on hover, used
/// for month chevrons and the settings gear.
struct IconButtonStyle: ButtonStyle {
    var size: CGFloat = 26

    func makeBody(configuration: Configuration) -> some View {
        IconButtonBody(configuration: configuration, size: size)
    }

    private struct IconButtonBody: View {
        let configuration: Configuration
        let size: CGFloat
        @State private var isHovering = false

        var body: some View {
            configuration.label
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(configuration.isPressed ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.secondary))
                .frame(width: size, height: size)
                .background(
                    isHovering ? Theme.Palette.hover : .clear,
                    in: .rect(cornerRadius: Theme.Radius.day)
                )
                .onHover { isHovering = $0 }
                .animation(.easeOut(duration: 0.12), value: isHovering)
        }
    }
}

/// A compact labelled action for the popover's bottom bar. Icon above text
/// keeps three actions inside 380 pt without truncating.
struct ToolbarActionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ToolbarActionBody(configuration: configuration)
    }

    private struct ToolbarActionBody: View {
        let configuration: Configuration
        @State private var isHovering = false

        var body: some View {
            configuration.label
                .labelStyle(StackedLabelStyle())
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Space.s)
                .foregroundStyle(isHovering ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.secondary))
                .background(
                    isHovering ? Theme.Palette.hover : .clear,
                    in: .rect(cornerRadius: Theme.Radius.day)
                )
                .opacity(configuration.isPressed ? 0.6 : 1)
                .onHover { isHovering = $0 }
                .animation(.easeOut(duration: 0.12), value: isHovering)
        }
    }
}

/// Icon over title, the layout macOS uses for compact toolbar actions.
struct StackedLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(spacing: Theme.Space.xs) {
            configuration.icon
                .font(.system(size: 14, weight: .medium))
            configuration.title
                .font(.caption2.weight(.medium))
        }
    }
}
