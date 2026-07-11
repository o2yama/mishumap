import L from "leaflet";
import { awardLabel, awardShort, awardStyle } from "./awards";
import { distanceMeters, effectiveAward, walkMinutes, WALK_METERS_PER_MINUTE } from "./filters";
import { fmt, getLang, t } from "./i18n";
import { translateDescription, translatorAvailable } from "./translate";
import type { FilterState, Origin, Restaurant } from "./types";

const JAPAN_CENTER: L.LatLngTuple = [35.15, 137.0];

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, {
    center: JAPAN_CENTER,
    zoom: 6,
    renderer: L.canvas({ padding: 0.4 }),
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);
  return map;
}

/** マップ右下（ズームボタンの上）に置く、現在地へ移動するボタン。ツールチップ更新用に要素を返す */
export function addMyLocationControl(map: L.Map, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "my-location-btn";
  // 照準アイコン（Googleマップ風のクロスヘア）
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06ZM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"/></svg>';
  const Ctl = L.Control.extend({
    onAdd: () => {
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      btn.addEventListener("click", onClick);
      return btn;
    },
  });
  new Ctl({ position: "bottomright" }).addTo(map);
  return btn;
}

function priceYen(price: string): string {
  if (!price || price.toLowerCase() === "none") return "";
  return price.replaceAll("$", "¥");
}

/**
 * E.164（+81…）を日本の慣習的な表記に整形する。
 * 掲載エリアの市外局番（03/06/075/072/0742系）と携帯・IP・フリーダイヤルをカバーし、
 * 判別できない番号はハイフンなしの国内形式に落とす
 */
