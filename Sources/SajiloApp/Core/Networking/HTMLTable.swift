import Foundation

/// A deliberately small reader for one server-rendered table.
///
/// Not a general HTML parser: it knows only rows and cells. Two Nepali sources
/// publish the numbers Sajilo needs as plain HTML tables and offer no API —
/// Nepal Oil Corporation's fuel prices and the Kalimati market board's produce
/// prices — so both read through this rather than each growing its own parser.
enum HTMLTable {
    static func firstTableRows(in html: String) -> [[String]] {
        guard let table = slice(of: html, tag: "table").first else { return [] }
        return slice(of: table, tag: "tr")
            .map(cells(in:))
            .filter { !$0.isEmpty }
    }

    /// Cells in document order, so a heading row mixing `th` and `td` keeps its
    /// column positions — reading all the `th`s and then all the `td`s would
    /// reorder it.
    private static func cells(in row: String) -> [String] {
        slice(of: row, tags: ["td", "th"]).map(text)
    }

    private static func slice(of html: String, tag: String) -> [String] {
        slice(of: html, tags: [tag])
    }

    /// The inner content of every `<tag>…</tag>` pair for any of `tags`, in
    /// document order. Nested pairs of the same tag are not handled — none of
    /// the tags this reads can legally nest inside itself.
    private static func slice(of html: String, tags: [String]) -> [String] {
        var results: [String] = []
        var remainder = Substring(html)

        while true {
            // Whichever tag opens next wins, so mixed `th`/`td` rows stay in
            // the order the document wrote them.
            let candidates = tags.compactMap { tag -> (Range<Substring.Index>, String)? in
                guard let range = openingTag(named: tag, in: remainder) else { return nil }
                return (range, tag)
            }
            guard let (open, tag) = candidates.min(by: { $0.0.lowerBound < $1.0.lowerBound }),
                  let close = remainder.range(of: "</\(tag)>", options: .caseInsensitive),
                  close.lowerBound >= open.upperBound else {
                break
            }
            results.append(String(remainder[open.upperBound..<close.lowerBound]))
            remainder = remainder[close.upperBound...]
        }
        return results
    }

    /// The range of a complete `<tag …>` opening, or nil if there is none left.
    private static func openingTag(named tag: String, in html: Substring) -> Range<Substring.Index>? {
        var remainder = html
        while let match = remainder.range(of: "<\(tag)", options: .caseInsensitive) {
            let afterName = remainder[match.upperBound...]
            // Reject `<table>` matching `<tablefoo>`: whatever follows the name
            // has to end it.
            guard let next = afterName.first,
                  next == ">" || next.isWhitespace,
                  let end = afterName.firstIndex(of: ">") else {
                remainder = remainder[match.upperBound...]
                continue
            }
            return match.lowerBound..<afterName.index(after: end)
        }
        return nil
    }

    /// Tag-stripped, entity-decoded, whitespace-collapsed cell text.
    static func text(_ fragment: String) -> String {
        var output = ""
        var isInsideTag = false
        for character in fragment {
            switch character {
            case "<": isInsideTag = true
            case ">": isInsideTag = false
            default: if !isInsideTag { output.append(character) }
            }
        }
        output = output
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
        return output
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}
