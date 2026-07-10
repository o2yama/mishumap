#!/usr/bin/env python3
"""日本のミシュラン掲載店データを取得し public/data/restaurants.json を生成する。

データソース（いずれも ngshiheng/michelin-my-maps, MIT License）:
- 最新スナップショットCSV（GitHub raw）: 現在掲載中の店の座標・住所・説明文のマスタ
- 作者公開の Datasette API: 年次受賞履歴（Wayback Machine 復元ベース、古い年ほど欠損あり）

Datasette は1リクエスト最大1000行なので、年→区分の順で分割して取得する。
デフォルトでは常にAPIから再取得する（データ更新漏れ防止）。開発時の反復には
--use-cache を付けると tmp/cache/ のキャッシュを使う。
"""

import csv
import hashlib
import io
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "tmp" / "cache"
OUT_PATH = ROOT / "public" / "data" / "restaurants.json"
CATEGORY_PATH = ROOT / "data" / "cuisine_categories.json"

CSV_URL = "https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv"
DATASETTE = "https://michelindb.jerrynsh.com/michelin"
USER_AGENT = "bib-gourmand-map/1.0 (personal project; data via ngshiheng/michelin-my-maps)"

YEARS = list(range(2020, 2027))
LATEST_YEAR = max(YEARS)
DISTINCTIONS = ["3 Stars", "2 Stars", "1 Star", "Bib Gourmand", "Selected Restaurants"]
ROW_CAP = 1000  # Datasette の max_returned_rows

AREA_LABELS = {"Tokyo": "東京", "Osaka": "大阪", "Kyoto": "京都", "Nara": "奈良"}
# 公式サイトの所在地表記は市単位のため、大阪府内の別市はエリアとしては大阪に統合する
AREA_MERGE = {"Suita": "Osaka"}

USE_CACHE = "--use-cache" in sys.argv


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.read()
    except Exception:
        # UA起因の403やネットワーク系エラーは curl にフォールバック（curl側の失敗はここで例外になる）
        return subprocess.run(
            ["curl", "-sL", "--fail", url], capture_output=True, check=True
        ).stdout


def cached_get(url: str) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE_DIR / f"{key}.bin"
    if USE_CACHE and path.exists():
        return path.read_bytes()
    data = http_get(url)
    path.write_bytes(data)
    time.sleep(0.5)  # 公開インスタンスへの配慮
    return data


def query(canned: str, **params) -> list[dict]:
    qs = urllib.parse.urlencode(
        {**{k: v for k, v in params.items() if v is not None},
         "limit": 50000, "_shape": "array"}
    )
    return json.loads(cached_get(f"{DATASETTE}/{canned}.json?{qs}"))


def query_chunked(canned: str, **params) -> list[dict]:
    """1000行キャップに当たったら区分別に分割して取り直す。"""
    rows = query(canned, **params)
    if len(rows) < ROW_CAP:
        return rows
    rows = []
    for d in DISTINCTIONS:
        chunk = query(canned, **params, distinction=d)
        if len(chunk) >= ROW_CAP:
            raise RuntimeError(f"{canned} {params} distinction={d} が{ROW_CAP}行キャップ超過。さらに細かい分割が必要")
        rows += chunk
    return rows


def norm_key(name: str, location: str) -> tuple[str, str]:
    name = unicodedata.normalize("NFKC", name)
    return (re.sub(r"\s+", " ", name).strip().lower(), location.strip().lower())


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKC", name).strip().lower()
    s = re.sub(r"[^a-z0-9぀-ヿ一-鿿]+", "-", s).strip("-")
    return s or "restaurant"


