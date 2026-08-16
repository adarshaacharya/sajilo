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
    var openRashifal: (() -> Void)?
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
            if let openRashifal {
                Button(L10n.rashifal, systemImage: "sparkles", action: openRashifal)
            }
            Button(L10n.tools, systemImage: "wrench.and.screwdriver", action: openTools)
            // Quit moved up beside the settings gear in the header. It is used
            // once a session at most, and a row of six destinations reads
            // better than five plus an exit.
        }
        .buttonStyle(ToolbarActionStyle())
        .padding(.horizontal, Theme.Space.s)
        .padding(.vertical, Theme.Space.xs)
        .background(.bar)
    }
}

// MARK: - Previews
