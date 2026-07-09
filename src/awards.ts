/** ミシュランの区分名（データの生値）→ 表示・スタイル定義 */
export interface AwardStyle {
  label: string;
  short: string;
  color: string;
  radius: number;
  /** マーカー描画順。大きいほど上に描く */
  zIndex: number;
}

export const AWARD_STYLES: Record<string, AwardStyle> = {
  "3 Stars": { label: "三つ星", short: "★★★", color: "#8f6400", radius: 9, zIndex: 5 },
  "2 Stars": { label: "二つ星", short: "★★", color: "#b8860b", radius: 8, zIndex: 4 },
  "1 Star": { label: "一つ星", short: "★", color: "#d9a441", radius: 7, zIndex: 3 },
  "Bib Gourmand": { label: "ビブグルマン", short: "ビブ", color: "#bb1f2f", radius: 7.5, zIndex: 2 },
  "Selected Restaurants": { label: "セレクテッド", short: "セレクテッド", color: "#8e99a3", radius: 5, zIndex: 1 },
};

export const FALLBACK_STYLE: AwardStyle = {
  label: "掲載店",
  short: "掲載",
  color: "#8e99a3",
  radius: 5,
  zIndex: 0,
};

export function awardStyle(award: string | undefined): AwardStyle {
  return (award && AWARD_STYLES[award]) || FALLBACK_STYLE;
}
