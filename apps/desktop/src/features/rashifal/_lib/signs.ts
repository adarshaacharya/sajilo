import type { RashiSign } from "../../../types/api/RashiSign";

export const SIGNS: readonly {
  id: RashiSign;
  en: string;
  ne: string;
  western: string;
  syllables: readonly string[];
}[] = [
  {
    id: "mesh",
    en: "Mesh",
    ne: "मेष",
    western: "Aries",
    syllables: ["चु", "चे", "चो", "ला", "लि", "लु", "ले", "लो", "अ"],
  },
  {
    id: "vrish",
    en: "Vrish",
    ne: "वृष",
    western: "Taurus",
    syllables: ["इ", "उ", "ए", "ओ", "वा", "वि", "वु", "वे", "वो"],
  },
  {
    id: "mithun",
    en: "Mithun",
    ne: "मिथुन",
    western: "Gemini",
    syllables: ["का", "कि", "कु", "घ", "ङ", "छ", "के", "को", "हा"],
  },
  {
    id: "karkat",
    en: "Karkat",
    ne: "कर्कट",
    western: "Cancer",
    syllables: ["हि", "हु", "हे", "हो", "डा", "डि", "डु", "डे", "डो"],
  },
  {
    id: "simha",
    en: "Simha",
    ne: "सिंह",
    western: "Leo",
    syllables: ["मा", "मि", "मु", "मे", "मो", "टा", "टि", "टु", "टे"],
  },
  {
    id: "kanya",
    en: "Kanya",
    ne: "कन्या",
    western: "Virgo",
    syllables: ["टो", "पा", "पि", "पु", "ष", "ण", "ठ", "पे", "पो"],
  },
  {
    id: "tula",
    en: "Tula",
    ne: "तुला",
    western: "Libra",
    syllables: ["रा", "रि", "रु", "रे", "रो", "ता", "ति", "तु", "ते"],
  },
  {
    id: "vrishchik",
    en: "Vrishchik",
    ne: "वृश्चिक",
    western: "Scorpio",
    syllables: ["तो", "ना", "नि", "नु", "ने", "नो", "या", "यि", "यु"],
  },
  {
    id: "dhanu",
    en: "Dhanu",
    ne: "धनु",
    western: "Sagittarius",
    syllables: ["ये", "यो", "भा", "भि", "भु", "धा", "फा", "ढा", "भे"],
  },
  {
    id: "makar",
    en: "Makar",
    ne: "मकर",
    western: "Capricorn",
    syllables: ["भो", "जा", "जि", "जु", "जे", "जो", "ख", "खि", "खु", "खे", "खो", "गा", "गि"],
  },
  {
    id: "kumbha",
    en: "Kumbha",
    ne: "कुम्भ",
    western: "Aquarius",
    syllables: ["गु", "गे", "गो", "सा", "सि", "सु", "से", "सो", "दा"],
  },
  {
    id: "meen",
    en: "Meen",
    ne: "मीन",
    western: "Pisces",
    syllables: ["दि", "दु", "थ", "झ", "ञ", "दे", "दो", "चा", "चि"],
  },
];

export function validSign(saved: string | null): RashiSign | null {
  return SIGNS.some((sign) => sign.id === saved) ? (saved as RashiSign) : null;
}

export function signMeta(id: RashiSign) {
  return SIGNS.find((entry) => entry.id === id)!;
}
