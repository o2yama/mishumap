// エリア×区分の静的一覧ページ・sitemap.xml を public/ 配下に生成する（SEO用）。
// predev/prebuild で自動実行され、生成物は gitignore 対象。
// 方針: 事実データ（店名・住所・ジャンル・区分）のみで構成し、ミシュランの紹介文（著作物）は載せない。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "public/data/restaurants.json"), "utf-8"));

// url 等の詳細項目は初期ロード軽量化のため details.json に分離されている。
// 静的ページ生成はビルド時なので、ここでは全部戻して従来どおり店名リンクを出す
const details = JSON.parse(readFileSync(join(root, "public/data/details.json"), "utf-8"));
for (const r of data.restaurants) Object.assign(r, details[r.id] ?? {});

const SITE = "https://mishumap.com";
const YEAR = data.latestYear;
const PREV_YEAR = YEAR - 1;

// アプリ本体のタイトル年号はハードコード（ja/index.html）のため、データ側の最新年が進んだら
// 手動更新が必要。取り残しに気づけるよう、ズレたらビルドを止める（gen-en-page.mjs の置換も要更新）
const appHtml = readFileSync(join(root, "ja/index.html"), "utf-8");
if (!appHtml.includes(`ミシュラン${YEAR}`)) {
  console.error(
    `gen-seo-pages: ja/index.html のタイトル年号がデータの最新年（${YEAR}）と一致しません。` +
      "ja/index.html と scripts/gen-en-page.mjs の年号を更新してください",
  );
  process.exit(1);
}

const AREAS = [
  { id: "Tokyo", slug: "tokyo", ja: "東京", en: "Tokyo" },
  { id: "Kyoto", slug: "kyoto", ja: "京都", en: "Kyoto" },
  { id: "Osaka", slug: "osaka", ja: "大阪", en: "Osaka" },
  { id: "Nara", slug: "nara", ja: "奈良", en: "Nara" },
];

const AWARDS = [
  { id: "Bib Gourmand", slug: "bib-gourmand", ja: "ビブグルマン", en: "Bib Gourmand" },
  { id: "3 Stars", slug: "3-stars", ja: "三つ星", en: "3-Star" },
  { id: "2 Stars", slug: "2-stars", ja: "二つ星", en: "2-Star" },
  { id: "1 Star", slug: "1-star", ja: "一つ星", en: "1-Star" },
  { id: "Selected Restaurants", slug: "selected", ja: "セレクテッド", en: "Selected" },
];

const CATEGORY_LABELS = {
  washoku: { ja: "和食", en: "Japanese" },
  yoshoku: { ja: "洋食", en: "Western" },
  chuka: { ja: "中華", en: "Chinese" },
  ethnic: { ja: "アジア・エスニック", en: "Asian & Ethnic" },
  other: { ja: "創作・その他", en: "Creative & Others" },
};

const MIN_LISTINGS = 3; // これ未満のページは薄すぎるので作らない

/** 日本語ページには日本語住所を出す（郵便番号から復元。復元できなかった店は英語のまま） */
const addr = (r, lang) => (lang === "ja" ? r.addressJa || r.address : r.address);

// Cloudflare Web Analytics（Cookieレス）。検索流入の着地点はこのSEOページ群なので、
// 地図アプリ本体と同じビーコンをここにも入れる
const BEACON = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "59d513e09571468fb1ede4011e2dd7bd"}'></script>`;

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const jsonLd = (obj) => JSON.stringify(obj).replaceAll("<", "\\u003c");

