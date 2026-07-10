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

export interface EffectiveAward {
  award: string;
  year: number;
  /** 選択年には掲載がなく、過去の掲載記録から表示している */
  isPast: boolean;
}

/**
 * 選択年の掲載区分。includePast時は「選択年より前の最後の掲載」まで遡って返す。
 * どの年にも記録がなければ undefined
 */
export function effectiveAward(r: Restaurant, f: Pick<FilterState, "year" | "includePast">): EffectiveAward | undefined {
  const direct = r.awards[String(f.year)];
  if (direct) return { award: direct, year: f.year, isPast: false };
  if (!f.includePast) return undefined;
  let latest = -1;
  for (const y of Object.keys(r.awards)) {
    const n = Number(y);
    if (n < f.year && n > latest) latest = n;
  }
  if (latest < 0) return undefined;
  return { award: r.awards[String(latest)], year: latest, isPast: true };
}

export function matchesFilters(r: Restaurant, f: FilterState): boolean {
  const ea = effectiveAward(r, f);
  if (!ea || !f.awards.has(ea.award)) return false;
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

// リストの並び順。区分チップの表示順（main.ts AWARD_CHIP_ORDER）と揃える
const AWARD_ORDER: Record<string, number> = {
  "3 Stars": 0,
  "2 Stars": 1,
  "1 Star": 2,
  "Selected Restaurants": 3,
  "Bib Gourmand": 4,
};

export function applyFilters(all: Restaurant[], f: FilterState): Restaurant[] {
  const result = all.filter((r) => matchesFilters(r, f));
  if (f.origin) {
    const o = f.origin;
    result.sort((a, b) => distanceMeters(o, a) - distanceMeters(o, b));
  } else {
    // 過去掲載の店は現行掲載の後ろへ
    result.sort((a, b) => {
      const ea = effectiveAward(a, f);
      const eb = effectiveAward(b, f);
      const pa = ea?.isPast ? 1 : 0;
      const pb = eb?.isPast ? 1 : 0;
      if (pa !== pb) return pa - pb;
      const oa = AWARD_ORDER[ea?.award ?? ""] ?? 9;
      const ob = AWARD_ORDER[eb?.award ?? ""] ?? 9;
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name, "ja");
    });
  }
  return result;
}
