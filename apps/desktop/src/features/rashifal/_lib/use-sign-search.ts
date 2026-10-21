import { useEffect, useState } from "react";
import { api } from "../../../shared/lib/ipc";
import type { RashiSign } from "../../../types/api/RashiSign";
import { matchSignNames, matchSigns } from "./signs";

/**
 * The signs a search box points to, typed in either script. A sign's own
 * name ("Leo", "Tula") matches as it is. A person's name in English letters
 * ("suresh") is read as Nepali the way Nepali typing reads it (सुरेश) and
 * matched by its first syllable, as a name typed in Nepali is. `null` while
 * the box is empty.
 */
export function useSignSearch(query: string): Set<RashiSign> | null {
  const trimmed = query.trim();
  const latin = /[a-z]/i.test(trimmed);
  const [nepali, setNepali] = useState<{ from: string; text: string } | null>(null);

  useEffect(() => {
    if (!latin) return;
    let current = true;
    api
      .notesTransliterate(trimmed, true)
      .then((text) => {
        if (current) setNepali({ from: trimmed, text });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [trimmed, latin]);

  if (!trimmed) return null;
  if (!latin) return matchSigns(trimmed);
  const named = matchSignNames(trimmed);
  if (named.size > 0) return named;
  // Until the Nepali reading for this exact text arrives, nothing matches
  // rather than an older reading's signs.
  return nepali?.from === trimmed ? matchSigns(nepali.text, false) : new Set();
}