/** 最新年版に掲載されている店（エリア・区分で絞り込み） */
function listings(areaId, awardId) {
  return data.restaurants
    .filter((r) => r.area === areaId && r.awards[String(YEAR)] && (!awardId || r.awards[String(YEAR)] === awardId))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function categoryBreakdown(rs, lang) {
  const counts = {};
  for (const r of rs) counts[r.category] = (counts[r.category] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${CATEGORY_LABELS[cat]?.[lang] ?? cat}${lang === "ja" ? `${n}軒` : ` ${n}`}`)
    .join(lang === "ja" ? "、" : ", ");
}

const CSS = `
:root{--paper:#f7f1e5;--ink:#2b241c;--soft:#6d6152;--red:#bb1f2f;--red-deep:#8f1622;--line:#d8cbb2}
*{box-sizing:border-box}body{margin:0;font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN",sans-serif;background:var(--paper);color:var(--ink);line-height:1.7}
.wrap{max-width:880px;margin:0 auto;padding:28px 20px 60px}
header.site{display:flex;align-items:center;gap:10px;margin-bottom:18px}
header.site img{width:34px}header.site a{font-family:"Zen Old Mincho",serif;font-weight:900;font-size:19px;color:var(--ink);text-decoration:none}
h1{font-family:"Zen Old Mincho","Hiragino Mincho ProN",serif;font-weight:900;font-size:26px;line-height:1.4;border-bottom:3px double var(--line);padding-bottom:12px}
h2{font-family:"Zen Old Mincho",serif;font-size:19px;margin-top:36px;border-left:4px solid var(--red);padding-left:10px}
.lead{color:var(--soft);font-size:14.5px}
.cta{display:inline-block;margin:14px 0;padding:12px 22px;background:linear-gradient(180deg,#d3313f,var(--red-deep));color:#faf3e3;font-weight:700;border-radius:8px;text-decoration:none;box-shadow:0 3px 10px rgba(143,22,34,.3)}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:10px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;letter-spacing:.12em;color:var(--red-deep);border-bottom:2px solid var(--line)}
td a{color:var(--red-deep)}
.faq dt{font-weight:700;margin-top:14px}.faq dd{margin:4px 0 0;color:var(--soft);font-size:14px}
nav.rel{margin-top:36px;padding-top:16px;border-top:3px double var(--line);font-size:13px;line-height:2.2}
nav.rel a{color:var(--red-deep);margin-right:14px;white-space:nowrap}
footer{margin-top:30px;font-size:11px;color:var(--soft);line-height:1.8}
footer a{color:var(--red-deep)}
.badge{font-size:10px;font-weight:700;color:#faf3e3;background:var(--red);border-radius:3px;padding:1.5px 7px;white-space:nowrap}
.badge-muted{background:#8a7f6d}
nav.bc{font-size:12px;color:var(--soft);margin-bottom:14px}nav.bc a{color:var(--red-deep)}
.status{font-size:13.5px;padding:10px 14px;border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.45);margin:14px 0}
`;

const STR = {
  ja: {
    langPath: "ja",
    htmlLang: "ja",
    listAll: (area, n) => `ミシュラン${area}の掲載店 全${n}軒 一覧・地図（${YEAR}年版）`,
    listAward: (area, award, n) => `ミシュラン${area}の${award} 全${n}軒 一覧・地図（${YEAR}年版）`,
    metaAll: (area, n) =>
      `ミシュランガイド${YEAR}年版に掲載されている${area}のレストラン全${n}軒（三つ星〜ビブグルマン・セレクテッド）を一覧と地図で紹介。店名・住所・ジャンル付き。`,
    metaAward: (area, award, n) =>
      `ミシュランガイド${YEAR}年版で${area}の${award}に選ばれた全${n}軒を一覧と地図で紹介。店名・住所・ジャンル付き。`,
    leadAll: (area, n, breakdown) =>
      `ミシュランガイド${YEAR}年版に掲載されている${area}のレストランは全${n}軒。ジャンル別の内訳は${breakdown}です。下の地図ボタンから、現在地からの徒歩圏検索や年度別の絞り込みもできます。`,
    leadAward: (area, award, n, breakdown) =>
      `ミシュランガイド${YEAR}年版で${area}の${award}に選ばれているのは全${n}軒。ジャンル別の内訳は${breakdown}です。下の地図ボタンから、現在地からの徒歩圏検索や年度別の絞り込みもできます。`,
    cta: "この一覧を地図で見る →",
    listHeading: "掲載店一覧",
    thName: "店名",
    thGenre: "ジャンル",
    thAddress: "住所",
    thAward: "区分",
    faqHeading: "よくある質問",
    faqBib: [
      "ビブグルマンとは？",
      "星付きには届かないものの、手頃な価格で質の高い料理を提供する店にミシュランガイドが与える評価です。いわゆる「コスパの良い名店」の目印として使われます。",
    ],
    faqCount: (area, label, n) => [
      `${area}の${label}は何軒ありますか？`,
      `ミシュランガイド${YEAR}年版では${area}の${label}は全${n}軒です。本ページの一覧と地図で全店を確認できます。`,
    ],
    relAreas: "エリア別",
    relAwards: (area) => `${area}の区分別`,
    toApp: "地図アプリで開く",
    changesLink: (area) => `${area}の${YEAR}年版の変動（新規・掲載外れ）`,
    chTitle: (area, total) => `ミシュランガイド${area}${YEAR} 新規掲載・昇格・掲載外れ まとめ【全${total}軒の変動】`,
    chMeta: (area, nNew, nUp, nDrop) =>
      `ミシュランガイド${YEAR}年版で${area}に新しく掲載された店（${nNew}軒）、区分が変わった店（${nUp}軒）、掲載がなくなった店（${nDrop}軒）を年次データの比較から一覧化。`,
    chLead: (area, nNew, nCh, nDrop) =>
      `ミシュランガイド${area}の${PREV_YEAR}年版と${YEAR}年版を比較すると、新規掲載${nNew}軒・区分の変動${nCh}軒・掲載外れ${nDrop}軒でした。各表の店名から公式ページ（掲載外れ店はGoogleマップ）に飛べます。`,
    chDisclaimer: `本ページの差分は公式発表ではなく、本サイトが保有する年次データ（Webアーカイブ復元を含む）の機械的な比較によるものです。過去年データには欠損があるため、「新規掲載」には実際には以前から掲載されていた店が含まれる可能性があります。「掲載外れ」には閉店・移転・休業による除外も含まれます。正確な情報はミシュラン公式をご確認ください。`,
    chNew: (n) => `新規掲載（${n}軒）`,
    chChanged: (n) => `区分が変わった店（${n}軒）`,
    chDropped: (n) => `掲載がなくなった店（${n}軒）`,
    chNone: "該当なし",
    chPrevAward: `${PREV_YEAR}年版の区分`,
    chArrow: (p, c) => `${p} → ${c}`,
    chUp: "昇格",
    chDown: "変更",
    footer: `データ出典: <a href="https://github.com/ngshiheng/michelin-my-maps" rel="noopener">michelin-my-maps</a>（MIT License）。本サイトはミシュランガイド非公式のファンメイドです。掲載内容は${YEAR}年版時点の情報で、最新の掲載状況は公式サイトをご確認ください。`,
    all: "すべての掲載店",
    rTitleCur: (name, area, award) => `${name} — ${area}のミシュラン${award}（${YEAR}年版）｜地図・掲載履歴`,
    rTitlePast: (name, area, award, last) => `${name} — ${area}の過去ミシュラン掲載店（最終掲載${last}年・${award}）`,
    rMetaCur: (r, area, award) =>
      `${r.name}（${area}・${r.cuisine}）はミシュランガイド${YEAR}年版の${award}掲載店。住所は${addr(r, "ja") || "非公開"}。掲載履歴・地図・公式ガイドへのリンクをまとめています。`,
    rMetaPast: (r, area, award, last) =>
      `${r.name}（${area}・${r.cuisine}）は${last}年版までミシュランガイドに掲載されていた店（最終区分: ${award}）。現在のガイドには掲載されていません。掲載履歴と所在地情報を掲載。`,
    rStatusCur: (award) => `ミシュランガイド${YEAR}年版に${award}として掲載中です。`,
    rStatusPast: (last, award) =>
      `現在のミシュランガイドには掲載されていません（最終掲載: ${last}年版・${award}）。閉店・移転・掲載外れのいずれの可能性もあります。`,
    rInfo: "店舗情報",
    rHistory: "ミシュラン掲載履歴",
    rNearby: "近くのミシュラン掲載店",
    thYear: "年",
    thPrice: "価格帯",
    thPhone: "電話",
    rOfficial: "ミシュラン公式ページ",
    rGmaps: "Googleマップで見る",
    rWebsite: "店舗サイト",
    rNotInGuide: "掲載外",
    rCta: "この店の周辺を地図アプリで見る →",
    rBackToList: (area, award) => `${area}の${award}一覧へ`,
  },
  en: {
    langPath: "en",
    htmlLang: "en",
    listAll: (area, n) => `All ${n} Michelin-Listed Restaurants in ${area} — List & Map (${YEAR})`,
    listAward: (area, award, n) => `${award} Restaurants in ${area} — All ${n} on a List & Map (${YEAR})`,
    metaAll: (area, n) =>
      `Complete list and map of all ${n} restaurants in ${area} featured in the ${YEAR} MICHELIN Guide, from 3-Star to Bib Gourmand. With addresses and cuisines.`,
    metaAward: (area, award, n) =>
      `Complete list and map of all ${n} ${award} restaurants in ${area} from the ${YEAR} MICHELIN Guide. With addresses and cuisines.`,
    leadAll: (area, n, breakdown) =>
      `The ${YEAR} MICHELIN Guide features ${n} restaurants in ${area}. By cuisine: ${breakdown}. Use the map below to filter by walking distance from your location or by guide year.`,
    leadAward: (area, award, n, breakdown) =>
      `${n} restaurants in ${area} hold the ${award} distinction in the ${YEAR} MICHELIN Guide. By cuisine: ${breakdown}. Use the map below to filter by walking distance from your location or by guide year.`,
    cta: "View this list on the map →",
    listHeading: "Restaurant list",
    thName: "Name",
    thGenre: "Cuisine",
    thAddress: "Address",
    thAward: "Distinction",
    faqHeading: "FAQ",
    faqBib: [
      "What is the Bib Gourmand?",
      "A MICHELIN Guide distinction for restaurants offering high-quality cooking at moderate prices — a marker of great value rather than fine dining.",
    ],
    faqCount: (area, label, n) => [
      `How many ${label} restaurants are there in ${area}?`,
      `The ${YEAR} MICHELIN Guide lists ${n} ${label} restaurants in ${area}. All of them appear in the list and map on this page.`,
    ],
    relAreas: "By area",
    relAwards: (area) => `${area} by distinction`,
    toApp: "Open the map app",
    changesLink: (area) => `${area} ${YEAR} guide changes (new & removed)`,
    chTitle: (area, total) => `MICHELIN Guide ${area} ${YEAR}: New, Promoted & Removed Restaurants (${total} changes)`,
    chMeta: (area, nNew, nUp, nDrop) =>
      `${nNew} newly listed, ${nUp} distinction changes, and ${nDrop} removed restaurants in the ${YEAR} MICHELIN Guide for ${area}, compiled from year-over-year data.`,
    chLead: (area, nNew, nCh, nDrop) =>
      `Comparing the ${PREV_YEAR} and ${YEAR} MICHELIN Guide data for ${area}: ${nNew} new listings, ${nCh} distinction changes, and ${nDrop} removals. Restaurant names link to the official guide page (removed restaurants link to Google Maps).`,
    chDisclaimer: `These changes are compiled by mechanically comparing this site's year-over-year data (partly restored from web archives), not from official announcements. Because past-year data has gaps, some "new" restaurants may have been listed earlier. "Removed" includes closures and relocations. Check the official MICHELIN Guide for authoritative information.`,
    chNew: (n) => `Newly listed (${n})`,
    chChanged: (n) => `Distinction changes (${n})`,
    chDropped: (n) => `No longer listed (${n})`,
    chNone: "None",
    chPrevAward: `${PREV_YEAR} distinction`,
    chArrow: (p, c) => `${p} → ${c}`,
    chUp: "Promoted",
    chDown: "Changed",
    footer: `Data: <a href="https://github.com/ngshiheng/michelin-my-maps" rel="noopener">michelin-my-maps</a> (MIT License). This is an unofficial fan-made site, not affiliated with the MICHELIN Guide. Listings reflect the ${YEAR} guide; check the official site for the latest status.`,
    all: "All listed restaurants",
    rTitleCur: (name, area, award) => `${name} — ${award} Restaurant in ${area} (${YEAR} MICHELIN Guide) | Map & History`,
    rTitlePast: (name, area, award, last) => `${name} — Former MICHELIN-Listed Restaurant in ${area} (last listed ${last}, ${award})`,
    rMetaCur: (r, area, award) =>
      `${r.name} (${r.cuisine}, ${area}) holds the ${award} distinction in the ${YEAR} MICHELIN Guide. Address: ${addr(r, "en") || "n/a"}. Listing history, map and official guide link.`,
    rMetaPast: (r, area, award, last) =>
      `${r.name} (${r.cuisine}, ${area}) was listed in the MICHELIN Guide until ${last} (last distinction: ${award}). Not in the current guide. Listing history and location.`,
    rStatusCur: (award) => `Listed in the ${YEAR} MICHELIN Guide as ${award}.`,
    rStatusPast: (last, award) =>
      `Not in the current MICHELIN Guide (last listed: ${last}, ${award}). The restaurant may have closed, relocated, or been removed.`,
    rInfo: "Restaurant details",
    rHistory: "MICHELIN listing history",
    rNearby: "MICHELIN-listed restaurants nearby",
    thYear: "Year",
    thPrice: "Price range",
    thPhone: "Phone",
    rOfficial: "Official MICHELIN Guide page",
    rGmaps: "Open in Google Maps",
    rWebsite: "Restaurant website",
    rNotInGuide: "Not listed",
    rCta: "Explore this area on the map →",
    rBackToList: (area, award) => `All ${award} restaurants in ${area}`,
  },
};

const AWARD_RANK = { "3 Stars": 5, "2 Stars": 4, "1 Star": 3, "Bib Gourmand": 2, "Selected Restaurants": 1 };
const awardName = (id, lang) => AWARDS.find((a) => a.id === id)?.[lang] ?? id;

/**
 * 前年版→最新版の変動。
 * 新規 = 過去のどの年にも記録がない店（過去年データの欠損により偽陽性があり得る→ページ内で明示）
 * 掲載外れ = 最後の掲載記録が前年の店（最新版は完全データなので信頼できる）
 */
function computeDiff(areaId) {
  const rs = data.restaurants.filter((r) => r.area === areaId);
  const cur = (r) => r.awards[String(YEAR)];
  const prev = (r) => r.awards[String(PREV_YEAR)];
  const byName = (a, b) => a.name.localeCompare(b.name, "ja");
  return {
    newcomers: rs.filter((r) => cur(r) && !Object.keys(r.awards).some((y) => Number(y) < YEAR)).sort(byName),
    changed: rs
      .filter((r) => cur(r) && prev(r) && cur(r) !== prev(r))
      .sort((a, b) => AWARD_RANK[cur(b)] - AWARD_RANK[cur(a)] || byName(a, b)),
    dropped: rs.filter((r) => Object.keys(r.awards).length && Math.max(...Object.keys(r.awards).map(Number)) === PREV_YEAR).sort(byName),
  };
}

const gmapsUrl = (r) =>
  r.lat != null
    ? `https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${r.lat},${r.lng},17z`
    : `https://www.google.com/maps/search/${encodeURIComponent(`${r.name} ${r.area} Japan`)}`;

// ---- 店舗個別ページ用ヘルパー ----
const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// 店舗slug: id（"tokyo-sushi-sugisawa" 形式・全店ユニーク）からエリアプレフィックスを剥がす。
// idは日本語文字を含み得るが、URLとディレクトリ名を完全一致させるためASCIIに落とし、
// その結果の衝突はエリア内で -2 採番する（決定的: data.restaurants の並び順で採番）
const SLUGS = new Map();
{
  const seen = new Set();
  for (const r of data.restaurants) {
    const prefix = `${AREA_BY_ID[r.area].slug}-`;
    const raw = r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id;
    const base =
      raw.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "restaurant";
    let slug = base;
    for (let n = 2; seen.has(`${r.area}/${slug}`); n++) slug = `${base}-${n}`;
    seen.add(`${r.area}/${slug}`);
    SLUGS.set(r.id, slug);
  }
}
const slugOf = (r) => SLUGS.get(r.id);

const rPath = (lang, r) => `/${lang}/${AREA_BY_ID[r.area].slug}/r/${slugOf(r)}/`;
const rUrl = (lang, r) => `${SITE}${rPath(lang, r)}`;
const nameLink = (lang, r) => `<a href="${rPath(lang, r)}">${esc(r.name)}</a>`;

/** 同エリアの現行掲載店から直線距離の近い順に返す（座標のない店は対象外） */
function nearby(r, limit) {
  if (r.lat == null) return [];
  return data.restaurants
    .filter((x) => x.area === r.area && x.id !== r.id && x.lat != null && x.awards[String(YEAR)])
    .map((x) => ({ x, d: (x.lat - r.lat) ** 2 + ((x.lng - r.lng) * 0.8) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((e) => e.x);
}

function pageUrl(lang, areaSlug, awardSlug) {
  return `${SITE}/${lang}/${areaSlug}/${awardSlug ? awardSlug + "/" : ""}`;
}

function appLink(lang, areaId, awardSlug, shopId) {
  const awards = awardSlug ? `&awards=${awardSlug}` : "&awards=bib-gourmand,3-stars,2-stars,1-star,selected";
  // shopId は店舗個別ページ限定。地図側でその店を中心に周辺ズームする一時パラメータ（?shop=）
  const shop = shopId ? `&shop=${encodeURIComponent(shopId)}` : "";
  return `/${lang}/?area=${areaId.toLowerCase()}${awards}${shop}`;
}

function renderPage({ lang, area, award, rs }) {
  const s = STR[lang];
  const areaName = area[lang];
  const n = rs.length;
  const breakdown = categoryBreakdown(rs, lang);
  const title = award ? s.listAward(areaName, award[lang], n) : s.listAll(areaName, n);
  const meta = award ? s.metaAward(areaName, award[lang], n) : s.metaAll(areaName, n);
  const lead = award ? s.leadAward(areaName, award[lang], n, breakdown) : s.leadAll(areaName, n, breakdown);
  const self = pageUrl(lang, area.slug, award?.slug);
  const alt = pageUrl(lang === "ja" ? "en" : "ja", area.slug, award?.slug);

  const awardBadge = (r) => {
    const a = AWARDS.find((x) => x.id === r.awards[String(YEAR)]);
    return a ? a[lang] : "";
  };

  // 店名リンクは店舗個別ページへ（公式リンクは個別ページ側に置く）
  const rows = rs
    .map(
      (r) => `<tr><td>${nameLink(lang, r)}${
        award ? "" : ` <span class="badge">${esc(awardBadge(r))}</span>`
      }</td><td>${esc(r.cuisine)}</td><td>${esc(addr(r, lang))}</td></tr>`,
    )
    .join("\n");

  const itemList = jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: n,
    itemListElement: rs.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Restaurant",
        name: r.name,
        address: addr(r, lang),
        servesCuisine: r.cuisine,
        geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng },
        ...(r.url ? { sameAs: r.url } : {}),
      },
    })),
  });

  const faqs = [];
  if (!award || award.slug === "bib-gourmand") faqs.push(s.faqBib);
  faqs.push(s.faqCount(areaName, award ? award[lang] : lang === "ja" ? "ミシュラン掲載店" : "Michelin-listed", n));
  const faqLd = jsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });

  const relAreaLinks = AREAS.filter((a) => listings(a.id, award?.id).length >= MIN_LISTINGS)
    .map((a) => `<a href="/${lang}/${a.slug}/${award ? award.slug + "/" : ""}">${esc(a[lang])}</a>`)
    .join("");
  const relAwardLinks = [
    `<a href="/${lang}/${area.slug}/">${esc(s.all)}</a>`,
    ...AWARDS.filter((aw) => listings(area.id, aw.id).length >= MIN_LISTINGS).map(
      (aw) => `<a href="/${lang}/${area.slug}/${aw.slug}/">${esc(aw[lang])}</a>`,
    ),
  ].join("");

  return `<!doctype html>
<html lang="${s.htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} | ${lang === "ja" ? "ミシュマップ" : "MishuMap"}</title>
<meta name="description" content="${esc(meta)}" />
<link rel="canonical" href="${self}" />
<link rel="alternate" hreflang="ja" href="${pageUrl("ja", area.slug, award?.slug)}" />
<link rel="alternate" hreflang="en" href="${pageUrl("en", area.slug, award?.slug)}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${lang === "ja" ? "ミシュマップ" : "MishuMap"}" />
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}" />
<meta property="og:url" content="${self}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(meta)}" />
<meta property="og:image" content="${SITE}/og${lang === "ja" ? "" : "-en"}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- 日本語フォントのCSSは大きくFCPをブロックするため、描画を止めずに読ませる -->
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" /></noscript>
<style>${CSS}</style>
${BEACON}
<script type="application/ld+json">${itemList}</script>
<script type="application/ld+json">${faqLd}</script>
</head>
<body>
<div class="wrap">
<header class="site"><img src="/icon.svg" alt="" /><a href="/${lang}/">${lang === "ja" ? "ミシュマップ" : "MishuMap"}</a></header>
<h1>${esc(title)}</h1>
<p class="lead">${esc(lead)}</p>
<a class="cta" href="${esc(appLink(lang, area.id, award?.slug))}">${esc(s.cta)}</a>
<h2>${esc(s.listHeading)}</h2>
<table>
<thead><tr><th>${s.thName}</th><th>${s.thGenre}</th><th>${s.thAddress}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>${esc(s.faqHeading)}</h2>
<dl class="faq">
${faqs.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("\n")}
</dl>
<nav class="rel">
<div>${esc(s.relAreas)}: ${relAreaLinks}</div>
<div>${esc(s.relAwards(areaName))}: ${relAwardLinks}</div>
<div><a href="/${lang}/${area.slug}/changes-${YEAR}/">${esc(s.changesLink(areaName))}</a></div>
<div><a href="${esc(appLink(lang, area.id, award?.slug))}">${esc(s.toApp)}</a></div>
</nav>
<footer>${s.footer}</footer>
</div>
</body>
</html>
`;
}

