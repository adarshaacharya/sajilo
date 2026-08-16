import AppKit
import SwiftUI

// MARK: - Actions

struct ActionBarView: View {
    let openUpcoming: () -> Void
    let openConverter: () -> Void
    /// Absent unless the module is enabled — a button that is present but
    /// inert is worse than one that is not there.
    var openNews: (() -> Void)?
    var openBazar: (() -> Void)?
    let openTools: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(L10n.festivals, systemImage: "calendar", action: openUpcoming)
            Button(L10n.convert, systemImage: "arrow.left.arrow.right", action: openConverter)
            if let openNews {
                Button(L10n.news, systemImage: "newspaper", action: openNews)
            }
            if let openBazar {
                Button(L10n.bazar, systemImage: "storefront", action: openBazar)
            }
            Button(L10n.tools, systemImage: "wrench.and.screwdriver", action: openTools)
            Button(L10n.quit, systemImage: "power") {
                NSApplication.shared.terminate(nil)
            }
        }
        .buttonStyle(ToolbarActionStyle())
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(.bar)
    }
}

// MARK: - Previews
