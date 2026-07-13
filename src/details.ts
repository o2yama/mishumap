import type { Restaurant } from "./types";

/**
 * ポップアップでしか使わない項目（紹介文・リンク・電話）を遅延読込する。
 *
 * 紹介文だけで全データの44%を占めており、初期ロードに含めると低速回線でピン表示が
 * 数秒遅れる。地図が動き出してから裏で取りに行き、店舗オブジェクトへ流し込む。
 * ユーザーがピンを開くのは早くても数秒後なので、通常は待たされない。
 */
interface Details {
  description?: string;
  url?: string;
  website?: string;
  phone?: string;
}

let pending: Promise<void> | null = null;
let loaded = false;

export function detailsLoaded(): boolean {
  return loaded;
}

/** 取得中ならその完了を待つ。未開始・失敗時は即解決する（ポップアップは簡素なまま） */
export function onDetailsReady(): Promise<void> {
  return pending ?? Promise.resolve();
}

/** 何度呼んでも取得は1回だけ。取得済みなら即解決する */
export function ensureDetails(siteRoot: string, restaurants: Restaurant[]): Promise<void> {
  if (loaded) return Promise.resolve();
  if (pending) return pending;

  pending = fetch(`${siteRoot}data/details.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`details fetch failed: ${res.status}`);
      return res.json() as Promise<Record<string, Details>>;
    })
    .then((byId) => {
      for (const r of restaurants) Object.assign(r, byId[r.id] ?? {});
      loaded = true;
    })
    .catch((err) => {
      // 詳細が取れなくても地図・検索は動く。ポップアップが簡素になるだけ
      console.error(err);
      pending = null;
    });

  return pending;
}
