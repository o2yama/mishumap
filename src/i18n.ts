export type Lang = "ja" | "en";

const STRINGS = {
  ja: {
    docTitle: "ミシュマップ — 日本のミシュラン掲載店を地図で探す",
    appTitle: "ミシュマップ",
    sectionAward: "区分",
    sectionYear: "掲載年",
    sectionArea: "エリア",
    sectionCategory: "カテゴリ",
    sectionLocate: "現在地から探す",
    sectionSearch: "店名・住所で検索",
    sectionResults: "検索結果",
    allAreas: "すべて",
    locateGet: "📍 現在地を取得",
    locateClear: "✕ 現在地を解除",
    locating: "現在地を取得中…",
    locateSorted: "現在地から近い順に表示しています",
    locateDenied: "位置情報の利用が許可されませんでした",
    locateUnavailable: "現在地を特定できませんでした",
    locateTimeout: "現在地の取得がタイムアウトしました",
    locateFailed: "現在地を取得できませんでした",
    locateUnsupported: "この端末では位置情報を利用できません",
    walkNone: "距離指定なし",
    walkOption: "徒歩{n}分圏内",
    walkApprox: "徒歩約{n}分",
    searchPlaceholder: "例: 鮨 / フレンチ / Shibuya",
    yearHint: "過去年はアーカイブ復元データのため掲載の欠損があります",
    yearSuffix: "年",
    includePastLabel: "過去掲載店も表示",
    includePastHint:
      "淡色の店は選択年に掲載がなく、過去の掲載記録から表示しています。ミシュランは過去版の掲載を公式サイトから削除するため公式では確認できず、評価は当時のもので、閉店・掲載外れの可能性があります",
    listedUntil: "{year}年まで掲載",
    countOf: "<strong>{n}</strong> 軒 / 全{total}軒",
    empty: "条件に合うお店が見つかりませんでした",
    loading: "掲載店を読み込み中…",
    loadFailed: "読み込みに失敗しました。再読み込みしてください。",
    mobileOpen: "検索・絞り込み",
    mobileClose: "地図に戻る",
    popupWalk: "現在地から徒歩約 <strong>{min}分</strong>（直線 {m}m）",
    popupNotInGuideBadge: "最新版に掲載なし",
    popupNotInGuideNote: "閉店・掲載外れの可能性があります（過去の掲載記録から復元）",
    popupGuideLink: "ミシュラン公式ページ",
    popupGmapsLink: "Googleマップで見る",
    popupSiteLink: "お店のサイト",
    popupDesc: "ガイドの紹介文（英語）",
    greenStar: "グリーンスター",
    awardBib: "ビブグルマン",
    awardBibShort: "ビブ",
    award3: "三つ星",
    award2: "二つ星",
    award1: "一つ星",
    awardSelected: "セレクテッド",
    awardFallback: "掲載店",
    catWashoku: "和食",
    catYoshoku: "洋食",
    catChuka: "中華",
    catEthnic: "アジア・エスニック",
    catOther: "創作・その他",
    credits:
      'データ: <a href="https://github.com/ngshiheng/michelin-my-maps" target="_blank" rel="noopener">michelin-my-maps</a>（MIT） / 徒歩分数は直線距離×80m/分の近似です。<br />全軒数には過去年のみ掲載の店（閉店・掲載外れ等）を含みます。住所検索はローマ字表記（例: Shibuya）に対応しています。<br />本サイトはミシュランガイド非公式のファンメイドです。',
  },
  en: {
    docTitle: "MishuMap — Michelin-listed restaurants in Japan",
    appTitle: "MishuMap",
    sectionAward: "Distinction",
    sectionYear: "Guide year",
    sectionArea: "Area",
    sectionCategory: "Category",
    sectionLocate: "Near me",
    sectionSearch: "Search by name / address",
    sectionResults: "Results",
    allAreas: "All",
    locateGet: "📍 Use my location",
    locateClear: "✕ Clear location",
    locating: "Locating…",
    locateSorted: "Sorted by distance from your location",
    locateDenied: "Location permission was denied",
    locateUnavailable: "Could not determine your location",
    locateTimeout: "Location request timed out",
    locateFailed: "Failed to get your location",
    locateUnsupported: "Geolocation is not available on this device",
    walkNone: "Any distance",
    walkOption: "Within {n} min walk",
    walkApprox: "~{n} min walk",
    searchPlaceholder: "e.g. Sushi / French / Shibuya",
    yearHint: "Data for past years is restored from web archives and may be incomplete",
    yearSuffix: "",
    includePastLabel: "Include past listings",
    includePastHint:
      "Faded markers were not listed in the selected year and are shown from past records. Michelin removes past listings from its official site, so these cannot be verified there — awards are from the year shown, and restaurants may be closed or delisted",
    listedUntil: "Listed until {year}",
    countOf: "<strong>{n}</strong> of {total} listings",
    empty: "No restaurants match your filters",
    loading: "Loading restaurants…",
    loadFailed: "Failed to load data. Please reload the page.",
    mobileOpen: "Search & filter",
    mobileClose: "Back to map",
    popupWalk: "About <strong>{min} min</strong> walk from you ({m}m straight-line)",
    popupNotInGuideBadge: "Not in latest guide",
    popupNotInGuideNote: "May be closed or delisted (restored from past guide records)",
    popupGuideLink: "MICHELIN Guide page",
    popupGmapsLink: "Open in Google Maps",
    popupSiteLink: "Restaurant website",
    popupDesc: "Guide description",
    greenStar: "Green Star",
    awardBib: "Bib Gourmand",
    awardBibShort: "Bib",
    award3: "3 Stars",
    award2: "2 Stars",
    award1: "1 Star",
    awardSelected: "Selected",
    awardFallback: "Listed",
    catWashoku: "Japanese",
    catYoshoku: "Western",
    catChuka: "Chinese",
    catEthnic: "Asian & Ethnic",
    catOther: "Creative & Others",
    credits:
      'Data: <a href="https://github.com/ngshiheng/michelin-my-maps" target="_blank" rel="noopener">michelin-my-maps</a> (MIT). Walking times are approximations (straight-line distance at 80m/min).<br />Totals include restaurants only listed in past years (possibly closed or delisted). Address search works with romanized names (e.g. Shibuya).<br />This is an unofficial fan-made site, not affiliated with the MICHELIN Guide.',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["ja"];

const STORAGE_KEY = "bgm-lang";

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    /* プライベートモード等でlocalStorage不可なら言語検出のみ */
  }
  return navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

let current: Lang = detectLang();
document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 保存できなくても動作に支障なし */
  }
}

export function t(key: StringKey): string {
  return STRINGS[current][key];
}

/** "{n}" 形式のプレースホルダを埋める */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}