def main() -> None:
    cat_conf = json.loads(CATEGORY_PATH.read_text())
    cuisine_map: dict[str, str] = cat_conf["map"]
    unmapped: set[str] = set()

    def categorize(cuisine: str) -> str:
        for part in cuisine.split(","):
            part = part.strip()
            if part in cuisine_map:
                return cuisine_map[part]
        if cuisine.strip():
            unmapped.add(cuisine)
        return "other"

    # --- 1. 最新スナップショットCSV（現在掲載中の店のマスタ）---
    print("fetching latest CSV ...")
    csv_rows = list(csv.DictReader(io.StringIO(cached_get(CSV_URL).decode("utf-8"))))
    japan_csv = [r for r in csv_rows if r["Location"].endswith(", Japan")]
    print(f"  CSV total={len(csv_rows)} japan={len(japan_csv)}")

    # --- 2. 年次履歴（Datasette award_timeline）---
    timeline: list[dict] = []
    for y in YEARS:
        rows = query_chunked("award_timeline", location="japan", start_year=y, end_year=y)
        print(f"  timeline {y}: {len(rows)} rows")
        timeline += rows

    # --- 3. 結合 ---
    # 同名同都市の別店舗が実在する（例: 東京の Ishibashi 2軒）ため、キーごとにリストで保持する
    csv_index: dict[tuple, list[dict]] = {}
    for r in japan_csv:
        key = norm_key(r["Name"], r["Location"])
        area = r["Location"].split(",")[0].strip()
        csv_index.setdefault(key, []).append({
            "name": r["Name"],
            "area": area,
            "address": r["Address"],
            "lat": float(r["Latitude"]) if r["Latitude"] else None,
            "lng": float(r["Longitude"]) if r["Longitude"] else None,
            "cuisine": r["Cuisine"],
            "category": categorize(r["Cuisine"]),
            "price": r["Price"],
            "url": r["Url"],
            "website": r["WebsiteUrl"],
            "phone": r["PhoneNumber"],
            "description": r["Description"],
            "greenStar": r["GreenStar"] == "1",
            "inGuide": True,          # 最新スナップショットに存在 = 現行ガイド掲載
            "currentAward": r["Award"],
            "awards": {},
        })

    matched, ambiguous, history_only = 0, 0, {}
    for row in timeline:
        key = norm_key(row["name"], row["location"])
        candidates = csv_index.get(key)
        if candidates and len(candidates) == 1:
            matched += 1
            candidates[0]["awards"][str(row["year"])] = row["distinction"]
        elif candidates:
            ambiguous += 1  # 同名複数店は履歴の帰属先を特定できないため紐付けない
        else:
            entry = history_only.setdefault(key, {
                "name": row["name"],
                "area": row["location"].split(",")[0].strip(),
                "address": "",
                "lat": None, "lng": None,
                "cuisine": row["cuisine"] or "",
                "category": categorize(row["cuisine"] or ""),
                "price": row["price"] or "",
                "url": "",
                "website": "", "phone": "", "description": "",
                "greenStar": False,
                "inGuide": False,     # 最新版に見当たらない（閉店 or 掲載外れ or 名寄せ失敗）
                "currentAward": None,
                "awards": {},
            })
            entry["awards"][str(row["year"])] = row["distinction"]
            # wayback URL しかない年もあるため、guide.michelin.com URL を優先して拾う
            url = row.get("url") or ""
            m = re.search(r"(https://guide\.michelin\.com/\S+)", url)
            if m and not entry["url"]:
                entry["url"] = m.group(1)

    # --- 4. 履歴のみの店（最新CSVにない店）へ座標を補完（restaurant_finder）---
    if history_only:
        print(f"  history-only restaurants: {len(history_only)} → 座標を restaurant_finder から補完")
        finder_index: dict[tuple, dict] = {}
        for loc in sorted({e["area"] for e in history_only.values()}):
            rows = query_chunked("restaurant_finder", location=f"{loc}, Japan")
            for fr in rows:
                finder_index.setdefault(norm_key(fr["name"], fr["location"]), fr)
        coords_found = 0
        for key, entry in history_only.items():
            fr = finder_index.get(key)
            if fr and fr.get("latitude") and fr.get("longitude"):
                entry["lat"] = float(fr["latitude"])
                entry["lng"] = float(fr["longitude"])
                entry["url"] = entry["url"] or fr.get("url") or ""
                entry["website"] = fr.get("website_url") or ""
                entry["phone"] = fr.get("phone_number") or ""
                coords_found += 1
        print(f"  coords resolved: {coords_found}/{len(history_only)}")

    all_entries: list[dict] = [e for entries in csv_index.values() for e in entries]
    all_entries += list(history_only.values())

    # エリア統合（座標解決は生の所在地で終えているため、ここで付け替えても安全）
    for entry in all_entries:
        entry["area"] = AREA_MERGE.get(entry["area"], entry["area"])

    # --- 5. 最新版掲載店には最新年の受賞として現行区分を補完 ---
    # (timeline は取得時期の関係で最新年に欠けがあるため。CSV=現行ガイドの断面とみなす)
    filled_latest = 0
    for entry in all_entries:
        if entry["inGuide"] and str(LATEST_YEAR) not in entry["awards"]:
            entry["awards"][str(LATEST_YEAR)] = entry["currentAward"]
            filled_latest += 1
    print(f"  filled latest-year award from CSV: {filled_latest}")

    # currentAward が無い履歴のみの店は、履歴の最新年の区分を current 扱いにする
    for entry in all_entries:
        if not entry["currentAward"] and entry["awards"]:
            entry["currentAward"] = entry["awards"][max(entry["awards"], key=int)]

    # --- 6. 出力 ---
    dropped_no_coords = [e["name"] for e in all_entries if e["lat"] is None]
    items = sorted(
        (e for e in all_entries if e["lat"] is not None),
        key=lambda e: (e["area"], e["name"]),
    )
    seen_ids: set[str] = set()
    for e in items:
        base = slugify(f"{e['area']}-{e['name']}")
        eid, n = base, 2
        while eid in seen_ids:
            eid, n = f"{base}-{n}", n + 1
        seen_ids.add(eid)
        e["id"] = eid

    areas = sorted({e["area"] for e in items})
    out = {
        "generatedAt": date.today().isoformat(),
        "source": "ngshiheng/michelin-my-maps (MIT) — https://github.com/ngshiheng/michelin-my-maps",
        "note": f"年次履歴はWayback Machine復元ベースのため{LATEST_YEAR}年以外は欠損あり",
        "years": YEARS,
        "latestYear": LATEST_YEAR,
        "areas": [{"id": a, "label": AREA_LABELS.get(a, a)} for a in areas],
        "categories": cat_conf["categories"],
        "restaurants": items,
    }
    # javascript: 等の混入対策。リンク系フィールドは http/https のみ通す
    for e in items:
        for field in ("url", "website"):
            if e[field] and not e[field].startswith(("https://", "http://")):
                e[field] = ""

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))

    # --- 7. 統計レポート ---
    print(f"\nwrote {OUT_PATH} ({OUT_PATH.stat().st_size // 1024} KB)")
    print(f"  restaurants: {len(items)} (inGuide={sum(e['inGuide'] for e in items)}, history-only={sum(not e['inGuide'] for e in items)})")
    print(f"  ambiguous timeline rows (同名複数店のため未紐付け): {ambiguous}")
    if dropped_no_coords:
        print(f"  DROPPED (座標なし): {len(dropped_no_coords)} 件 → {dropped_no_coords[:10]}")
    if unmapped:
        print(f"  WARNING 未分類ジャンル → data/cuisine_categories.json に追記を: {sorted(unmapped)}")
    per_year = {y: sum(1 for e in items if str(y) in e["awards"]) for y in YEARS}
    print(f"  per-year coverage: {per_year}")


if __name__ == "__main__":
    main()
