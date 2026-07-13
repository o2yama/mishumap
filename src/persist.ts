import type { FilterState } from "./types";

const STORAGE_KEY = "bgm-last-search";

/**
 * localStorageに保存する検索状態。次回起動時に同じ画面から再開するために使う。
 * origin（現在地）と walkMinutes は保存しない — 現在地の取得はユーザー操作起点にしたため、
 * 位置のない状態で距離だけ復元しても絞り込みに使えない。
 */
export interface SavedSearch {
  awards?: string[];
  /** 複数年対応前に保存された単一年。読み込み時のみ解釈する（新規保存はしない） */
  year?: number;
  years?: number[];
  area?: string;
  categories?: string[];
  cuisines?: string[];
  priceLevels?: number[];
  query?: string;
}

export function loadSavedSearch(): SavedSearch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as SavedSearch) : null;
  } catch {
    return null;
  }
}

export function saveSearch(f: FilterState): void {
  const data: SavedSearch = {
    awards: [...f.awards],
    years: [...f.years],
    area: f.area,
    categories: [...f.categories],
    cuisines: [...f.cuisines],
    priceLevels: [...f.priceLevels],
    query: f.query,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* プライベートモード等で保存できなくても機能に影響させない */
  }
}
