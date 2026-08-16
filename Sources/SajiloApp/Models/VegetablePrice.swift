import Foundation

/// One day's wholesale rate for one item at the Kalimati market.
///
/// These are **wholesale** rates, not what a neighbourhood shop charges. That
/// distinction matters enough that the UI says so: the number is a reference
/// point — the one the papers quote each morning — rather than a price anyone
/// pays at a stall.
struct VegetablePrice: Codable, Equatable, Sendable, Identifiable {
    /// The Nepali name exactly as the board publishes it, qualifiers included:
    /// "गोलभेडा ठूलो(नेपाली)". Never cleaned up — the qualifier is what
    /// separates a local tomato from an Indian one, and they differ in price.
    let name: String
    let unit: MarketUnit
    let minimum: Double
    let maximum: Double
    let average: Double

    var id: String { name }

    var averageText: String { "Rs \(NepaliNumberFormatter.grouped(Int(average.rounded())))" }

    /// The spread the board recorded that day. Collapses to a single figure
    /// when a commodity traded flat, rather than printing "60 – 60".
    var rangeText: String {
        let low = Int(minimum.rounded())
        let high = Int(maximum.rounded())
        guard low != high else { return NepaliNumberFormatter.grouped(low) }
        return "\(NepaliNumberFormatter.grouped(low))–\(NepaliNumberFormatter.grouped(high))"
    }

    /// An English name for the items where one is unambiguous, so the list is
    /// navigable without reading Devanagari. Absent rather than guessed for the
    /// rest — see `ProduceNames`.
    var englishName: String? { ProduceNames.english(for: name) }
}

/// Kalimati quotes almost everything per kilogram, bananas by the dozen, and
/// pineapple by the piece.
enum MarketUnit: String, Codable, Equatable, Sendable, CaseIterable {
    case kilogram
    case dozen
    case piece

    var displayName: String {
        switch self {
        case .kilogram: "per kg"
        case .dozen: "per dozen"
        case .piece: "each"
        }
    }

    var nepaliName: String {
        switch self {
        case .kilogram: "प्रति के.जी."
        case .dozen: "प्रति दर्जन"
        case .piece: "प्रति गोटा"
        }
    }

    /// The board writes kilogram four different ways in a single day's table —
    /// `के.जी.`, `के.जी`, `के जी`, `केजी` — because the rows are typed by hand.
    /// Matching on the bare letters rather than the punctuation absorbs all
    /// four, and any fifth spelling that appears later.
    static func parse(_ raw: String) -> MarketUnit? {
        let stripped = raw.filter { !$0.isWhitespace && $0 != "." }
        if stripped.contains("केजी") || stripped.contains("किलो") { return .kilogram }
        if stripped.contains("दर्जन") { return .dozen }
        if stripped.contains("गोटा") { return .piece }
        return nil
    }
}

struct VegetableMarketSnapshot: Codable, Equatable, Sendable {
    let prices: [VegetablePrice]
    /// The board dates its own table in Bikram Sambat — "वि.सं. साउन ३१, २०८३"
    /// — which is the calendar this app already speaks, so it is kept as a
    /// `NepaliDate` rather than flattened to a `Date`.
    let publishedOn: NepaliDate?
    let fetchedAt: Date

    func price(named name: String) -> VegetablePrice? {
        prices.first { $0.name == name }
    }

    /// Case- and script-insensitive enough to be typed at: matches the Nepali
    /// name or the English one, so "potato" and "आलु" both find the potatoes.
    func matching(_ query: String) -> [VegetablePrice] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return prices }
        return prices.filter { price in
            price.name.localizedCaseInsensitiveContains(trimmed)
                || (price.englishName?.localizedCaseInsensitiveContains(trimmed) ?? false)
        }
    }
}

