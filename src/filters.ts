import type { FilterState, Origin, Restaurant } from "./types";

/** 不動産の表示規約に準拠した徒歩換算（80m/分）。直線距離ベースの近似 */
export const WALK_METERS_PER_MINUTE = 80;

const EARTH_RADIUS_M = 6371_000;

export function distanceMeters(a: Origin, b: Origin): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
}

/** 選択中の年におけるその店の区分。未掲載なら undefined */
export function awardInYear(r: Restaurant, year: number): string | undefined {
  return r.awards[String(year)];
}

export function matchesFilters(r: Restaurant, f: FilterState): boolean {
  const award = awardInYear(r, f.year);
  if (!award || !f.awards.has(award)) return false;
  if (f.area && r.area !== f.area) return false;
  if (!f.categories.has(r.category)) return false;

  if (f.query) {
    const q = f.query.toLowerCase();
    const haystack = r.searchText ?? `${r.name} ${r.address} ${r.cuisine}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (f.origin && f.walkMinutes !== null) {
    const meters = distanceMeters(f.origin, r);
    if (meters > f.walkMinutes * WALK_METERS_PER_MINUTE) return false;
  }
  return true;
}

const AWARD_ORDER: Record<string, number> = {
  "Bib Gourmand": 0, // 本アプリの主役なので先頭
  "3 Stars": 1,
  "2 Stars": 2,
  "1 Star": 3,
  "Selected Restaurants": 4,
};

export function applyFilters(all: Restaurant[], f: FilterState): Restaurant[] {
  const result = all.filter((r) => matchesFilters(r, f));
  if (f.origin) {
    const o = f.origin;
    result.sort((a, b) => distanceMeters(o, a) - distanceMeters(o, b));
  } else {
    result.sort((a, b) => {
      const oa = AWARD_ORDER[awardInYear(a, f.year) ?? ""] ?? 9;
      const ob = AWARD_ORDER[awardInYear(b, f.year) ?? ""] ?? 9;
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name, "ja");
    });
  }
  return result;
}
