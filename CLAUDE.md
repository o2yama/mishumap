# bib-gourmand-map（ミシュマップ / MishuMap）

アプリ名は「ミシュマップ」（2026-07-10改名。旧称ビブグルマンマップ）。ディレクトリ名は据え置き。

日本のミシュランガイド掲載店（星付き・ビブグルマン・セレクテッド）を地図上で検索できる静的Webアプリ。

## ゴール

「ビブグルマンの店を調べるのが面倒」を解消する。Google Map風のUIで、
**区分・年（掲載年）・エリア・カテゴリ（和食/洋食/中華/アジア/その他）・現在地から徒歩◯分** で絞り込める。
一般公開が前提（GitHub Pages想定）。

## 構成

- 静的サイト: Vite + TypeScript + Leaflet（OpenStreetMap）。バックエンドなし
- データ: `scripts/fetch_data.py` が2ファイルを生成する
  - `public/data/restaurants.json` — 起動時に読む（地図・検索・フィルタに必要な項目のみ。gzip 約73KB）
  - `public/data/details.json` — 紹介文・リンク・電話。**ポップアップ用に遅延読込**（gzip 約253KB）。
    紹介文だけで全体の44%を占めるため初期ロードから外した。分離した項目を使う箇所を増やす場合、
    静的ページ生成（ビルド時）は `gen-seo-pages.mjs` が両方をマージするので普通に参照してよい
  - 住所は `scripts/address_ja.py` が郵便番号から日本語表記を復元して `addressJa` に入れる（99.3%）
- カテゴリ分類の対応表: `data/cuisine_categories.json`（手動キュレーション。未知の料理ジャンルが出たらここに追記）
- **SEO一覧ページ**: `scripts/gen-seo-pages.mjs` が `public/{ja,en}/{area}/{award}/index.html` と `sitemap.xml` を
  predev/prebuild で自動生成（gitignore済み）。事実データのみで構成し、紹介文（著作物）は載せない方針。
  地図アプリは `?area=tokyo&awards=bib-gourmand` 形式のURLパラメータで初期フィルタを指定できる
- **言語別パス**: `/ja/` と `/en/` の2ページ構成。ルート `/` はリダイレクタ（localStorage > ブラウザ言語で振り分け）
  - アプリ本体のHTMLは `ja/index.html` が唯一のソース。`en/index.html` は `scripts/gen-en-page.mjs` が
    predev/prebuild で自動生成する（gitignore済み。**直接編集しない**）
  - 直接 `/en/` を開いたときはパスが保存設定より優先される（シェアURLの言語を固定するため）

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

## アクセス解析の参照方法

「アクセスどう？」と聞かれたら `python3 scripts/analytics_report.py`（`--days N` で期間指定）を実行する。

- **Search Console**: gcloud の ADC で認証済み。プロパティは `sc-domain:mishumap.com`。
  APIリクエストには `x-goog-user-project: mishumap-analytics` ヘッダーが毎回必須（ADC設定だけだと403）
- **Cloudflare Web Analytics**: `.env`（gitignore済み）の認証情報を使いGraphQL APIで取得（設定済み・動作確認済み）。
  現在は Global API Key 方式（CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY）。スコープ付きトークンを
  発行したら CLOUDFLARE_API_TOKEN に入れれば自動でそちらを優先する。
  accountTag `c9cd13fa98899e3446ee542e125f3c1e` / siteTag `51bf6f69d00e49298f9f3c586dae9c6f`
- ダッシュボードをブラウザで見る場合: https://dash.cloudflare.com/c9cd13fa98899e3446ee542e125f3c1e/web-analytics
  （devtools/自動操作Chromeはログインセッションを持たないことがある。その場合ユーザーにログインを依頼する）

## 制約・注意

- 一時ファイルは `tmp/`（gitignore済み）へ
- 決定記録は `docs/decisions.md` に追記する
- 公開デプロイ・リポジトリ公開などの外部公開行為はユーザー確認を取ってから
