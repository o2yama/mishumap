# bib-gourmand-map（ミシュマップ / MishuMap）

アプリ名は「ミシュマップ」（2026-07-10改名。旧称ビブグルマンマップ）。ディレクトリ名は据え置き。

日本のミシュランガイド掲載店（星付き・ビブグルマン・セレクテッド）を地図上で検索できる静的Webアプリ。

## ゴール

「ビブグルマンの店を調べるのが面倒」を解消する。Google Map風のUIで、
**区分・年（掲載年）・エリア・カテゴリ（和食/洋食/中華/アジア/その他）・現在地から徒歩◯分** で絞り込める。
一般公開が前提（GitHub Pages想定）。

## 構成

- 静的サイト: Vite + TypeScript + Leaflet（OpenStreetMap）。バックエンドなし
- データ: `scripts/fetch_data.py` が生成する `public/data/restaurants.json` を同梱
- カテゴリ分類の対応表: `data/cuisine_categories.json`（手動キュレーション。未知の料理ジャンルが出たらここに追記）

## データソース（重要）

- 一次ソース: [ngshiheng/michelin-my-maps](https://github.com/ngshiheng/michelin-my-maps)（MITライセンス）
  - 最新スナップショットCSV: `https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv`
  - 年次履歴API（作者公開のDatasette）: `https://michelindb.jerrynsh.com/michelin/award_timeline.json` ほか
- Datasetteは1リクエスト最大1000行。超える場合は年×区分で分割取得する（fetch_data.py が対応済み）
- 年次履歴はWayback Machine復元ベースのため**古い年ほど欠損がある**（2020年は日本57軒のみ等）。
  「その年の完全な掲載リスト」ではない点をUI上も注記している
- ミシュラン公式のAPIではない。公式サイトの直接スクレイピングはしない方針

## データ更新手順

```bash
python3 scripts/fetch_data.py               # 常にAPIから再取得して public/data/restaurants.json を再生成
python3 scripts/fetch_data.py --use-cache   # 開発時の反復用（tmp/cache/ を使う。データは更新されない）
```

## 制約・注意

- 一時ファイルは `tmp/`（gitignore済み）へ
- 決定記録は `docs/decisions.md` に追記する
- 公開デプロイ・リポジトリ公開などの外部公開行為はユーザー確認を取ってから
