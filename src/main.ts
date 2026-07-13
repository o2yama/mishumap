import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./style.css";
import { AWARD_STYLES, awardLabel, awardShort, awardStyle } from "./awards";
import { cuisineAliasText } from "./cuisineAliases";
import { applyFilters, distanceMeters, effectiveAward, walkMinutes } from "./filters";
import { fmt, getLang, setLang, t, type Lang, type StringKey } from "./i18n";
import { addMyLocationControl, createMap, createMarkerLayer, createOriginLayer } from "./map";
import { loadSavedSearch, saveSearch } from "./persist";
import { initTranslator } from "./translate";
import type { AppData, FilterState, Origin, Restaurant } from "./types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

/** 区分チップの表示順（格の高い順、ビブグルマンは末尾） */
const AWARD_CHIP_ORDER = ["3 Stars", "2 Stars", "1 Star", "Selected Restaurants", "Bib Gourmand"];
const AREA_ORDER = ["Tokyo", "Kyoto", "Osaka", "Nara"];
const WALK_CHOICES = [5, 10, 15, 20, 30, 60];
const DEFAULT_WALK = 15;
/** 自動現在地取得で徒歩フィルタを既定適用する条件: 最寄りの掲載店がこの距離以内（＝掲載エリア内とみなす） */
const COVERAGE_RADIUS_M = 10_000;
/** GeolocationPositionError.code → 表示文言 */
const GEO_ERROR_KEYS: Record<number, StringKey> = {
  1: "locateDenied",
  2: "locateUnavailable",
  3: "locateTimeout",
};

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

  // URLパラメータで初期フィルタを指定できる（SEO一覧ページ→地図の導線用）
  // 例: /ja/?area=tokyo&awards=bib-gourmand
  const AWARD_SLUGS: Record<string, string> = {
    "bib-gourmand": "Bib Gourmand",
    "3-stars": "3 Stars",
    "2-stars": "2 Stars",
    "1-star": "1 Star",
    selected: "Selected Restaurants",
  };
  const AWARD_SLUG_BY_ID: Record<string, string> = Object.fromEntries(
    Object.entries(AWARD_SLUGS).map(([slug, id]) => [id, slug]),
  );
  const params = new URLSearchParams(location.search);
  const paramAwards = (params.get("awards") ?? "")
    .split(",")
    .map((s) => AWARD_SLUGS[s.trim()])
    .filter(Boolean);
  const paramArea = data.areas.find((a) => a.id.toLowerCase() === (params.get("area") ?? "").toLowerCase())?.id;
  const paramCategories = (params.get("cat") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((c) => data.categories.some((k) => k.id === c));
  const paramYear = data.years.includes(Number(params.get("year"))) ? Number(params.get("year")) : undefined;
  const paramQuery = params.get("q") ?? undefined;

  // 検索状態は apply() のたびに replaceState でURLへ書き戻す（共有・ブラウザバック用）。
  // そのURLをリロードするとパラメータ付きで開くことになるため、SEO一覧ページからの流入と
  // 見分けがつかなくなる。history.state はリロードしても残るので、これを自作URLの目印にする
  const selfWritten = (history.state as { mishu?: boolean } | null)?.mishu === true;
  /** SEO一覧ページ等、外部リンクからのフィルタ指定付き流入 */
  const paramEntry =
    !selfWritten &&
    (Boolean(paramArea) || paramAwards.length > 0 || paramCategories.length > 0 || paramYear !== undefined || Boolean(paramQuery));

  // 前回の検索状態を復元する。ただしフィルタ指定付き流入ではリンクが示す一覧をそのまま見せるべき
  // なので、保存状態（検索語や区分の絞り込み）は一切適用しない。
  // 保存データは古い・壊れている可能性があるので、現在のデータに存在する値だけ通す
  const saved = paramEntry ? null : loadSavedSearch();
  const knownAwards = new Set(Object.keys(AWARD_STYLES));
  const savedAwards = saved?.awards?.filter((a) => knownAwards.has(a));
  const savedCategories = saved?.categories?.filter((c) => data.categories.some((k) => k.id === c));
  const savedArea = data.areas.some((a) => a.id === saved?.area) ? saved?.area : undefined;
  const savedYear =
    typeof saved?.year === "number" && data.years.includes(saved.year) ? saved.year : undefined;
  /** 前回の徒歩距離。undefined=未使用（デフォルト15分を適用）、null=「距離指定なし」を選んでいた */
  const savedWalk =
    saved && "walkMinutes" in saved && (saved.walkMinutes === null || WALK_CHOICES.includes(saved.walkMinutes as number))
      ? (saved.walkMinutes as number | null)
      : undefined;
  const initialWalk: number | null = savedWalk === undefined ? DEFAULT_WALK : savedWalk;

  const state: FilterState = {
    awards: new Set(paramAwards.length ? paramAwards : (savedAwards ?? ["3 Stars", "2 Stars", "1 Star"])),
    year: paramYear ?? savedYear ?? data.latestYear,
    area: paramArea ?? savedArea ?? "",
    categories: new Set(
      paramCategories.length ? paramCategories : (savedCategories ?? data.categories.map((c) => c.id)),
    ),
    query: paramQuery ?? (typeof saved?.query === "string" ? saved.query : ""),
    origin: null,
    walkMinutes: null,
    includePast: paramEntry ? params.get("past") === "1" : saved?.includePast === true,
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
  const allAreasBtn = makeChip(() => t("allAreas"), "#8f1622", state.area === "", () => selectArea(""));
  areaChips.appendChild(allAreasBtn);
  areaButtons.set("", allAreasBtn);
  for (const areaId of orderedAreas) {
    const btn = makeChip(() => areaLabel(areaId), "#8f1622", areaId === state.area, () => selectArea(areaId));
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
      makeChip(() => categoryLabel(cat.id), "#6d6152", state.categories.has(cat.id), (on) => {
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
  pastToggle.checked = state.includePast;
  pastHint.classList.toggle("hidden", !state.includePast);
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
    // 選択状態はstateから復元する（言語切替による再構築で「距離指定なし」を潰さない）。
    // 現在地未取得の間は前回セッションの徒歩距離（なければ15分）をプリセットする
    const current =
      state.walkMinutes !== null
        ? String(state.walkMinutes)
        : state.origin || initialWalk === null
          ? ""
          : String(initialWalk);
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

  /** 直近で取得できた位置。フィルタ解除後も位置ドットを出し続けるために保持する */
  let lastFix: Origin | null = null;

  function clearOrigin(): void {
    state.origin = null;
    state.walkMinutes = null;
    // 解除するのは絞り込み・並び替えだけで、位置ドットは出したままにする
    lastFix ? originLayer.set(lastFix, null, false) : originLayer.clear();
    walkSelect.disabled = true;
    renderLocateBtn();
    setStatus(null);
    apply();
  }

  function requestLocation(auto = false): void {
    if (!("geolocation" in navigator)) {
      if (!auto) setStatus("locateUnsupported", true);
      return;
    }
    locateBtn.disabled = true;
    if (!auto) setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastFix = origin;
        if (auto) {
          // フィルタ指定付き流入時と、掲載店が近くに無い場所（対象4都市の圏外）では
          // 徒歩フィルタや視点移動はせず、位置ドットの表示だけにとどめる
          const inArea = data.restaurants.some((r) => distanceMeters(origin, r) <= COVERAGE_RADIUS_M);
          if (paramEntry || !inArea) {
            originLayer.set(origin, null, false);
            return;
          }
        }
        state.origin = origin;
        walkSelect.disabled = false;
        if (auto) {
          // 前回セッションで使っていた徒歩距離（なければデフォルト15分）を適用する
          state.walkMinutes = initialWalk;
          walkSelect.value = initialWalk === null ? "" : String(initialWalk);
        } else {
          state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : null;
        }
        originLayer.set(state.origin, state.walkMinutes);
        renderLocateBtn();
        setStatus("locateSorted");
        apply();
      },
      (err) => {
        locateBtn.disabled = false;
        // ユーザー操作起点でない失敗（許可拒否等）は通知しない
        if (auto) return;
        setStatus(GEO_ERROR_KEYS[err.code] ?? "locateFailed", true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  locateBtn.addEventListener("click", () => {
    state.origin ? clearOrigin() : requestLocation();
  });

  // ---- 現在地へ移動ボタン（マップ右下・Googleマップ風） ----
  const myLocationBtn = addMyLocationControl(map, flyToMyLocation);
  labelUpdaters.push(() => {
    myLocationBtn.title = t("myLocation");
    myLocationBtn.setAttribute("aria-label", t("myLocation"));
  });

  function flyToMyLocation(): void {
    if (!("geolocation" in navigator)) {
      setStatus("locateUnsupported", true);
      return;
    }
    myLocationBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        myLocationBtn.disabled = false;
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastFix = origin;
        if (state.origin) {
          // 絞り込み中なら距離の基準点も最新位置へ更新する
          state.origin = origin;
          originLayer.set(origin, state.walkMinutes, false);
          apply();
        } else {
          originLayer.set(origin, null, false);
        }
        map.stop();
        map.flyTo([origin.lat, origin.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      },
      (err) => {
        myLocationBtn.disabled = false;
        setStatus(GEO_ERROR_KEYS[err.code] ?? "locateFailed", true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  walkSelect.addEventListener("change", () => {
    state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : null;
    if (state.origin) {
      originLayer.set(state.origin, state.walkMinutes);
      apply();
    }
  });

  // ---- 店名検索 ----
  const queryInput = $<HTMLInputElement>("query-input");
  queryInput.value = state.query;
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

  // ---- 共有 ----
  const shareBtn = $("share-btn") as HTMLButtonElement;
  shareBtn.addEventListener("click", async () => {
    const url = location.href;
    if (navigator.share) {
      // シェアシートを閉じただけの場合も例外になるため、失敗は無視してよい
      await navigator.share({ title: document.title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = t("shareCopied");
      shareBtn.disabled = true;
      setTimeout(() => {
        shareBtn.textContent = t("share");
        shareBtn.disabled = false;
      }, 1600);
    } catch {
      window.prompt(t("share"), url); // クリップボードAPIが使えない環境向けの最後の手段
    }
  });

  // ---- 反映 ----
  let lastFiltered: Restaurant[] = [];

  /**
   * 現在の検索条件をURLに書き戻す。「渋谷のビブグルマン」のような検索結果を
   * そのままシェアでき、ブラウザバックも効くようにするため。
   * 既定値と同じ項目は書かず、共有されるURLを短く保つ
   */
  function syncUrl(): void {
    const p = new URLSearchParams();
    if (state.area) p.set("area", state.area.toLowerCase());
    if (state.awards.size !== Object.keys(AWARD_SLUGS).length) {
      p.set(
        "awards",
        [...state.awards].map((a) => AWARD_SLUG_BY_ID[a]).filter(Boolean).join(","),
      );
    }
    if (state.categories.size !== data.categories.length) p.set("cat", [...state.categories].join(","));
    if (state.year !== data.latestYear) p.set("year", String(state.year));
    if (state.query) p.set("q", state.query);
    if (state.includePast) p.set("past", "1");
    const qs = p.toString();
    history.replaceState({ mishu: true }, "", qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  function apply(): void {
    lastFiltered = applyFilters(data.restaurants, state);
    markerLayer.rebuild(lastFiltered, state);
    renderList(lastFiltered);
    saveSearch(state); // 次回起動時に同じ検索状態から再開できるようにする
    syncUrl();
  }

  function fitToResults(animate = true): void {
    if (lastFiltered.length === 0) return;
    const first: L.LatLngTuple = [lastFiltered[0].lat, lastFiltered[0].lng];
    const bounds = lastFiltered.reduce((b, r) => b.extend([r.lat, r.lng]), L.latLngBounds(first, first));
    map.fitBounds(bounds, { padding: [40, 40], animate });
  }

  renderLanguage();
  apply();
  // 初期表示は非アニメーションで即座に確定させる。アニメーション中だと直後の自動現在地取得の
  // fitBoundsがLeafletに無視され、現在地へズームしないため
  fitToResults(false);
  $("loading").classList.add("done");

  // デフォルトで現在地を取得する。フィルタ指定付き流入では指定エリアを見に来ているので、
  // 許可ダイアログは出さず、すでに許可済みのときだけ位置ドットを表示する
  if (!paramEntry) {
    requestLocation(true);
  } else if ("permissions" in navigator) {
    navigator.permissions
      .query({ name: "geolocation" })
      .then((st) => {
        if (st.state === "granted") requestLocation(true);
      })
      .catch(() => {});
  }
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById("loading");
  if (loading) {
    loading.innerHTML = `<p>${t("loadFailed")}<br><small></small></p>`;
    loading.querySelector("small")!.textContent = String(err);
  }
});
