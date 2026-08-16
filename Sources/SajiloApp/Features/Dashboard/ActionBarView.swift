import AppKit
import SwiftUI

// MARK: - Actions

struct ActionBarView: View {
    let openUpcoming: () -> Void
    let openConverter: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button("Festivals", systemImage: "sparkles", action: openUpcoming)
            Button("Convert", systemImage: "arrow.left.arrow.right", action: openConverter)
            Button("Quit", systemImage: "power") {
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
