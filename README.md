# ミシュマップ (MishuMap)

日本のミシュランガイド掲載店（ビブグルマン・星付き・セレクテッド 約1,500軒）を地図で検索できるWebアプリ。

**▶ https://o2yama.github.io/mishumap/**

- **区分**: ビブグルマン / 三つ星 / 二つ星 / 一つ星 / セレクテッド
- **掲載年**: 2020〜2026年（過去年はアーカイブ復元データのため欠損あり）
- **エリア**: 東京 / 京都 / 大阪 / 吹田 / 奈良
- **カテゴリ**: 和食 / 洋食 / 中華 / アジア・エスニック / 創作・その他
- **現在地から徒歩◯分圏内**（直線距離×80m/分の近似）
- **店名・住所・ジャンル検索**（日本語エイリアス対応: 鮨・ラーメン・フレンチ等）

## 開発

```bash
npm install
npm run dev        # 開発サーバー
npm run build      # 型チェック + 本番ビルド (dist/)
npm run data       # 掲載データの再取得・再生成
```

## データについて

データは [ngshiheng/michelin-my-maps](https://github.com/ngshiheng/michelin-my-maps)（MITライセンス）と、
同作者が公開する年次履歴Datasette APIから生成しています（`scripts/fetch_data.py`）。
ミシュラン公式サイトを直接スクレイピングはしていません。

年次履歴はWayback Machineからの復元ベースのため、**古い年ほど掲載の欠損があります**。
「その年の完全な掲載リスト」ではない点に注意してください。

本サイトはミシュランガイドとは無関係の非公式ファンメイドです。

## 技術構成

Vite + TypeScript + Leaflet（OpenStreetMap / CARTO Positronタイル）。バックエンドなしの静的サイト。
