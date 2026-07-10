import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./style.css";
import { AWARD_STYLES, awardLabel, awardShort, awardStyle } from "./awards";
import { cuisineAliasText } from "./cuisineAliases";
import { applyFilters, distanceMeters, effectiveAward, walkMinutes } from "./filters";
import { fmt, getLang, setLang, t, type Lang, type StringKey } from "./i18n";
import { createMap, createMarkerLayer, createOriginLayer } from "./map";
import { initTranslator } from "./translate";
import type { AppData, FilterState, Restaurant } from "./types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

/** 区分チップの表示順（格の高い順、ビブグルマンは末尾） */
const AWARD_CHIP_ORDER = ["3 Stars", "2 Stars", "1 Star", "Selected Restaurants", "Bib Gourmand"];
const AREA_ORDER = ["Tokyo", "Kyoto", "Osaka", "Suita", "Nara"];
const WALK_CHOICES = [5, 10, 15, 20, 30, 60];
const DEFAULT_WALK = 15;

const CATEGORY_KEYS: Record<string, StringKey> = {
  washoku: "catWashoku",
  yoshoku: "catYoshoku",
  chuka: "catChuka",
  ethnic: "catEthnic",
  other: "catOther",
};

async function boot(): Promise<void> {
  // 翻訳APIの対応判定だけ先に走らせておく（ポップアップが開く頃には確定している）
  void initTranslator();
  // /ja/ /en/ どちらのページからでもサイトルートの data/ を指すよう、言語セグメントを剥がして解決する
  const siteRoot = location.pathname.replace(/(ja|en)\/(?:index\.html)?$/, "");
  const res = await fetch(`${siteRoot}data/restaurants.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data: AppData = await res.json();

  const areaJaLabels = new Map(data.areas.map((a) => [a.id, a.label]));
  const categoryJaLabels = new Map(data.categories.map((c) => [c.id, c.label]));

  const categoryLabel = (id: string): string => {
    const key = CATEGORY_KEYS[id];
    return key ? t(key) : (categoryJaLabels.get(id) ?? id);
  };
  // エリアIDは英語地名そのものなので、英語UIではIDを表示する
  const areaLabel = (id: string): string => (getLang() === "ja" ? (areaJaLabels.get(id) ?? id) : id);

  // 店名・住所がローマ字のため、日英両方の語彙を検索テキストに含める
  // （表示言語に関わらず「和食」でも "Western" でもヒットさせる）
  const CATEGORY_EN: Record<string, string> = {
    washoku: "Japanese",
    yoshoku: "Western",
    chuka: "Chinese",
    ethnic: "Asian Ethnic",
    other: "Creative Others",
  };
  for (const r of data.restaurants) {
    r.searchText = [
      r.name,
      r.address,
      r.cuisine,
      cuisineAliasText(r.cuisine),
      categoryJaLabels.get(r.category) ?? "",
      CATEGORY_EN[r.category] ?? "",
      areaJaLabels.get(r.area) ?? "",
      r.area,
    ]
      .join(" ")
      .toLowerCase();
  }

  const state: FilterState = {
    awards: new Set(["3 Stars", "2 Stars", "1 Star"]),
    year: data.latestYear,
    area: "",
    categories: new Set(data.categories.map((c) => c.id)),
    query: "",
    origin: null,
    walkMinutes: null,
    includePast: false,
  };

  const map = createMap($("map"));
  const markerLayer = createMarkerLayer(map, data.years, categoryLabel, areaLabel);
  const originLayer = createOriginLayer(map);

  /** 言語切替時に呼び直すラベル更新処理の登録簿 */
  const labelUpdaters: Array<() => void> = [];

  function makeChip(labelOf: () => string, color: string, initialOn: boolean, onToggle: (on: boolean) => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.style.setProperty("--chip", color);
    btn.classList.toggle("on", initialOn);
    const dot = document.createElement("span");
    dot.className = "dot";
    const text = document.createElement("span");
    btn.append(dot, text);
    const update = () => {
      text.textContent = labelOf();
    };
    update();
    labelUpdaters.push(update);
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("on");
      btn.classList.toggle("on", on);
      onToggle(on);
    });
    return btn;
  }

  // ---- チップ生成 ----
  const awardChips = $("award-chips");
  for (const key of AWARD_CHIP_ORDER) {
    const st = AWARD_STYLES[key];
    if (!st) continue;
    awardChips.appendChild(
      makeChip(() => awardLabel(key), st.color, state.awards.has(key), (on) => {
        on ? state.awards.add(key) : state.awards.delete(key);
        apply();
      }),
    );
  }

  const areaChips = $("area-chips");
  const orderedAreas = [
    ...AREA_ORDER.filter((a) => areaJaLabels.has(a)),
    ...data.areas.map((a) => a.id).filter((a) => !AREA_ORDER.includes(a)),
  ];
  const areaButtons = new Map<string, HTMLButtonElement>();
  const allAreasBtn = makeChip(() => t("allAreas"), "#8f1622", true, () => selectArea(""));
  areaChips.appendChild(allAreasBtn);
  areaButtons.set("", allAreasBtn);
  for (const areaId of orderedAreas) {
    const btn = makeChip(() => areaLabel(areaId), "#8f1622", false, () => selectArea(areaId));
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
      makeChip(() => categoryLabel(cat.id), "#6d6152", true, (on) => {
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
  const renderYear = () => {
    yearDisplay.textContent = `${state.year}${t("yearSuffix")}`;
    yearHint.classList.toggle("hidden", state.year === data.latestYear);
  };
  slider.addEventListener("input", () => {
    state.year = Number(slider.value);
    renderYear();
    apply();
  });

  // ---- 過去掲載トグル ----
  const pastToggle = $<HTMLInputElement>("past-toggle");
  const pastHint = $("past-hint");
  pastToggle.addEventListener("change", () => {
    state.includePast = pastToggle.checked;
    pastHint.classList.toggle("hidden", !state.includePast);
    renderLegend();
    apply();
  });

  // ---- 現在地 ----
  const locateBtn = $<HTMLButtonElement>("locate-btn");
  const walkSelect = $<HTMLSelectElement>("walk-select");
  const locateStatus = $("locate-status");

  let statusKey: StringKey | null = null;
  let statusIsError = false;

  function renderStatus(): void {
    locateStatus.textContent = statusKey ? t(statusKey) : "";
    locateStatus.classList.toggle("hidden", !statusKey);
    locateStatus.classList.toggle("error", statusIsError);
  }

  function setStatus(key: StringKey | null, isError = false): void {
    statusKey = key;
    statusIsError = isError;
    renderStatus();
  }

  function renderWalkOptions(): void {
    // 選択状態はstateから復元する（言語切替による再構築で「距離指定なし」を潰さない）
    const current =
      state.walkMinutes !== null ? String(state.walkMinutes) : state.origin ? "" : String(DEFAULT_WALK);
    walkSelect.replaceChildren(
      new Option(t("walkNone"), ""),
      ...WALK_CHOICES.map((n) => new Option(fmt(t("walkOption"), { n }), String(n))),
    );
    walkSelect.value = current;
  }

  function renderLocateBtn(): void {
    locateBtn.textContent = state.origin ? t("locateClear") : t("locateGet");
    locateBtn.classList.toggle("active", state.origin !== null);
  }

  function clearOrigin(): void {
    state.origin = null;
    state.walkMinutes = null;
    originLayer.clear();
    walkSelect.disabled = true;
    renderLocateBtn();
    setStatus(null);
    apply();
  }

  function requestLocation(): void {
    if (!("geolocation" in navigator)) {
      setStatus("locateUnsupported", true);
      return;
    }
    locateBtn.disabled = true;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        state.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        walkSelect.disabled = false;
        state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : null;
        originLayer.set(state.origin, state.walkMinutes);
        renderLocateBtn();
        setStatus("locateSorted");
        apply();
      },
      (err) => {
        locateBtn.disabled = false;
        const reasons: Record<number, StringKey> = {
          1: "locateDenied",
          2: "locateUnavailable",
          3: "locateTimeout",
        };
        setStatus(reasons[err.code] ?? "locateFailed", true);
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
  function renderLegend(): void {
    legend.innerHTML = AWARD_CHIP_ORDER.map((key) => {
      const st = AWARD_STYLES[key];
      return `<div class="legend-item"><span class="dot" style="background:${st.color}"></span>${awardLabel(key)}</div>`;
    }).join("");
    if (state.includePast) {
      legend.innerHTML += `<div class="legend-item"><span class="dot" style="background:#bb1f2f;opacity:.32"></span>${t("includePastLabel")}</div>`;
    }
  }

  // ---- モバイル ----
  const sidebar = $("sidebar");
  const mobileToggle = $("mobile-toggle");
  function renderMobileToggle(): void {
    mobileToggle.textContent = sidebar.classList.contains("open") ? t("mobileClose") : t("mobileOpen");
  }
  mobileToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    renderMobileToggle();
  });

  // ---- 結果リスト ----
  const resultList = $("result-list");
  const resultCount = $("result-count");

  function renderList(filtered: Restaurant[]): void {
    resultList.replaceChildren();
    resultCount.innerHTML = fmt(t("countOf"), { n: filtered.length, total: data.restaurants.length });
    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t("empty");
      resultList.appendChild(li);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of filtered) {
      const ea = effectiveAward(r, state);
      const st = awardStyle(ea?.award);
      const li = document.createElement("li");
      li.className = ea?.isPast ? "result-item past" : "result-item";
      li.style.setProperty("--award", st.color);

      const nameRow = document.createElement("div");
      nameRow.className = "r-name";
      const badge = document.createElement("span");
      badge.className = "r-award";
      badge.textContent = awardShort(ea?.award);
      const nameEl = document.createElement("span");
      nameEl.textContent = r.name;
      nameRow.append(badge, nameEl);

      const meta = document.createElement("div");
      meta.className = "r-meta";
      const bits = [...new Set([categoryLabel(r.category), r.cuisine, areaLabel(r.area)].filter(Boolean))];
      if (ea?.isPast) bits.push(fmt(t("listedUntil"), { year: ea.year }));
      meta.textContent = bits.join(" ・ ");
      if (state.origin) {
        const walk = document.createElement("span");
        walk.className = "r-walk";
        walk.textContent = ` ${fmt(t("walkApprox"), { n: walkMinutes(distanceMeters(state.origin, r)) })}`;
        meta.appendChild(walk);
      }

      li.append(nameRow, meta);
      li.addEventListener("click", () => {
        markerLayer.openFor(r.id);
        if (window.matchMedia("(max-width: 880px)").matches) {
          sidebar.classList.remove("open");
          renderMobileToggle();
        }
      });
      frag.appendChild(li);
    }
    resultList.appendChild(frag);
  }

  // ---- 言語切替 ----
  const langToggle = $("lang-toggle");
  const langButtons = langToggle.querySelectorAll<HTMLButtonElement>("button[data-lang]");

  function renderLanguage(): void {
    document.title = t("docTitle");
    for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n as StringKey);
    }
    $("credits").innerHTML = t("credits");
    queryInput.placeholder = t("searchPlaceholder");
    for (const btn of langButtons) btn.classList.toggle("on", btn.dataset.lang === getLang());
    for (const update of labelUpdaters) update();
    renderYear();
    renderWalkOptions();
    renderLocateBtn();
    renderStatus();
    renderLegend();
    renderMobileToggle();
  }

  for (const btn of langButtons) {
    btn.addEventListener("click", () => {
      if (btn.dataset.lang === getLang()) return;
      setLang(btn.dataset.lang as Lang);
      renderLanguage();
      apply(); // リスト・マーカーの表示ラベルを現在言語で再構築
    });
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

  renderLanguage();
  apply();
  fitToResults();
  $("loading").classList.add("done");
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById("loading");
  if (loading) {
    loading.innerHTML = `<p>${t("loadFailed")}<br><small></small></p>`;
    loading.querySelector("small")!.textContent = String(err);
  }
});
