import { t, type StringKey } from "./i18n";

/** ミシュランの区分名（データの生値）→ マーカースタイル定義 */
export interface AwardStyle {
  color: string;
  radius: number;
  /** マーカー描画順。大きいほど上に描く */
  zIndex: number;
}

export const AWARD_STYLES: Record<string, AwardStyle> = {
  "3 Stars": { color: "#8f6400", radius: 9, zIndex: 5 },
  "2 Stars": { color: "#b8860b", radius: 8, zIndex: 4 },
  "1 Star": { color: "#d9a441", radius: 7, zIndex: 3 },
  "Bib Gourmand": { color: "#bb1f2f", radius: 7.5, zIndex: 2 },
  "Selected Restaurants": { color: "#8e99a3", radius: 5, zIndex: 1 },
};

export const FALLBACK_STYLE: AwardStyle = { color: "#8e99a3", radius: 5, zIndex: 0 };

export function awardStyle(award: string | undefined): AwardStyle {
  return (award && AWARD_STYLES[award]) || FALLBACK_STYLE;
}

const LABEL_KEYS: Record<string, StringKey> = {
  "3 Stars": "award3",
  "2 Stars": "award2",
  "1 Star": "award1",
  "Bib Gourmand": "awardBib",
  "Selected Restaurants": "awardSelected",
};

/** 現在の言語での区分名 */
export function awardLabel(award: string | undefined): string {
  const key = award ? LABEL_KEYS[award] : undefined;
  return key ? t(key) : t("awardFallback");
}

/** リストバッジ・履歴チップ用の短縮表記 */
export function awardShort(award: string | undefined): string {
  switch (award) {
    case "3 Stars":
      return "★★★";
    case "2 Stars":
      return "★★";
    case "1 Star":
      return "★";
    case "Bib Gourmand":
      return t("awardBibShort");
    case "Selected Restaurants":
      return t("awardSelected");
    default:
      return t("awardFallback");
  }
}
