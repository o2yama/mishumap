import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./style.css";
import { AWARD_STYLES, awardStyle } from "./awards";
import { cuisineAliasText } from "./cuisineAliases";
import { applyFilters, awardInYear, distanceMeters, walkMinutes } from "./filters";
import { createMap, createMarkerLayer, createOriginLayer } from "./map";
import type { AppData, FilterState, Restaurant } from "./types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

/** 区分チップの表示順（ビブグルマンが主役） */
const AWARD_CHIP_ORDER = ["Bib Gourmand", "3 Stars", "2 Stars", "1 Star", "Selected Restaurants"];
const AREA_ORDER = ["Tokyo", "Kyoto", "Osaka", "Suita", "Nara"];

async function boot(): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/restaurants.json`);
  if (!res.ok) throw new Error(`データ読み込み失敗: ${res.status}`);
  const data: AppData = await res.json();

  const categoryLabels = new Map(data.categories.map((c) => [c.id, c.label]));
  const areaLabels = new Map(data.areas.map((a) => [a.id, a.label]));

  // 店名・住所がローマ字のため、日本語エイリアス込みの検索テキストを事前構築する
  for (const r of data.restaurants) {
    r.searchText = [
      r.name,
      r.address,
      r.cuisine,
      cuisineAliasText(r.cuisine),
      categoryLabels.get(r.category) ?? "",
      areaLabels.get(r.area) ?? "",
    ]
      .join(" ")
      .toLowerCase();
  }

  const state: FilterState = {
    awards: new Set(["Bib Gourmand"]),
    year: data.latestYear,
    area: "",
    categories: new Set(data.categories.map((c) => c.id)),
    query: "",
    origin: null,
    walkMinutes: null,
  };

  const map = createMap($("map"));
  const markerLayer = createMarkerLayer(
    map,
    data.years,
    (id) => categoryLabels.get(id) ?? id,
    (id) => areaLabels.get(id) ?? id,
  );
  const originLayer = createOriginLayer(map);

  // ---- チップ生成 ----
  const awardChips = $("award-chips");
  for (const key of AWARD_CHIP_ORDER) {
    const st = AWARD_STYLES[key];
    if (!st) continue;
    awardChips.appendChild(
      makeChip(st.label, st.color, state.awards.has(key), (on) => {
        on ? state.awards.add(key) : state.awards.delete(key);
        apply();
      }),
    );
  }

  const areaChips = $("area-chips");
  const orderedAreas = [
    ...AREA_ORDER.filter((a) => areaLabels.has(a)),
    ...data.areas.map((a) => a.id).filter((a) => !AREA_ORDER.includes(a)),
  ];
  const areaButtons = new Map<string, HTMLButtonElement>();
  const allAreasBtn = makeChip("すべて", "#8f1622", true, () => selectArea(""));
  areaChips.appendChild(allAreasBtn);
  areaButtons.set("", allAreasBtn);
  for (const areaId of orderedAreas) {
    const btn = makeChip(areaLabels.get(areaId) ?? areaId, "#8f1622", false, () => selectArea(areaId));
    areaChips.appendChild(btn);
    areaButtons.set(areaId, btn);
  }
  function selectArea(areaId: string): void {
    state.area = areaId;
    for (const [id, btn] of areaButtons) btn.classList.toggle("on", id === areaId);
    apply();
    fitToResults();
  }

  const categoryChips = $("category-chips");
  for (const cat of data.categories) {
    categoryChips.appendChild(
      makeChip(cat.label, "#6d6152", true, (on) => {
        on ? state.categories.add(cat.id) : state.categories.delete(cat.id);
        apply();
      }),
    );
  }

  // ---- 年スライダー ----
  const slider = $<HTMLInputElement>("year-slider");
  const yearDisplay = $("year-display");
  const yearHint = $("year-hint");
  slider.min = String(Math.min(...data.years));
  slider.max = String(Math.max(...data.years));
  slider.value = String(state.year);
  const syncYear = () => {
    state.year = Number(slider.value);
    yearDisplay.textContent = `${state.year}年`;
    yearHint.classList.toggle("hidden", state.year === data.latestYear);
    apply();
  };
  slider.addEventListener("input", syncYear);

  // ---- 現在地 ----
  const locateBtn = $<HTMLButtonElement>("locate-btn");
  const walkSelect = $<HTMLSelectElement>("walk-select");
  const locateStatus = $("locate-status");

  function setStatus(message: string, isError = false): void {
    locateStatus.textContent = message;
    locateStatus.classList.toggle("hidden", !message);
    locateStatus.classList.toggle("error", isError);
  }

  function clearOrigin(): void {
    state.origin = null;
    state.walkMinutes = null;
    originLayer.clear();
    walkSelect.disabled = true;
    locateBtn.classList.remove("active");
    locateBtn.textContent = "📍 現在地を取得";
    setStatus("");
    apply();
  }

  function requestLocation(): void {
    if (!("geolocation" in navigator)) {
      setStatus("この端末では位置情報を利用できません", true);
      return;
    }
    locateBtn.disabled = true;
    setStatus("現在地を取得中…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        locateBtn.classList.add("active");
        locateBtn.textContent = "✕ 現在地を解除";
        state.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        walkSelect.disabled = false;
        state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : null;
        originLayer.set(state.origin, state.walkMinutes);
        setStatus("現在地から近い順に表示しています");
        apply();
      },
      (err) => {
        locateBtn.disabled = false;
        const reasons: Record<number, string> = {
          1: "位置情報の利用が許可されませんでした",
          2: "現在地を特定できませんでした",
          3: "現在地の取得がタイムアウトしました",
        };
        setStatus(reasons[err.code] ?? "現在地を取得できませんでした", true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  locateBtn.addEventListener("click", () => {
    state.origin ? clearOrigin() : requestLocation();
  });

  walkSelect.addEventListener("change", () => {
    state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : null;
    if (state.origin) {
      originLayer.set(state.origin, state.walkMinutes);
      apply();
    }
  });

  // ---- 店名検索 ----
  const queryInput = $<HTMLInputElement>("query-input");
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  queryInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = queryInput.value.trim();
      apply();
    }, 160);
  });

  // ---- 凡例 ----
  const legend = $("legend");
  legend.innerHTML = AWARD_CHIP_ORDER.map((key) => {
    const st = AWARD_STYLES[key];
    return `<div class="legend-item"><span class="dot" style="background:${st.color}"></span>${st.label}</div>`;
  }).join("");

  // ---- モバイル ----
  const sidebar = $("sidebar");
  const mobileToggle = $("mobile-toggle");
  mobileToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    mobileToggle.textContent = open ? "地図に戻る" : "検索・絞り込み";
  });

  // ---- 結果リスト ----
  const resultList = $("result-list");
  const resultCount = $("result-count");

  function renderList(filtered: Restaurant[]): void {
    resultList.replaceChildren();
    resultCount.innerHTML = `<strong>${filtered.length}</strong> 軒 / 全${data.restaurants.length}軒`;
    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "条件に合うお店が見つかりませんでした";
      resultList.appendChild(li);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of filtered) {
      const st = awardStyle(awardInYear(r, state.year));
      const li = document.createElement("li");
      li.className = "result-item";
      li.style.setProperty("--award", st.color);

      const nameRow = document.createElement("div");
      nameRow.className = "r-name";
      const badge = document.createElement("span");
      badge.className = "r-award";
      badge.textContent = st.short;
      const nameEl = document.createElement("span");
      nameEl.textContent = r.name;
      nameRow.append(badge, nameEl);

      const meta = document.createElement("div");
      meta.className = "r-meta";
      const bits = [
        categoryLabels.get(r.category) ?? r.category,
        r.cuisine,
        areaLabels.get(r.area) ?? r.area,
      ].filter(Boolean);
      meta.textContent = bits.join(" ・ ");
      if (state.origin) {
        const walk = document.createElement("span");
        walk.className = "r-walk";
        walk.textContent = ` 徒歩約${walkMinutes(distanceMeters(state.origin, r))}分`;
        meta.appendChild(walk);
      }

      li.append(nameRow, meta);
      li.addEventListener("click", () => {
        markerLayer.openFor(r.id);
        if (window.matchMedia("(max-width: 880px)").matches) {
          sidebar.classList.remove("open");
          mobileToggle.textContent = "検索・絞り込み";
        }
      });
      frag.appendChild(li);
    }
    resultList.appendChild(frag);
  }

  // ---- 反映 ----
  let lastFiltered: Restaurant[] = [];

  function apply(): void {
    lastFiltered = applyFilters(data.restaurants, state);
    markerLayer.rebuild(lastFiltered, state);
    renderList(lastFiltered);
  }

  function fitToResults(): void {
    if (lastFiltered.length === 0) return;
    const first: L.LatLngTuple = [lastFiltered[0].lat, lastFiltered[0].lng];
    const bounds = lastFiltered.reduce((b, r) => b.extend([r.lat, r.lng]), L.latLngBounds(first, first));
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  syncYear();
  fitToResults();
  $("loading").classList.add("done");
}

function makeChip(
  label: string,
  color: string,
  initialOn: boolean,
  onToggle: (on: boolean) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip-btn";
  btn.style.setProperty("--chip", color);
  btn.classList.toggle("on", initialOn);
  const dot = document.createElement("span");
  dot.className = "dot";
  const text = document.createElement("span");
  text.textContent = label;
  btn.append(dot, text);
  btn.addEventListener("click", () => {
    const on = !btn.classList.contains("on");
    btn.classList.toggle("on", on);
    onToggle(on);
  });
  return btn;
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById("loading");
  if (loading) {
    loading.innerHTML = `<p>読み込みに失敗しました。再読み込みしてください。<br><small>${String(err)}</small></p>`;
  }
});
