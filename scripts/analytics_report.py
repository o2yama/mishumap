#!/usr/bin/env python3
"""mishumap.com のアクセス状況レポート。

Cloudflare Web Analytics（訪問数・PV・流入元）と Google Search Console
（検索クエリ・表示回数・掲載順位）をAPIで取得し、1コマンドでまとめて表示する。

認証:
- Search Console: gcloud の ADC（application-default）。クォータプロジェクトは
  x-goog-user-project ヘッダーで毎リクエスト明示する必要がある（ADC設定だけでは403になる）
- Cloudflare: プロジェクト直下 .env の CLOUDFLARE_API_TOKEN（Account Analytics: Read）

使い方:
    python3 scripts/analytics_report.py            # 過去7日
    python3 scripts/analytics_report.py --days 28  # 過去28日
"""

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Search Console
GSC_SITE = "sc-domain:mishumap.com"
GSC_QUOTA_PROJECT = "mishumap-analytics"

# Cloudflare Web Analytics
CF_ACCOUNT_TAG = "c9cd13fa98899e3446ee542e125f3c1e"  # Taisei.otsuyama@gmail.com's Account
CF_SITE_TAG = "51bf6f69d00e49298f9f3c586dae9c6f"     # mishumap.com


def load_env() -> dict[str, str]:
    env = {}
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def http_json(url: str, headers: dict, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


# --- Google Search Console ---

def gsc_token() -> str:
    out = subprocess.run(
        ["gcloud", "auth", "application-default", "print-access-token"],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def gsc_query(token: str, start: str, end: str, dimensions: list[str], row_limit: int = 10) -> list[dict]:
    url = (
        "https://searchconsole.googleapis.com/webmasters/v3/sites/"
        + urllib.parse.quote(GSC_SITE, safe="")
        + "/searchAnalytics/query"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "x-goog-user-project": GSC_QUOTA_PROJECT,
    }
    body = {"startDate": start, "endDate": end, "dimensions": dimensions, "rowLimit": row_limit}
    return http_json(url, headers, body).get("rows", [])


def report_gsc(start: str, end: str) -> None:
    print(f"\n## Google Search Console（{start} 〜 {end}）")
    try:
        token = gsc_token()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  取得失敗: gcloud ADC のトークンが取れません（{e}）")
        return

    daily = gsc_query(token, start, end, ["date"], row_limit=100)
    clicks = sum(r["clicks"] for r in daily)
    impressions = sum(r["impressions"] for r in daily)
    print(f"  合計: クリック {clicks} / 表示 {impressions}")
    for r in daily:
        print(f"    {r['keys'][0]}: クリック {r['clicks']} / 表示 {r['impressions']}")

    queries = gsc_query(token, start, end, ["query"], row_limit=10)
    if queries:
        print("  上位クエリ（クリック/表示/平均掲載順位）:")
        for r in queries:
            print(f"    {r['keys'][0]}: {r['clicks']} / {r['impressions']} / {r['position']:.1f}位")

    pages = gsc_query(token, start, end, ["page"], row_limit=10)
    if pages:
        print("  上位ページ（クリック/表示）:")
        for r in pages:
            print(f"    {r['keys'][0]}: {r['clicks']} / {r['impressions']}")


# --- Cloudflare Web Analytics ---

def report_cloudflare(start_dt: dt.datetime, end_dt: dt.datetime) -> None:
    print(f"\n## Cloudflare Web Analytics（{start_dt:%Y-%m-%d} 〜 {end_dt:%Y-%m-%d}）")
    env = load_env()
    if env.get("CLOUDFLARE_API_TOKEN"):
        auth_headers = {"Authorization": f"Bearer {env['CLOUDFLARE_API_TOKEN']}"}
    elif env.get("CLOUDFLARE_API_KEY") and env.get("CLOUDFLARE_EMAIL"):
        auth_headers = {"X-Auth-Email": env["CLOUDFLARE_EMAIL"], "X-Auth-Key": env["CLOUDFLARE_API_KEY"]}
    else:
        print("  スキップ: .env に CLOUDFLARE_API_TOKEN か CLOUDFLARE_EMAIL+CLOUDFLARE_API_KEY が必要です")
        return

    # フィルタは値を直接埋め込む（GraphQL変数の入力型名が非公開スキーマのため）。
    # `bot: 0` はコミュニティ実測ベースで確度が低く、スキーマエラー時はボット除外なしで再試行する
    period = (f'{{datetime_geq: "{start_dt:%Y-%m-%dT%H:%M:%SZ}"}}, '
              f'{{datetime_leq: "{end_dt:%Y-%m-%dT%H:%M:%SZ}"}}, '
              f'{{siteTag: "{CF_SITE_TAG}"}}')

    def gql(body: str) -> list[dict]:
        query = (f'query {{ viewer {{ accounts(filter: {{accountTag: "{CF_ACCOUNT_TAG}"}}) '
                 f'{{ {body} }} }} }}')
        res = http_json(
            "https://api.cloudflare.com/client/v4/graphql",
            auth_headers,
            {"query": query},
        )
        if res.get("errors"):
            raise RuntimeError(res["errors"])
        return res["data"]["viewer"]["accounts"][0]["rumPageloadEventsAdaptiveGroups"]

    def groups_query(dims: str, limit: int, order: str, exclude_bots: bool) -> list[dict]:
        bot = ", {bot: 0}" if exclude_bots else ""
        return gql(
            f"rumPageloadEventsAdaptiveGroups("
            f"filter: {{AND: [{period}{bot}]}}, limit: {limit}, orderBy: [{order}]) "
            f"{{ count sum {{ visits }} dimensions {{ {dims} }} }}"
        )

    def fetch(dims: str, limit: int, order: str) -> tuple[list[dict], bool]:
        try:
            return groups_query(dims, limit, order, exclude_bots=True), True
        except RuntimeError:
            return groups_query(dims, limit, order, exclude_bots=False), False

    daily, bots_excluded = fetch("date", 100, "date_ASC")
    if not bots_excluded:
        print("  （注: bot除外フィルタが使えなかったためボット込みの数字）")
    pv = sum(g["count"] for g in daily)
    visits = sum(g["sum"]["visits"] for g in daily)
    print(f"  合計: 訪問 {visits} / PV {pv}")
    for g in daily:
        print(f"    {g['dimensions']['date']}: 訪問 {g['sum']['visits']} / PV {g['count']}")

    for label, dim in [("上位リファラー", "refererHost"), ("上位パス", "requestPath")]:
        groups, _ = fetch(dim, 10, "sum_visits_DESC")
        print(f"  {label}（訪問数）:")
        for g in groups:
            key = g["dimensions"][dim] or "（ダイレクト）"
            print(f"    {key}: {g['sum']['visits']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="mishumap.com アクセス状況レポート")
    parser.add_argument("--days", type=int, default=7, help="集計日数（デフォルト7）")
    args = parser.parse_args()

    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=args.days)

    print(f"# mishumap.com アクセスレポート（過去{args.days}日）")
    try:
        report_cloudflare(start, end)
    except Exception as e:
        print(f"  Cloudflare 取得失敗: {e}", file=sys.stderr)
    try:
        report_gsc(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    except Exception as e:
        print(f"  Search Console 取得失敗: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
