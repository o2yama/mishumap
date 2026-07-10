// en/index.html を ja/index.html から生成する（二重管理によるドリフト防止）。
// 静的HTMLとして差し替えるのはSEOに効く3点のみ。残りの文言は実行時にi18nが差し替える。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(root, "ja/index.html"), "utf-8");

const replacements = [
  ['<html lang="ja">', '<html lang="en">'],
  [
    "<title>ミシュマップ — 日本のミシュラン掲載店を地図で探す</title>",
    "<title>MishuMap — Michelin-listed restaurants in Japan</title>",
  ],
  [
    'content="日本のビブグルマン・星付き店を地図で検索。年・エリア・カテゴリ・現在地から徒歩◯分で絞り込めます。"',
    'content="Explore Michelin-starred and Bib Gourmand restaurants in Japan on a map. Filter by year, area, category, and walking distance."',
  ],
];

for (const [from, to] of replacements) {
  if (!html.includes(from)) {
    console.error(`gen-en-page: 置換元が見つかりません: ${from}`);
    process.exit(1);
  }
  html = html.replace(from, to);
}

writeFileSync(join(root, "en/index.html"), html);
console.log("generated en/index.html");