function renderRestaurantPage({ lang, r }) {
  const s = STR[lang];
  const area = AREA_BY_ID[r.area];
  const areaName = area[lang];
  const years = Object.keys(r.awards).sort((a, b) => Number(b) - Number(a));
  const inCurrent = Boolean(r.awards[String(YEAR)]);
  const lastYear = years[0];
  const lastAwardId = r.awards[lastYear];
  const awardLabel = awardName(lastAwardId, lang);
  const awardObj = AWARDS.find((a) => a.id === lastAwardId);

  // 区分一覧ページは MIN_LISTINGS 未満だと生成されないため、リンクを張る前に存在を保証する。
  // 可視パンくずと BreadcrumbList 構造化データは同じ条件で揃える（不一致はSearch Console警告になる）
  const showAwardCrumb = Boolean(
    awardObj && inCurrent && listings(area.id, awardObj.id).length >= MIN_LISTINGS,
  );

  const title = inCurrent
    ? s.rTitleCur(r.name, areaName, awardLabel)
    : s.rTitlePast(r.name, areaName, awardLabel, lastYear);
  const meta = inCurrent ? s.rMetaCur(r, areaName, awardLabel) : s.rMetaPast(r, areaName, awardLabel, lastYear);
  const self = rUrl(lang, r);

  const historyRows = years
    .map((y) => `<tr><td>${esc(y)}</td><td><span class="badge">${esc(awardName(r.awards[y], lang))}</span></td></tr>`)
    .join("\n");

  const facts = [
    [s.thGenre, r.cuisine],
    [s.thPrice, r.price],
    [s.thAddress, addr(r, lang)],
    [s.thPhone, r.phone],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("\n");

  const links = [
    // 掲載外の店の公式URLはリンク切れの可能性が高いため現行掲載店のみ出す（ポップアップと同方針）
    inCurrent && r.url ? `<a href="${esc(r.url)}" rel="noopener">${esc(s.rOfficial)}</a>` : "",
    `<a href="${esc(gmapsUrl(r))}" rel="noopener">${esc(s.rGmaps)}</a>`,
    r.website ? `<a href="${esc(r.website)}" rel="noopener">${esc(s.rWebsite)}</a>` : "",
  ]
    .filter(Boolean)
    .join("");

  const near = nearby(r, 6);
  const nearRows = near
    .map(
      (x) =>
        `<tr><td>${nameLink(lang, x)} <span class="badge">${esc(awardName(x.awards[String(YEAR)], lang))}</span></td><td>${esc(x.cuisine)}</td><td>${esc(addr(x, lang))}</td></tr>`,
    )
    .join("\n");

  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    address: addr(r, lang) || undefined,
    servesCuisine: r.cuisine || undefined,
    priceRange: r.price || undefined,
    telephone: r.phone || undefined,
    url: r.website || undefined,
    sameAs: inCurrent && r.url ? r.url : undefined,
    award: `MICHELIN Guide ${lastYear} — ${awardName(lastAwardId, "en")}`,
    ...(r.lat != null ? { geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng } } : {}),
  });
  const breadcrumbLd = jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: areaName, item: pageUrl(lang, area.slug) },
      ...(showAwardCrumb
        ? [{ "@type": "ListItem", position: 2, name: awardObj[lang], item: pageUrl(lang, area.slug, awardObj.slug) }]
        : []),
      { "@type": "ListItem", position: showAwardCrumb ? 3 : 2, name: r.name, item: self },
    ],
  });

  const listBack = showAwardCrumb
    ? `<a href="/${lang}/${area.slug}/${awardObj.slug}/">${esc(s.rBackToList(areaName, awardObj[lang]))}</a>`
    : `<a href="/${lang}/${area.slug}/">${esc(s.all)}</a>`;

  return `<!doctype html>
<html lang="${s.htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} | ${lang === "ja" ? "ミシュマップ" : "MishuMap"}</title>
<meta name="description" content="${esc(meta)}" />
<link rel="canonical" href="${self}" />
<link rel="alternate" hreflang="ja" href="${rUrl("ja", r)}" />
<link rel="alternate" hreflang="en" href="${rUrl("en", r)}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${lang === "ja" ? "ミシュマップ" : "MishuMap"}" />
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}" />
<meta property="og:url" content="${self}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(meta)}" />
<meta property="og:image" content="${SITE}/og${lang === "ja" ? "" : "-en"}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- 日本語フォントのCSSは大きくFCPをブロックするため、描画を止めずに読ませる -->
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" /></noscript>
<style>${CSS}</style>
${BEACON}
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json">${breadcrumbLd}</script>
</head>
<body>
<div class="wrap">
<header class="site"><img src="/icon.svg" alt="" /><a href="/${lang}/">${lang === "ja" ? "ミシュマップ" : "MishuMap"}</a></header>
<nav class="bc"><a href="/${lang}/${area.slug}/">${esc(areaName)}</a>${
    showAwardCrumb ? ` › <a href="/${lang}/${area.slug}/${awardObj.slug}/">${esc(awardObj[lang])}</a>` : ""
  } › ${esc(r.name)}</nav>
<h1>${esc(r.name)} <span class="badge${inCurrent ? "" : " badge-muted"}">${esc(inCurrent ? awardLabel : s.rNotInGuide)}</span></h1>
<p class="status">${esc(inCurrent ? s.rStatusCur(awardLabel) : s.rStatusPast(lastYear, awardLabel))}</p>
<a class="cta" href="${esc(appLink(lang, r.area, null, r.id))}">${esc(s.rCta)}</a>
<h2>${esc(s.rInfo)}</h2>
<table>
${facts}
</table>
<h2>${esc(s.rHistory)}</h2>
<table>
<thead><tr><th>${esc(s.thYear)}</th><th>${esc(s.thAward)}</th></tr></thead>
<tbody>
${historyRows}
</tbody>
</table>
${near.length ? `<h2>${esc(s.rNearby)}</h2>
<table>
<thead><tr><th>${s.thName}</th><th>${s.thGenre}</th><th>${s.thAddress}</th></tr></thead>
<tbody>
${nearRows}
</tbody>
</table>` : ""}
<nav class="rel">
<div>${links}</div>
<div>${listBack}</div>
</nav>
<footer>${s.footer}</footer>
</div>
</body>
</html>
`;
}

