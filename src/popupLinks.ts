import type { Restaurant } from "./types";

export type PopupLinkKind = "guide" | "gmaps" | "site";

export interface PopupLinkTarget {
  kind: PopupLinkKind;
  url: string;
}

/** 掲載状態に応じたポップアップの外部リンクを表示順どおりに返す */
export function popupLinkTargets(
  r: Pick<Restaurant, "name" | "lat" | "lng" | "inGuide">,
  guideUrl: string,
  siteUrl: string,
): PopupLinkTarget[] {
  const links: PopupLinkTarget[] = [];
  if (r.inGuide && guideUrl) links.push({ kind: "guide", url: guideUrl });

  links.push({
    kind: "gmaps",
    url: `https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${r.lat},${r.lng},17z`,
  });

  if (siteUrl) links.push({ kind: "site", url: siteUrl });
  return links;
}
