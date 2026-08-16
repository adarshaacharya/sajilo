import Foundation

/// One station in Ratopati's Nepal radio directory.
struct RadioStation: Codable, Equatable, Sendable, Identifiable {
    let slug: String
    let name: String
    let frequency: String?
    let logoURL: URL?

    var id: String { slug }
}

struct RadioDirectory: Codable, Equatable, Sendable {
    let stations: [RadioStation]
    let fetchedAt: Date
}
