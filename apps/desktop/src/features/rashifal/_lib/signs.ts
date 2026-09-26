import type { RashiSign } from "../../../types/api/RashiSign";

export const SIGNS: readonly {
  id: RashiSign;
  en: string;
  ne: string;
  western: string;
  /** The zodiac symbol, forced to text so no platform swaps in an emoji. */
  glyph: string;
  syllables: readonly string[];
}[] = [
  {
    id: "mesh",
    en: "Mesh",
    ne: "मेष",
    western: "Aries",
    glyph: "♈\uFE0E",
    syllables: ["चु", "चे", "चो", "ला", "लि", "लु", "ले", "लो", "अ"],
  },
  {
    id: "vrish",
    en: "Vrish",
    ne: "वृष",
    western: "Taurus",
    glyph: "♉\uFE0E",
    syllables: ["इ", "उ", "ए", "ओ", "वा", "वि", "वु", "वे", "वो"],
  },
  {
    id: "mithun",
    en: "Mithun",
    ne: "मिथुन",
    western: "Gemini",
    glyph: "♊\uFE0E",
    syllables: ["का", "कि", "कु", "घ", "ङ", "छ", "के", "को", "हा"],
  },
  {
    id: "karkat",
    en: "Karkat",
    ne: "कर्कट",
    western: "Cancer",
    glyph: "♋\uFE0E",
    syllables: ["हि", "हु", "हे", "हो", "डा", "डि", "डु", "डे", "डो"],
  },
  {
    id: "simha",
    en: "Simha",
    ne: "सिंह",
    western: "Leo",
    glyph: "♌\uFE0E",
    syllables: ["मा", "मि", "मु", "मे", "मो", "टा", "टि", "टु", "टे"],
  },
  {
    id: "kanya",
    en: "Kanya",
    ne: "कन्या",
    western: "Virgo",
    glyph: "♍\uFE0E",
    syllables: ["टो", "पा", "पि", "पु", "ष", "ण", "ठ", "पे", "पो"],
  },
  {
    id: "tula",
    en: "Tula",
    ne: "तुला",
    western: "Libra",
    glyph: "♎\uFE0E",
    syllables: ["रा", "रि", "रु", "रे", "रो", "ता", "ति", "तु", "ते"],
  },
  {
    id: "vrishchik",
    en: "Vrishchik",
    ne: "वृश्चिक",
    western: "Scorpio",
    glyph: "♏\uFE0E",
    syllables: ["तो", "ना", "नि", "नु", "ने", "नो", "या", "यि", "यु"],
  },
  {
    id: "dhanu",
    en: "Dhanu",
    ne: "धनु",
    western: "Sagittarius",
    glyph: "♐\uFE0E",
    syllables: ["ये", "यो", "भा", "भि", "भु", "धा", "फा", "ढा", "भे"],
  },
  {
    id: "makar",
    en: "Makar",
    ne: "मकर",
    western: "Capricorn",
    glyph: "♑\uFE0E",
    syllables: ["भो", "जा", "जि", "जु", "जे", "जो", "ख", "खि", "खु", "खे", "खो", "गा", "गि"],
  },
  {
    id: "kumbha",
    en: "Kumbha",
    ne: "कुम्भ",
    western: "Aquarius",
    glyph: "♒\uFE0E",
    syllables: ["गु", "गे", "गो", "सा", "सि", "सु", "से", "सो", "दा"],
  },
  {
    id: "meen",
    en: "Meen",
    ne: "मीन",
    western: "Pisces",
    glyph: "♓\uFE0E",
    syllables: ["दि", "दु", "थ", "झ", "ञ", "दे", "दो", "चा", "चि"],
  },
];

/**
 * Signs a search box entry points to: a name ("सुरेश"), its first syllable
 * ("सु"), or the sign's own English or western name ("ka", "Leo"). A name
 * whose opening syllable isn't listed ("कमल" has only का, कि, कु) falls back
 * to its first letter, so a search never dead-ends on an inherent vowel.
 */
export function matchSigns(query: string): Set<RashiSign> {
  const q = query.trim().toLowerCase();
  const found = new Set<RashiSign>();
  if (!q) return found;
  for (const sign of SIGNS) {
    const named = [sign.en, sign.western, sign.ne].some((name) => name.toLowerCase().startsWith(q));
    const syllable = sign.syllables.some((y) => q.startsWith(y) || y.startsWith(q));
    if (named || syllable) found.add(sign.id);
  }
  if (found.size > 0) return found;
  const first = q.charAt(0);
  for (const sign of SIGNS) {
    if (sign.syllables.some((y) => y.startsWith(first))) found.add(sign.id);
  }
  return found;
}

export function validSign(saved: string | null): RashiSign | null {
  return SIGNS.some((sign) => sign.id === saved) ? (saved as RashiSign) : null;
}

export function signMeta(id: RashiSign) {
  const sign = SIGNS.find((entry) => entry.id === id);
  if (!sign) throw new Error(`Unknown rashi sign: ${id}`);
  return sign;
}
