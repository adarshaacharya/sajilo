import Foundation

/// One sign's reading for the day.
struct Rashifal: Codable, Equatable, Sendable, Identifiable {
    let sign: RashiSign
    /// The astrologer's words, carried verbatim. Never trimmed, summarised, or
    /// reflowed — it is someone's writing, and Sajilo shows it as published.
    let prediction: String

    var id: String { sign.rawValue }
}

/// The twelve rashi, in their canonical order.
///
/// These are the same twelve divisions as the Bikram Sambat solar months —
/// Baishakh is Mesh, Jestha is Vrish, and so on — because a BS month is the
/// span the sun spends in one rashi.
///
/// That correspondence is deliberately *not* used to pick a reader's sign for
/// them. In Nepali practice your rashi is normally the **moon** sign from your
/// birth chart, or the one a jyotish assigned from the first syllable of your
/// name; it is not your birth month. Deriving it from a birth date would give
/// the sun sign and quietly hand most people the wrong reading, so the sign is
/// always chosen by hand.
enum RashiSign: String, Codable, Equatable, Sendable, CaseIterable, Identifiable {
    case mesh, vrish, mithun, karkat, simha, kanya
    case tula, vrishchik, dhanu, makar, kumbha, meen

    var id: String { rawValue }

    /// As Hamro Patro heads each section.
    var nepaliName: String {
        switch self {
        case .mesh: "मेष"
        case .vrish: "वृष"
        case .mithun: "मिथुन"
        case .karkat: "कर्कट"
        case .simha: "सिंह"
        case .kanya: "कन्या"
        case .tula: "तुला"
        case .vrishchik: "वृश्चिक"
        case .dhanu: "धनु"
        case .makar: "मकर"
        case .kumbha: "कुम्भ"
        case .meen: "मीन"
        }
    }

    /// Romanised Nepali rather than the Western equivalent: someone who knows
    /// they are Mesh does not necessarily think of themselves as Aries.
    var romanName: String {
        switch self {
        case .mesh: "Mesh"
        case .vrish: "Vrish"
        case .mithun: "Mithun"
        case .karkat: "Karkat"
        case .simha: "Simha"
        case .kanya: "Kanya"
        case .tula: "Tula"
        case .vrishchik: "Vrishchik"
        case .dhanu: "Dhanu"
        case .makar: "Makar"
        case .kumbha: "Kumbha"
        case .meen: "Meen"
        }
    }

    /// The Western name, for readers who only know that one.
    var westernName: String {
        switch self {
        case .mesh: "Aries"
        case .vrish: "Taurus"
        case .mithun: "Gemini"
        case .karkat: "Cancer"
        case .simha: "Leo"
        case .kanya: "Virgo"
        case .tula: "Libra"
        case .vrishchik: "Scorpio"
        case .dhanu: "Sagittarius"
        case .makar: "Capricorn"
        case .kumbha: "Aquarius"
        case .meen: "Pisces"
        }
    }

    /// The नामाक्षर — the syllables a name beginning with places you in this
    /// rashi. This is how most Nepalis actually know their sign, so it is what
    /// the picker is built around.
    ///
    /// Bundled rather than fetched: these are traditional and identical across
    /// every jyotish source, so they never go stale, and the picker works
    /// before any network call has returned.
    var namingSyllables: [String] {
        switch self {
        case .mesh: ["चु", "चे", "चो", "ला", "लि", "लु", "ले", "लो", "अ"]
        case .vrish: ["इ", "उ", "ए", "ओ", "वा", "वि", "वु", "वे", "वो"]
        case .mithun: ["का", "कि", "कु", "घ", "ङ", "छ", "के", "को", "हा"]
        case .karkat: ["हि", "हु", "हे", "हो", "डा", "डि", "डु", "डे", "डो"]
        case .simha: ["मा", "मि", "मु", "मे", "मो", "टा", "टि", "टु", "टे"]
        case .kanya: ["टो", "पा", "पि", "पु", "ष", "ण", "ठ", "पे", "पो"]
        case .tula: ["रा", "रि", "रु", "रे", "रो", "ता", "ति", "तु", "ते"]
        case .vrishchik: ["तो", "ना", "नि", "नु", "ने", "नो", "या", "यि", "यु"]
        case .dhanu: ["ये", "यो", "भा", "भि", "भु", "धा", "फा", "ढा", "भे"]
        case .makar: ["भो", "जा", "जि", "जु", "जे", "जो", "ख", "खि", "खु", "खे", "खो", "गा", "गि"]
        case .kumbha: ["गु", "गे", "गो", "सा", "सि", "सु", "से", "सो", "दा"]
        case .meen: ["दि", "दु", "थ", "झ", "ञ", "दे", "दो", "चा", "चि"]
        }
    }
}

struct RashifalSnapshot: Codable, Equatable, Sendable {
    let readings: [Rashifal]
    /// The Bikram Sambat day the source published this for, so a reading left
    /// over from yesterday can say so instead of passing as today's.
    let publishedOn: NepaliDate?
    let fetchedAt: Date

    func reading(for sign: RashiSign) -> Rashifal? {
        readings.first { $0.sign == sign }
    }
}
