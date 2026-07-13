/**
 * 料理ジャンル（データは英語）の日本語検索エイリアス。
 * データの店名・住所はほぼ全てローマ字のため、これがないと日本語検索がほぼ機能しない。
 */
export const CUISINE_ALIASES: Record<string, string> = {
  Japanese: "日本料理 和食",
  Sushi: "鮨 寿司 すし",
  Tempura: "天ぷら てんぷら",
  Soba: "そば 蕎麦",
  Udon: "うどん",
  Somen: "そうめん 素麺",
  Ramen: "ラーメン らーめん 拉麺",
  Izakaya: "居酒屋",
  Yakitori: "焼き鳥 焼鳥 やきとり",
  "Unagi / Freshwater Eel": "うなぎ 鰻",
  "Anago / Saltwater Eel": "あなご 穴子",
  Tonkatsu: "とんかつ トンカツ 豚カツ",
  Kushiage: "串揚げ 串カツ",
  Oden: "おでん",
  Okonomiyaki: "お好み焼き",
  Takoyaki: "たこ焼き",
  Onigiri: "おにぎり",
  Obanzai: "おばんざい",
  Shojin: "精進料理",
  Sukiyaki: "すき焼き",
  Teppanyaki: "鉄板焼き",
  "Fugu / Pufferfish": "ふぐ 河豚",
  Chankonabe: "ちゃんこ鍋",
  "Okinawa Cuisine": "沖縄料理",
  "Crab Specialities": "かに カニ 蟹",
  "Chicken Specialities": "鶏料理 とり料理",
  "Duck Specialities": "鴨料理",
  Beef: "牛肉料理 焼肉",
  Pork: "豚肉料理",
  "Meats and Grills": "肉料理 グリル",
  French: "フレンチ フランス料理",
  Italian: "イタリアン イタリア料理",
  Spanish: "スペイン料理 バル",
  Portuguese: "ポルトガル料理",
  Austrian: "オーストリア料理",
  European: "ヨーロッパ料理 欧風料理",
  Steakhouse: "ステーキ",
  Pizza: "ピザ ピッツァ",
  Yoshoku: "洋食",
  Chinese: "中華 中国料理",
  Dumplings: "餃子 点心",
  Korean: "韓国料理",
  Thai: "タイ料理",
  Vietnamese: "ベトナム料理",
  Indian: "インド料理",
  Nepali: "ネパール料理",
  "Sri Lankan": "スリランカ料理",
  "South East Asian": "東南アジア料理",
  Curry: "カレー",
  Moroccan: "モロッコ料理",
  Mexican: "メキシコ料理",
  Peruvian: "ペルー料理",
  Contemporary: "コンテンポラリー 現代風",
  Creative: "創作料理",
  Innovative: "イノベーティブ 創作料理",
};

/** "French, Contemporary" のような複合ジャンルにも対応してエイリアスを集める */
export function cuisineAliasText(cuisine: string): string {
  return cuisine
    .split(",")
    .map((part) => CUISINE_ALIASES[part.trim()] ?? "")
    .filter(Boolean)
    .join(" ");
}

/**
 * チップ表示用の日本語ラベル。エイリアスの先頭語を代表名として使う
 * （例: Sushi → "鮨 寿司 すし" の先頭 "鮨"）。対応がなければ英語名のまま。
 */
export function cuisineLabelJa(cuisine: string): string {
  const alias = CUISINE_ALIASES[cuisine];
  return alias ? alias.split(" ")[0] : cuisine;
}
