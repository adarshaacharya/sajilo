import { useEffect, useState } from "react";
import type { Place } from "../../types/api/Place";
import type { Language } from "./i18n";
import { api } from "./ipc";

/* One request per session, shared by every screen. Not kept in the SWR cache:
 * that one is saved to disk, and the list belongs to the build — an update
 * that adds places must show them, not a copy saved by the version before. */
let loaded: Place[] = [];
let request: Promise<Place[]> | null = null;

function loadPlaces(): Promise<Place[]> {
  request ??= api
    .listPlaces()
    .then((places) => {
      loaded = Array.isArray(places) ? places : [];
      // An empty answer is a failure, not the list: let the next caller ask again.
      if (loaded.length === 0) request = null;
      return loaded;
    })
    .catch(() => {
      request = null;
      return loaded;
    });
  return request;
}

/** The places weather can be shown for. Bundled in the Rust core, so this
 * never waits on the network. */
export function usePlaces(): Place[] {
  const [places, setPlaces] = useState(loaded);
  useEffect(() => {
    if (loaded.length > 0) return;
    let cancelled = false;
    loadPlaces().then((next) => {
      if (!cancelled) setPlaces(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return places;
}

export function placeName(place: Place, language: Language): string {
  return language === "ne" ? place.nameNe : place.name;
}

export function districtName(place: Place, language: Language): string {
  return language === "ne" ? place.districtNe : place.district;
}

/** The name for an id, before the list has loaded or for an id it lacks. */
export function placeLabel(places: Place[], id: string, language: Language): string {
  const place = places.find((item) => item.id === id);
  return place ? placeName(place, language) : id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Places whose town, district or province matches, in either script — so
 * "kailali", "Dhangadhi" and "धनगढी" all find Dhangadhi. Town matches rank
 * above district ones, then alphabetical by town.
 */
export function searchPlaces(places: Place[], query: string): Place[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return places;
  const rank = (place: Place) => {
    if (place.name.toLowerCase().startsWith(needle) || place.nameNe.startsWith(needle)) return 0;
    if (place.name.toLowerCase().includes(needle) || place.nameNe.includes(needle)) return 1;
    if (place.district.toLowerCase().includes(needle) || place.districtNe.includes(needle)) {
      return 2;
    }
    if (place.province.toLowerCase().includes(needle) || place.provinceNe.includes(needle)) {
      return 3;
    }
    return null;
  };
  return places
    .map((place) => ({ place, rank: rank(place) }))
    .filter((entry): entry is { place: Place; rank: number } => entry.rank != null)
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name))
    .map((entry) => entry.place);
}
