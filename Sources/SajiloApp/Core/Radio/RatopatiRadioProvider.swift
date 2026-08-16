import Foundation

protocol RadioProviding: Sendable {
    func stations() async throws -> RadioDirectory
    func streamURL(for station: RadioStation) async throws -> URL
}

/// Ratopati has given Sajilo permission to use its radio directory. Its
/// server-rendered directory gives the station metadata; each station page
/// publishes the broadcaster's direct HTML audio source.
struct RatopatiRadioProvider: RadioProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }

    func stations() async throws -> RadioDirectory {
        let html = try await page(at: Self.directoryURL)
        let stations = Self.parseDirectory(html)
        guard !stations.isEmpty else { throw RadioProviderError.directoryUnreadable }
        return RadioDirectory(stations: stations, fetchedAt: .now)
    }

    func streamURL(for station: RadioStation) async throws -> URL {
        let html = try await page(at: Self.stationURL(for: station.slug))
        guard let streamURL = Self.parseStreamURL(html) else {
            throw RadioProviderError.streamUnreadable
        }
        return streamURL
    }

    private func page(at url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.setValue("Sajilo/0.1 (macOS radio player)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode,
              let html = String(data: data, encoding: .utf8) else {
            throw RadioProviderError.invalidResponse
        }
        return html
    }

    static let directoryURL = URL(string: "https://www.ratopati.com/radio")!

    static func stationURL(for slug: String) -> URL {
        URL(string: "https://www.ratopati.com/radio/\(slug)")!
    }

    static func parseDirectory(_ html: String) -> [RadioStation] {
        let anchors = matches(
            #"<a\s+[^>]*href="(https://www\.ratopati\.com/radio/[^"]+)"[^>]*>(.*?)</a>"#,
            in: html
        )
        var seen = Set<String>()
        var stations: [RadioStation] = []

        for anchor in anchors {
            guard anchor.count == 3,
                  let pageURL = URL(string: anchor[1]),
                  let slug = pageURL.pathComponents.last,
                  slug != "radio",
                  let image = firstMatch(#"<img\s+[^>]*>"#, in: anchor[2]),
                  let name = attribute("alt", in: image), !name.isEmpty else {
                continue
            }

            let text = HTMLTable.text(anchor[2])
            let frequency = text
                .replacingOccurrences(of: name, with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard seen.insert(slug).inserted else { continue }
            stations.append(
                RadioStation(
                    slug: slug,
                    name: name,
                    frequency: frequency.isEmpty ? nil : frequency,
                    logoURL: attribute("src", in: image).flatMap(URL.init(string:))
                )
            )
        }
        return stations
    }

    static func parseStreamURL(_ html: String) -> URL? {
        guard let source = firstMatch(#"<source\s+[^>]*src="([^"]+)"[^>]*>"#, in: html),
              let rawURL = capture(1, from: source, matching: #"<source\s+[^>]*src="([^"]+)"[^>]*>"#),
              let url = URL(string: rawURL), ["http", "https"].contains(url.scheme) else {
            return nil
        }
        return url
    }

    private static func matches(_ pattern: String, in text: String) -> [[String]] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return expression.matches(in: text, range: range).map { match in
            (0..<match.numberOfRanges).compactMap { index in
                guard let range = Range(match.range(at: index), in: text) else { return nil }
                return String(text[range])
            }
        }
    }

    private static func firstMatch(_ pattern: String, in text: String) -> String? {
        matches(pattern, in: text).first?.first
    }

    private static func capture(_ index: Int, from text: String, matching pattern: String) -> String? {
        matches(pattern, in: text).first.flatMap { $0.indices.contains(index) ? $0[index] : nil }
    }

    private static func attribute(_ name: String, in tag: String) -> String? {
        capture(1, from: tag, matching: #"\b\#(name)="([^"]*)""#)
            .map(HTMLTable.text)
    }
}

enum RadioProviderError: Error, Equatable {
    case invalidResponse
    case directoryUnreadable
    case streamUnreadable
}
