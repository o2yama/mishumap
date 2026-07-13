import type { FilterState } from "./types";

const STORAGE_KEY = "bgm-last-search";

/**
 * localStorageに保存する検索状態。次回起動時に同じ画面から再開するために使う。
 * origin（現在地）は保存しない — 古い位置を復元しても意味がなく、起動時の自動取得に任せる。
 * walkMinutes は「現在地フィルタ使用中だった場合のみ」キーが存在する（未使用ならデフォルトの15分を適用したいため）
 */
export interface SavedSearch {
  awards?: string[];
  /** 複数年対応前に保存された単一年。読み込み時のみ解釈する（新規保存はしない） */
  year?: number;
  years?: number[];
  area?: string;
  categories?: string[];
  query?: string;
  includePast?: boolean;
  walkMinutes?: number | null;
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
    query: f.query,
    includePast: f.includePast,
    // 現在地フィルタ未使用時は undefined（=JSONからキーごと落ちる）
    walkMinutes: f.origin ? f.walkMinutes : undefined,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* プライベートモード等で保存できなくても機能に影響させない */
  }
}