function renderChangesPage({ lang, area, diff }) {
  const s = STR[lang];
  const areaName = area[lang];
  const { newcomers, changed, dropped } = diff;
  const total = newcomers.length + changed.length + dropped.length;
  const title = s.chTitle(areaName, total);
  const self = `${SITE}/${lang}/${area.slug}/changes-${YEAR}/`;

  const badge = (id) => `<span class="badge">${esc(awardName(id, lang))}</span>`;
  const cur = (r) => r.awards[String(YEAR)];
  const prev = (r) => r.awards[String(PREV_YEAR)];

  const newRows = newcomers
    .map(
      (r) =>
        `<tr><td>${nameLink(lang, r)}</td><td>${badge(cur(r))}</td><td>${esc(r.cuisine)}</td><td>${esc(addr(r, lang))}</td></tr>`,
    )
    .join("\n");

  const changedRows = changed
    .map((r) => {
      const upDown = AWARD_RANK[cur(r)] > AWARD_RANK[prev(r)] ? `↗ ${s.chUp}` : `↘ ${s.chDown}`;
      return `<tr><td>${nameLink(lang, r)}</td><td>${esc(
        s.chArrow(awardName(prev(r), lang), awardName(cur(r), lang)),
      )}（${esc(upDown)}）</td><td>${esc(r.cuisine)}</td></tr>`;
    })
    .join("\n");

  const droppedRows = dropped
    .map(
      (r) =>
        `<tr><td>${nameLink(lang, r)}</td><td>${badge(prev(r) ?? Object.entries(r.awards).sort((a, b) => Number(b[0]) - Number(a[0]))[0][1])}</td><td>${esc(r.cuisine)}</td><td>${esc(addr(r, lang))}</td></tr>`,
    )
    .join("\n");

  const table = (head, rows) =>
    rows
      ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>\n${rows}\n</tbody></table>`
      : `<p class="lead">${esc(s.chNone)}</p>`;

  const itemList = jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: newcomers.length,
    itemListElement: newcomers.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Restaurant",
        name: r.name,
        address: addr(r, lang),
        servesCuisine: r.cuisine,
        geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng },
        ...(r.url ? { sameAs: r.url } : {}),
      },
    })),
  });

  const relAreaLinks = AREAS.filter((a) => listings(a.id, null).length >= MIN_LISTINGS)
    .map((a) => `<a href="/${lang}/${a.slug}/changes-${YEAR}/">${esc(a[lang])}</a>`)
    .join("");

  return `<!doctype html>
<html lang="${s.htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} | ${lang === "ja" ? "ミシュマップ" : "MishuMap"}</title>
<meta name="description" content="${esc(s.chMeta(areaName, newcomers.length, changed.length, dropped.length))}" />
<link rel="canonical" href="${self}" />
<link rel="alternate" hreflang="ja" href="${SITE}/ja/${area.slug}/changes-${YEAR}/" />
<link rel="alternate" hreflang="en" href="${SITE}/en/${area.slug}/changes-${YEAR}/" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${lang === "ja" ? "ミシュマップ" : "MishuMap"}" />
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}" />
<meta property="og:url" content="${self}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(s.chMeta(areaName, newcomers.length, changed.length, dropped.length))}" />
<meta property="og:image" content="${SITE}/og${lang === "ja" ? "" : "-en"}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- 日本語フォントのCSSは大きくFCPをブロックするため、描画を止めずに読ませる -->
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" /></noscript>
<style>${CSS}</style>
${BEACON}
<script type="application/ld+json">${itemList}</script>
</head>
<body>
<div class="wrap">
<header class="site"><img src="/icon.svg" alt="" /><a href="/${lang}/">${lang === "ja" ? "ミシュマップ" : "MishuMap"}</a></header>
<h1>${esc(title)}</h1>
<p class="lead">${esc(s.chLead(areaName, newcomers.length, changed.length, dropped.length))}</p>
<p class="lead">⚠ ${esc(s.chDisclaimer)}</p>
<a class="cta" href="${esc(appLink(lang, area.id, null))}">${esc(s.cta)}</a>
<h2>${esc(s.chNew(newcomers.length))}</h2>
${table([s.thName, s.thAward, s.thGenre, s.thAddress], newRows)}
<h2>${esc(s.chChanged(changed.length))}</h2>
${table([s.thName, s.chArrow(PREV_YEAR, YEAR), s.thGenre], changedRows)}
<h2>${esc(s.chDropped(dropped.length))}</h2>
${table([s.thName, s.chPrevAward, s.thGenre, s.thAddress], droppedRows)}
<nav class="rel">
<div>${esc(s.relAreas)}: ${relAreaLinks}</div>
<div><a href="/${lang}/${area.slug}/">${esc(s.all)}</a></div>
</nav>
<footer>${s.footer}</footer>
</div>
</body>
</html>
`;
}

// ---- 生成 ----
const sitemapUrls = [`${SITE}/ja/`, `${SITE}/en/`];
let pageCount = 0;

for (const lang of ["ja", "en"]) {
  for (const area of AREAS) {
    const all = listings(area.id, null);
    if (all.length < MIN_LISTINGS) continue;

    const areaDir = join(root, "public", lang, area.slug);
    mkdirSync(areaDir, { recursive: true });
    writeFileSync(join(areaDir, "index.html"), renderPage({ lang, area, award: null, rs: all }));
    sitemapUrls.push(pageUrl(lang, area.slug));
    pageCount++;

    for (const award of AWARDS) {
      const rs = listings(area.id, award.id);
      if (rs.length < MIN_LISTINGS) continue;
      const dir = join(areaDir, award.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), renderPage({ lang, area, award, rs }));
      sitemapUrls.push(pageUrl(lang, area.slug, award.slug));
      pageCount++;
    }

    // 年次差分ページ（新規・変動・掲載外れ）
    const diff = computeDiff(area.id);
    if (diff.newcomers.length + diff.changed.length + diff.dropped.length >= MIN_LISTINGS) {
      const dir = join(areaDir, `changes-${YEAR}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), renderChangesPage({ lang, area, diff }));
      sitemapUrls.push(`${SITE}/${lang}/${area.slug}/changes-${YEAR}/`);
      pageCount++;
    }

    // 店舗個別ページ（過去掲載店も含む全店。年次履歴が独自コンテンツになる）
    for (const r of data.restaurants.filter((x) => x.area === area.id)) {
      const dir = join(areaDir, "r", slugOf(r));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), renderRestaurantPage({ lang, r }));
      sitemapUrls.push(rUrl(lang, r));
      pageCount++;
    }
  }
}

const today = data.generatedAt;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
writeFileSync(join(root, "public/sitemap.xml"), sitemap);

console.log(`generated ${pageCount} SEO pages + sitemap.xml (${sitemapUrls.length} URLs)`);
