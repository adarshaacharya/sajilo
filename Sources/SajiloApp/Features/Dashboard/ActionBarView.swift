import AppKit
import SwiftUI

// MARK: - Actions

struct ActionBarView: View {
    let active: ActionBarDestination?
    let openUpcoming: () -> Void
    let openConverter: () -> Void
    /// Absent unless the module is enabled — a button that is present but
    /// inert is worse than one that is not there.
    var openNews: (() -> Void)?
    var openBazar: (() -> Void)?
    var openRashifal: (() -> Void)?
    var openRadio: (() -> Void)?
    let openTools: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            action(L10n.festivals, icon: "calendar", destination: .festivals, action: openUpcoming)
            action(L10n.convert, icon: "arrow.left.arrow.right", destination: .converter, action: openConverter)
            if let openNews {
                action(L10n.news, icon: "newspaper", destination: .news, action: openNews)
            }
            if let openBazar {
                action(L10n.bazar, icon: "storefront", destination: .bazar, action: openBazar)
            }
            if let openRashifal {
                action(L10n.rashifal, icon: "moon.stars.fill", destination: .rashifal, action: openRashifal)
            }
            if let openRadio {
                action(L10n.radio, icon: "dot.radiowaves.left.and.right", destination: .radio, action: openRadio)
            }
            action(L10n.tools, icon: "wrench.and.screwdriver", destination: .tools, action: openTools)
            // Quit moved up beside the settings gear in the header. It is used
            // once a session at most, and a row of six destinations reads
            // better than five plus an exit.
        }
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(.bar)
    }

    private func action(
        _ title: LocalizedStringResource,
        icon: String,
        destination: ActionBarDestination,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, systemImage: icon, action: action)
            .buttonStyle(ToolbarActionStyle(isActive: active == destination))
            .accessibilityAddTraits(active == destination ? .isSelected : [])
    }
}

enum ActionBarDestination: Equatable {
    case festivals, converter, news, bazar, rashifal, radio, tools
}

// MARK: - Previews
