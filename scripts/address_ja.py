"""英語表記の住所を日本語表記に変換する。

一次データの住所は英語（例: "3-4-9 Soshigaya, Setagaya-ku, Tokyo, 157-0072, Japan"）で、
日本語UIでも「銀座」「祇園」といった地名で検索できなかった。住所には必ず郵便番号が
入っている（実測1,106/1,106件）ため、日本郵便の郵便番号データで日本語表記に変換する。

ローマ字版（KEN_ALL_ROME）を使うのは、同一郵便番号に複数の町域がぶら下がる場合に、
英語住所側の町域ローマ字と突き合わせて一意に決めるため。

日本郵便: 「郵便番号データに限っては日本郵便株式会社は著作権を主張しません。
自由に配布していただいて結構です。」
https://www.post.japanpost.jp/zipcode/dl/readme.html
"""

import csv
import io
import re
import unicodedata
import zipfile
from collections import defaultdict
from typing import Callable

ROME_ZIP_URL = "https://www.post.japanpost.jp/service/search/zipcode/download/roman/KEN_ALL_ROME.zip"

ZIP_RE = re.compile(r"\b(\d{3})-(\d{4})\b")
BANCHI_RE = re.compile(r"^([\d\-‐−]+)(?:\s|$)")


def _norm(s: str) -> str:
    """ローマ字比較用。空白・記号・アクセントを落として大文字化"""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def build_converter(fetch: Callable[[str], bytes]) -> Callable[[str], str]:
    """英語住所 → 日本語住所 の変換関数を返す。変換できなければ空文字を返す"""
    raw = fetch(ROME_ZIP_URL)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.upper().endswith(".CSV"))
        text = z.read(name).decode("cp932", errors="replace")

    zipmap: dict[str, list[dict]] = defaultdict(list)
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 7:
            continue
        code, pref, city, town, _, _, town_rome = row[:7]
        zipmap[code].append(
            {
                "pref": pref,
                "city": city.replace("　", ""),
                # 「清水町（河原町通夷川下る…」のように閉じ括弧が来ない但し書きもあるため（以降を落とす
                "town": re.sub(r"（.*", "", town).replace("　", ""),
                "town_raw": town,
                "town_rome": re.sub(r"\(.*", "", town_rome),
            }
        )

    def convert(address: str) -> str:
        m = ZIP_RE.search(address or "")
        if not m:
            return ""
        cands = zipmap.get(m.group(1) + m.group(2))
        if not cands:
            return ""

        head = address[: m.start()].rstrip(", ")
        head_n = _norm(head)

        if len(cands) == 1:
            # 郵便番号が町域を一意に決めている。ローマ字の綴り違い（長音の有無等）に依存しない
            chosen = cands[0]
            tr = _norm(chosen["town_rome"])
            matched = tr if tr and tr in head_n else ""
        else:
            chosen, matched = None, ""
            for c in cands:
                tr = _norm(c["town_rome"])
                if tr and tr in head_n and len(tr) > len(matched):
                    chosen, matched = c, tr
            if chosen is None:
                return ""

        # 番地は「数字で始まるセグメント」。町域名だけを頼りにすると、ホテル名に町域名を含む住所
        # （"The Hotel Seiryu Kyoto Kiyomizu, 2-204-2 Kiyomizu, ..."）で誤爆する
        segs = [s.strip() for s in head.split(",")]
        idx = next((i for i, s in enumerate(segs) if BANCHI_RE.match(s)), None)
        if idx is None and matched:
            idx = next((i for i, s in enumerate(segs) if matched in _norm(s)), None)

        banchi, building = "", ""
        if idx is not None:
            num = BANCHI_RE.match(segs[idx])
            if num:
                banchi = num.group(1).replace("‐", "-").replace("−", "-")
            building = ", ".join(segs[:idx])

        town = "" if chosen["town_raw"] == "以下に掲載がない場合" else chosen["town"]
        ja = f"{chosen['pref']}{chosen['city']}{town}{banchi}"
        return f"{ja} {building}" if building else ja

    return convert
