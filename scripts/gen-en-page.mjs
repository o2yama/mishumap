// en/index.html を ja/index.html から生成する（二重管理によるドリフト防止）。
// 静的HTMLとして差し替えるのはSEO・SNS共有に効くメタ情報のみ。残りの文言は実行時にi18nが差し替える。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(root, "ja/index.html"), "utf-8");

const replacements = [
  ['<html lang="ja">', '<html lang="en">'],
  [
    "<title>ミシュマップ — ミシュラン2026・ビブグルマンの店を地図で探す</title>",
    "<title>MishuMap — Michelin Guide Japan 2026 Map: Bib Gourmand & Stars</title>",
  ],
  // タイトル文言は <title> と og:title の2箇所、説明文は description と og:description の2箇所に出る
  [
    'content="ミシュマップ — ミシュラン2026・ビブグルマンの店を地図で探す"',
    'content="MishuMap — Michelin Guide Japan 2026 Map: Bib Gourmand & Stars"',
  ],
  [
    'content="ミシュランガイド2026の星付き・ビブグルマン・セレクテッド掲載店を地図で検索。年・エリア・カテゴリ・現在地から徒歩◯分で絞り込めます。"',
    'content="Explore Michelin Guide Japan 2026 on a map — Bib Gourmand, starred and selected restaurants. Filter by year, area, category, and walking distance."',
  ],
  ['<link rel="canonical" href="https://mishumap.com/ja/" />', '<link rel="canonical" href="https://mishumap.com/en/" />'],
  [
    '<meta property="og:url" content="https://mishumap.com/ja/" />',
    '<meta property="og:url" content="https://mishumap.com/en/" />',
  ],
  ['<meta property="og:site_name" content="ミシュマップ" />', '<meta property="og:site_name" content="MishuMap" />'],
  ['<meta property="og:locale" content="ja_JP" />', '<meta property="og:locale" content="en_US" />'],
  [
    '<meta property="og:image" content="https://mishumap.com/og.png" />',
    '<meta property="og:image" content="https://mishumap.com/og-en.png" />',
  ],
];

for (const [from, to] of replacements) {
  if (!html.includes(from)) {
    console.error(`gen-en-page: 置換元が見つかりません: ${from}`);
    process.exit(1);
  }
  html = html.replaceAll(from, to);
}

// en/ は生成物のみのディレクトリで git に入らないため、CI では毎回作る
mkdirSync(join(root, "en"), { recursive: true });
writeFileSync(join(root, "en/index.html"), html);
console.log("generated en/index.html");
