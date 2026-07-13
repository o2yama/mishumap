export interface Restaurant {
  id: string;
  name: string;
  area: string;
  address: string;
  /** 郵便番号から復元した日本語表記の住所。復元できなかった一部は空 */
  addressJa: string;
  lat: number;
  lng: number;
  cuisine: string;
  category: string;
  price: string;
  /** 以下4項目は details.json から遅延読込する。ポップアップを開くまでは未定義 */
  url?: string;
  website?: string;
  phone?: string;
  description?: string;
  greenStar: boolean;
  /** 最新版ガイドに掲載されているか（false = 閉店・掲載外れ・名寄せ失敗の可能性） */
  inGuide: boolean;
  currentAward: string;
  /** 掲載年 → 区分。年次履歴はWayback復元由来のため最新年以外は欠損がある */
  awards: Record<string, string>;
  /** 起動時に構築する検索用テキスト（日本語エイリアス込み・小文字化済み） */
  searchText?: string;
}

export interface AppData {
  generatedAt: string;
  source: string;
  note: string;
  years: number[];
  latestYear: number;
  areas: { id: string; label: string }[];
  categories: { id: string; label: string }[];
  restaurants: Restaurant[];
}

export interface Origin {
  lat: number;
  lng: number;
}

export interface FilterState {
  /** 表示する区分（ミシュランの生の区分名） */
  awards: Set<string>;
  /** 表示する掲載年。複数選ぶと「いずれかの年に掲載」の意味になる（空なら該当なし） */
  years: Set<number>;
  /** '' = 全エリア */
  area: string;
  categories: Set<string>;
  query: string;
  origin: Origin | null;
  /** null = 距離での絞り込みなし */
  walkMinutes: number | null;
  /** 選択年に掲載がなくても、それ以前の掲載記録がある店を表示するか */
  includePast: boolean;
}
