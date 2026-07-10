import L from "leaflet";
import { awardLabel, awardShort, awardStyle } from "./awards";
import { distanceMeters, effectiveAward, walkMinutes, WALK_METERS_PER_MINUTE } from "./filters";
import { fmt, t } from "./i18n";
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

function priceYen(price: string): string {
  if (!price || price.toLowerCase() === "none") return "";
  return price.replaceAll("$", "¥");
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
  if (f.origin) {
    const m = distanceMeters(f.origin, r);
    parts.push(
      `<p class="popup-walk">${fmt(t("popupWalk"), { min: walkMinutes(m), m: Math.round(m) })}</p>`,
    );
  }
  const links: string[] = [];
  const guideUrl = safeUrl(r.url);
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
    parts.push(
      `<details class="popup-desc"><summary>${escapeHtml(t("popupDesc"))}</summary><p>${escapeHtml(r.description)}</p></details>`,
    );
  }
  parts.push(`</article>`);
  return parts.join("");
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
        marker.bindPopup(() => buildPopupHtml(r, f, years, categoryLabelOf(r.category), areaLabelOf(r.area)), {
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
  set(origin: Origin, minutes: number | null): void;
  clear(): void;
}

export function createOriginLayer(map: L.Map): OriginLayer {
  let dot: L.CircleMarker | null = null;
  let radius: L.Circle | null = null;

  return {
    set(origin: Origin, minutes: number | null): void {
      this.clear();
      dot = L.circleMarker([origin.lat, origin.lng], {
        radius: 7,
        color: "#fff",
        weight: 2.5,
        fillColor: "#1a6fb8",
        fillOpacity: 1,
      }).addTo(map);
      dot.bindTooltip("現在地", { direction: "top" });
      if (minutes !== null) {
        radius = L.circle([origin.lat, origin.lng], {
          radius: minutes * WALK_METERS_PER_MINUTE,
          color: "#1a6fb8",
          weight: 1.5,
          dashArray: "6 6",
          fillColor: "#1a6fb8",
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(map);
        map.fitBounds(radius.getBounds(), { padding: [30, 30] });
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
