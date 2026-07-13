import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./style.css";
import { AWARD_STYLES, awardLabel, awardShort, awardStyle } from "./awards";
import { cuisineAliasText } from "./cuisineAliases";
import { applyFilters, distanceMeters, effectiveAward, walkMinutes } from "./filters";
import { ensureDetails } from "./details";
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
      r.addressJa, // 「銀座」「祇園」など日本語の地名で引けるようにする
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
  const paramYears = (params.get("year") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((y) => data.years.includes(y));
  const paramQuery = params.get("q") ?? undefined;

  // 検索状態は apply() のたびに replaceState でURLへ書き戻す（共有・ブラウザバック用）。
  // そのURLをリロードするとパラメータ付きで開くことになるため、SEO一覧ページからの流入と
  // 見分けがつかなくなる。history.state はリロードしても残るので、これを自作URLの目印にする
  const selfWritten = (history.state as { mishu?: boolean } | null)?.mishu === true;
  /** SEO一覧ページ等、外部リンクからのフィルタ指定付き流入 */
  const paramEntry =
    !selfWritten &&
    (Boolean(paramArea) || paramAwards.length > 0 || paramCategories.length > 0 || paramYears.length > 0 || Boolean(paramQuery));

  // 前回の検索状態を復元する。ただしフィルタ指定付き流入ではリンクが示す一覧をそのまま見せるべき
  // なので、保存状態（検索語や区分の絞り込み）は一切適用しない。
  // 保存データは古い・壊れている可能性があるので、現在のデータに存在する値だけ通す
  const saved = paramEntry ? null : loadSavedSearch();
  const knownAwards = new Set(Object.keys(AWARD_STYLES));
  const savedAwards = saved?.awards?.filter((a) => knownAwards.has(a));
  const savedCategories = saved?.categories?.filter((c) => data.categories.some((k) => k.id === c));
  const savedArea = data.areas.some((a) => a.id === saved?.area) ? saved?.area : undefined;
  // years は複数年対応で追加した形式。旧データ（単一の year）も引き継げるようにする
  const savedYears = (saved?.years ?? (typeof saved?.year === "number" ? [saved.year] : []))
    .filter((y) => data.years.includes(y));

  const state: FilterState = {
    awards: new Set(paramAwards.length ? paramAwards : (savedAwards ?? ["3 Stars", "2 Stars", "1 Star"])),
    years: new Set(paramYears.length ? paramYears : savedYears.length ? savedYears : [data.latestYear]),
    area: paramArea ?? savedArea ?? "",
    categories: new Set(
      paramCategories.length ? paramCategories : (savedCategories ?? data.categories.map((c) => c.id)),
    ),
    query: paramQuery ?? (typeof saved?.query === "string" ? saved.query : ""),
    origin: null,
    walkMinutes: null,
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

  // ---- 年チップ ----
  // 掲載年は他の絞り込みと同じチップで選ぶ。スライダーはトラックが細く親指で掴みにくい上、
  // 隣接年を踏みながら再描画が走るため、飛ばして選べるチップのほうが速い
  const yearChips = $("year-chips");
  const yearHint = $("year-hint");
  // 最新年を先頭に置く。ほとんどのユーザーは最新版しか見ないので探させない
  for (const y of [...data.years].sort((a, b) => b - a)) {
    yearChips.appendChild(
      makeChip(() => `${y}${t("yearSuffix")}`, "#b8860b", state.years.has(y), (on) => {
        on ? state.years.add(y) : state.years.delete(y);
        renderYearHint();
        apply();
      }),
    );
  }
  /** 最新年以外を含むときだけ、年次データの欠損を注記する */
  function renderYearHint(): void {
    const onlyLatest = state.years.size === 1 && state.years.has(data.latestYear);
    yearHint.classList.toggle("hidden", onlyLatest);
  }
  renderYearHint();

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
    // 選択状態はstateから復元する（言語切替による再構築で選択を潰さない）。
    // 現在地未取得の間は空（距離指定なし）にしておく。距離が入っていると、
    // 絞り込まれていないのに絞り込み済みに見えてしまう
    const current = state.walkMinutes !== null ? String(state.walkMinutes) : "";
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
    walkSelect.value = "";
    renderLocateBtn();
    setStatus(null);
    apply();
  }

  /** 現在地の取得は必ずユーザー操作起点。起動時に勝手に許可ダイアログを出さない */
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
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastFix = origin;
        state.origin = origin;
        // 距離を選んでから取得を始めた場合はその値を、ボタンから始めた場合は既定値を使う
        state.walkMinutes = walkSelect.value ? Number(walkSelect.value) : DEFAULT_WALK;
        walkSelect.value = String(state.walkMinutes);
        originLayer.set(state.origin, state.walkMinutes);
        renderLocateBtn();
        setStatus("locateSorted");
        apply();
      },
      (err) => {
        locateBtn.disabled = false;
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
      return;
    }
    // 未取得なら、距離を選んだこと自体を「現在地から探したい」という意思表示として扱う
    if (state.walkMinutes !== null) requestLocation();
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
    if (lastFiltered.some((r) => !r.inGuide)) {
      legend.innerHTML += `<div class="legend-item"><span class="dot" style="background:#bb1f2f;opacity:.32"></span>${t("popupNotInGuideBadge")}</div>`;
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

  function closeSheet(): void {
    if (!sidebar.classList.contains("open")) return;
    sidebar.classList.remove("open");
    renderMobileToggle();
  }
  // SPではシートが画面の大半を覆う。地図に触れた時点で「地図を見たい」という意思なので閉じる。
  // ピンのタップは map の click に乗らないことがあるため、ポップアップが開いたときにも閉じる
  map.on("click", closeSheet);
  map.on("popupopen", closeSheet);

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
      // 最新版に載っていない店は淡く表示して、現行掲載と区別する
      li.className = r.inGuide ? "result-item" : "result-item past";
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
      if (!r.inGuide) bits.push(t("popupNotInGuideBadge"));
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
    // 既定（最新年のみ）と違うときだけ書く。複数年はカンマ区切り
    if (!(state.years.size === 1 && state.years.has(data.latestYear))) {
      p.set("year", [...state.years].sort((a, b) => b - a).join(","));
    }
    if (state.query) p.set("q", state.query);
    const qs = p.toString();
    history.replaceState({ mishu: true }, "", qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  function apply(): void {
    lastFiltered = applyFilters(data.restaurants, state);
    markerLayer.rebuild(lastFiltered, state);
    renderList(lastFiltered);
    renderLegend(); // 凡例の「最新版に掲載なし」は結果に該当店があるときだけ出す
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
  // ピンを描き終えてから紹介文・リンク・電話を裏で取りに行く（初期ロードから外している）
  void ensureDetails(siteRoot, data.restaurants);
  // 初期表示は非アニメーションで即座に確定させる。アニメーション中だと直後の自動現在地取得の
  // fitBoundsがLeafletに無視され、現在地へズームしないため
  fitToResults(false);
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