export function formatJaPhone(phone: string): string {
  if (!phone.startsWith("+81")) return phone;
  const n = phone.slice(3);
  if (/^(90|80|70|50)/.test(n) && n.length === 10) return `0${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}`;
  if (n.startsWith("120") && n.length === 9) return `0120-${n.slice(3, 6)}-${n.slice(6)}`;
  if (/^[36]/.test(n) && n.length === 9) return `0${n[0]}-${n.slice(1, 5)}-${n.slice(5)}`;
  if (/^7[2357]/.test(n) && n.length === 9) return `0${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
  if (/^74/.test(n) && n.length === 9) return `0${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
  return `0${n}`;
}

/** 外部データ由来のURLは http/https 以外を捨てる（javascript: 等の混入対策） */
function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * 日本語UIではミシュラン公式の日本語ページへ飛ばす。
 * /en/→/jp/ja/ の置換は公式ページの hreflang="ja-jp" 宣言と一致することを確認済み
 */
function localizeGuideUrl(url: string): string {
  if (!url || getLang() !== "ja") return url;
  return url.replace("https://guide.michelin.com/en/", "https://guide.michelin.com/jp/ja/");
}

function historyChips(r: Restaurant, years: number[]): string {
  const chips = years
    .filter((y) => r.awards[String(y)])
    .map((y) => {
      const award = r.awards[String(y)];
      const st = awardStyle(award);
      return `<span class="chip" style="--chip:${st.color}">${y} ${escapeHtml(awardShort(award))}</span>`;
    });
  return chips.join("");
}

export function buildPopupHtml(
  r: Restaurant,
  f: FilterState,
  years: number[],
  categoryLabel: string,
  areaLabel: string,
): string {
  const ea = effectiveAward(r, f);
  const award = ea?.award ?? r.currentAward;
  const st = awardStyle(award);
  const parts: string[] = [`<article class="popup">`];
  parts.push(
    `<div class="popup-badges"><span class="badge" style="--chip:${st.color}">${escapeHtml(awardLabel(award))}</span>` +
      (ea?.isPast ? `<span class="badge badge-muted">${escapeHtml(fmt(t("listedUntil"), { year: ea.year }))}</span>` : "") +
      (r.greenStar ? `<span class="badge badge-green">${escapeHtml(t("greenStar"))}</span>` : "") +
      (!r.inGuide ? `<span class="badge badge-muted">${escapeHtml(t("popupNotInGuideBadge"))}</span>` : "") +
      `</div>`,
  );
  parts.push(`<h3>${escapeHtml(r.name)}</h3>`);
  // 英語UIではカテゴリ名とジャンル名が同語になり得る（Japanese等）ため重複を除く
  const meta = [...new Set([categoryLabel, r.cuisine, priceYen(r.price), areaLabel].filter(Boolean))];
  parts.push(`<p class="popup-meta">${meta.map(escapeHtml).join(" ・ ")}</p>`);
  parts.push(`<div class="popup-history">${historyChips(r, years)}</div>`);
  if (!r.inGuide) {
    parts.push(`<p class="popup-note">${escapeHtml(t("popupNotInGuideNote"))}</p>`);
  }
  if (r.address) parts.push(`<p class="popup-address">${escapeHtml(r.address)}</p>`);
  if (r.phone && /^\+?[\d]+$/.test(r.phone)) {
    parts.push(
      `<p class="popup-phone">📞 <a href="tel:${escapeHtml(r.phone)}">${escapeHtml(formatJaPhone(r.phone))}</a></p>`,
    );
  }
  if (f.origin) {
    const m = distanceMeters(f.origin, r);
    parts.push(
      `<p class="popup-walk">${fmt(t("popupWalk"), { min: walkMinutes(m), m: Math.round(m) })}</p>`,
    );
  }
  const links: string[] = [];
  const guideUrl = localizeGuideUrl(safeUrl(r.url));
  const siteUrl = safeUrl(r.website);
  if (!r.inGuide) {
    // 最新版に掲載のない店はミシュラン公式ページが削除済み（404）のため、Googleマップ検索へ飛ばす
    const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${r.lat},${r.lng},17z`;
    links.push(`<a href="${escapeHtml(gmapsUrl)}" target="_blank" rel="noopener">${escapeHtml(t("popupGmapsLink"))}</a>`);
  } else if (guideUrl) {
    links.push(`<a href="${escapeHtml(guideUrl)}" target="_blank" rel="noopener">${escapeHtml(t("popupGuideLink"))}</a>`);
  }
  if (siteUrl)
    links.push(`<a href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener">${escapeHtml(t("popupSiteLink"))}</a>`);
  if (links.length) parts.push(`<p class="popup-links">${links.join("")}</p>`);
  if (r.description) {
    // 日本語UIかつ対応ブラウザでは、オンデバイス翻訳ボタンを出す
    const translateBtn =
      getLang() === "ja" && translatorAvailable()
        ? `<button type="button" class="translate-btn">${escapeHtml(t("translateBtn"))}</button>`
        : "";
    parts.push(
      `<details class="popup-desc"><summary>${escapeHtml(t("popupDesc"))}</summary><p class="desc-text">${escapeHtml(r.description)}</p>${translateBtn}</details>`,
    );
  }
  parts.push(`</article>`);
  return parts.join("");
}

/**
 * ポップアップDOMを組み立て、翻訳ボタンにハンドラを配線する。
 * Leafletのポップアップはクリックのバブリングを止めるため、
 * document委譲ではなく要素へ直接リスナーを付ける必要がある
 */
export function buildPopupEl(
  r: Restaurant,
  f: FilterState,
  years: number[],
  categoryLabel: string,
  areaLabel: string,
): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = buildPopupHtml(r, f, years, categoryLabel, areaLabel);
  const btn = el.querySelector<HTMLButtonElement>(".translate-btn");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = t("translating");
      try {
        const ja = await translateDescription(r.id, r.description, (pct) => {
          btn.textContent = fmt(t("translateDownloading"), { n: pct });
        });
        const desc = el.querySelector(".desc-text");
        if (desc) desc.textContent = ja;
        const note = document.createElement("small");
        note.className = "translated-note";
        note.textContent = t("translatedNote");
        el.querySelector(".popup-desc")?.appendChild(note);
        btn.remove();
      } catch {
        btn.disabled = false;
        btn.textContent = t("translateFailed");
      }
    });
  }
  return el;
}