/// English names for Kalimati's produce list.
///
/// Deliberately partial. Every entry here is a name the item is actually sold
/// under in English; anything uncertain is left out, and the UI falls back to
/// the Nepali name rather than showing an invented translation. A wrong label
/// on a price list is worse than no label — someone buys the wrong thing.
///
/// Matched longest-first against the published name, because the names nest:
/// "भेडे खुर्सानी" is capsicum while "खुर्सानी" is chilli, and checking the
/// short one first would file every capsicum as a chilli.
enum ProduceNames {
    static func english(for name: String) -> String? {
        table.first { name.contains($0.nepali) }?.english
    }

    private static let table: [(nepali: String, english: String)] = {
        entries.sorted { $0.nepali.count > $1.nepali.count }
    }()

    private static let entries: [(nepali: String, english: String)] = [
        ("गोलभेडा", "Tomato"),
        ("आलु", "Potato"),
        ("प्याज", "Onion"),
        ("गाजर", "Carrot"),
        ("रातो बन्दा", "Red cabbage"),
        ("बन्दा", "Cabbage"),
        ("काउली", "Cauliflower"),
        ("ब्रोकाउली", "Broccoli"),
        ("गान्टे मूला", "Kohlrabi"),
        ("मूला", "Radish"),
        ("भन्टा", "Brinjal"),
        ("बोडी", "Yardlong bean"),
        ("सिमी", "Beans"),
        ("भटमासकोशा", "Soybean pod"),
        ("तितो करेला", "Bitter gourd"),
        ("लौका", "Bottle gourd"),
        ("परवर", "Pointed gourd"),
        ("चिचिण्डो", "Snake gourd"),
        ("घिरौला", "Sponge gourd"),
        ("फर्सी", "Pumpkin"),
        ("भिण्डी", "Okra"),
        ("पिंडालू", "Taro"),
        ("स्कूस", "Chayote"),
        ("रायो साग", "Mustard greens"),
        ("पालूगो साग", "Spinach"),
        ("तोरीको साग", "Rapeseed greens"),
        ("सौफको साग", "Fennel greens"),
        ("च्याउ", "Mushroom"),
        ("कुरीलो", "Asparagus"),
        ("न्यूरो", "Fiddlehead fern"),
        ("चुकुन्दर", "Beetroot"),
        ("सजिवन", "Drumstick"),
        ("पुदीना", "Mint"),
        ("सेलरी", "Celery"),
        ("पार्सले", "Parsley"),
        ("इमली", "Tamarind"),
        ("तामा", "Bamboo shoot"),
        ("तोफु", "Tofu"),
        ("गुन्दुक", "Gundruk"),
        ("स्याउ", "Apple"),
        ("केरा", "Banana"),
        ("कागती", "Lemon"),
        ("अनार", "Pomegranate"),
        ("आँप", "Mango"),
        ("तरबुजा", "Watermelon"),
        ("जुनार", "Sweet orange"),
        ("भुई कटहर", "Pineapple"),
        ("रुख कटहर", "Jackfruit"),
        ("काक्रो", "Cucumber"),
        ("नासपाती", "Pear"),
        ("मेवा", "Papaya"),
        ("लप्सी", "Lapsi"),
        ("आभोकाडो", "Avocado"),
        ("अमला", "Amla"),
        ("नरिवल", "Coconut"),
        ("ड्रागन फ्रुट", "Dragon fruit"),
        ("अदुवा", "Ginger"),
        ("भेडे खुर्सानी", "Capsicum"),
        ("भेडे खु्र्सानी", "Capsicum"),
        ("खुर्सानी", "Chilli"),
        // The board's own table carries both spellings of chilli on the same
        // day — one has a stray halant after "खु". Kept verbatim so the typo
        // does not quietly drop those rows out of the English list.
        ("खु्र्सानी", "Chilli"),
        ("लसुन", "Garlic"),
        ("धनिया", "Coriander"),
        ("मकै", "Maize"),
        ("माछा", "Fish"),
    ]
}