export interface MarkerLayer {
  rebuild(restaurants: Restaurant[], f: FilterState): void;
  openFor(id: string): void;
  clear(): void;
}

export function createMarkerLayer(
  map: L.Map,
  years: number[],
  categoryLabelOf: (id: string) => string,
  areaLabelOf: (id: string) => string,
): MarkerLayer {
  const group = L.layerGroup().addTo(map);
  const byId = new Map<string, L.CircleMarker>();

  return {
    rebuild(restaurants: Restaurant[], f: FilterState): void {
      group.clearLayers();
      byId.clear();
      // 重要度の高い区分（星付き）を後から描いて上に載せる。過去掲載は最背面
      const ordered = [...restaurants].sort((a, b) => {
        const ea = effectiveAward(a, f);
        const eb = effectiveAward(b, f);
        const pa = ea?.isPast ? -10 : 0;
        const pb = eb?.isPast ? -10 : 0;
        return pa + awardStyle(ea?.award).zIndex - (pb + awardStyle(eb?.award).zIndex);
      });
      for (const r of ordered) {
        const ea = effectiveAward(r, f);
        const st = awardStyle(ea?.award);
        const marker = L.circleMarker([r.lat, r.lng], {
          radius: st.radius,
          color: "#faf6ec",
          weight: 1.5,
          fillColor: st.color,
          // 過去掲載は淡く描いて現行掲載と区別する
          fillOpacity: ea?.isPast ? 0.32 : 0.92,
        });
        marker.bindPopup(() => buildPopupEl(r, f, years, categoryLabelOf(r.category), areaLabelOf(r.area)), {
          maxWidth: 320,
          className: "guide-popup",
        });
        marker.addTo(group);
        byId.set(r.id, marker);
      }
    },
    openFor(id: string): void {
      const marker = byId.get(id);
      if (!marker) return;
      const target = marker.getLatLng();
      map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 });
      marker.openPopup();
    },
    clear(): void {
      group.clearLayers();
      byId.clear();
    },
  };
}

export interface OriginLayer {
  /** moveMap=false なら位置ドットの描画だけ行い、視点は動かさない */
  set(origin: Origin, minutes: number | null, moveMap?: boolean): void;
  clear(): void;
}

export function createOriginLayer(map: L.Map): OriginLayer {
  let dot: L.CircleMarker | null = null;
  let radius: L.Circle | null = null;

  return {
    set(origin: Origin, minutes: number | null, moveMap = true): void {
      this.clear();
      dot = L.circleMarker([origin.lat, origin.lng], {
        radius: 7,
        color: "#fff",
        weight: 2.5,
        fillColor: "#1a6fb8",
        fillOpacity: 1,
      }).addTo(map);
      dot.bindTooltip("現在地", { direction: "top" });
      if (!moveMap) return;
      map.stop(); // 初期表示のfitBoundsアニメーション中でも現在地への移動を優先する
      if (minutes !== null) {
        const meters = minutes * WALK_METERS_PER_MINUTE;
        radius = L.circle([origin.lat, origin.lng], {
          radius: meters,
          color: "#1a6fb8",
          weight: 1.5,
          dashArray: "6 6",
          fillColor: "#1a6fb8",
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(map);
        // Circle.getBounds()はピクセル座標依存で、ズームアニメーション中は古い座標系で
        // 計算され得るため、地理座標から直接算出する
        map.fitBounds(L.latLng(origin.lat, origin.lng).toBounds(meters * 2), { padding: [30, 30] });
      } else {
        map.flyTo([origin.lat, origin.lng], Math.max(map.getZoom(), 14));
      }
    },
    clear(): void {
      dot?.remove();
      radius?.remove();
      dot = null;
      radius = null;
    },
  };
}
