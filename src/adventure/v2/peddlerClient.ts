// 행상 화면이 쓰는 응답 타입과 문구. 서버 응답 모양은 /api/v2/peddler 와 같다.

import { COOKING_QUALITY_RANK, parseCookingFoodIdFormat, type CookingQuality } from "./cooking/foodShared";
import {
  PEDDLER_DISH_CARGO_PREFIX,
  PEDDLER_ROUTES,
  type PeddlerCargoGroup,
  type PeddlerDispatchHours,
  type PeddlerRouteId,
  type PeddlerRouteUnlock,
  type PeddlerShopItemId,
} from "./peddlerRules";

export type PeddlerDispatchView = {
  hours: PeddlerDispatchHours;
  startedAt: number;
  readyAt: number;
  points: number;
  tokens: number;
};

export type PeddlerRouteView = {
  id: PeddlerRouteId;
  name: string;
  unlocked: boolean;
  rank: number;
  standingPoints: number;
  /** 다음 등급에 필요한 누적 점수. 최고 등급이면 null. */
  nextRankAt: number | null;
  capacity: number;
  preferred: { id: string; name: string }[];
  dispatch: PeddlerDispatchView | null;
};

export type PeddlerCargoView = {
  id: string;
  group: PeddlerCargoGroup;
  name: string;
  /** 개당 적재 점수. */
  points: number;
  held: number;
};

export type PeddlerShopView = {
  id: PeddlerShopItemId;
  name: string;
  tokenCost: number;
  weeklyLimit: number | null;
  purchased: number;
};

export type PeddlerViewData = {
  now: number;
  weekId: string;
  weekEndsAt: string;
  /** 생활 레벨 조건을 채웠는지. */
  unlocked: boolean;
  tokens: number;
  tokenCarry: number;
  totalRank: number;
  routes: PeddlerRouteView[];
  cargo: PeddlerCargoView[];
  shop: PeddlerShopView[];
};

export type PeddlerClaimView = {
  routeId: PeddlerRouteId;
  tokens: number;
  points: number;
  rankBefore: number;
  rankAfter: number;
  titleNames: string[];
};

export type PeddlerPostResult =
  | {
      ok: true;
      view: PeddlerViewData;
      dispatched?: { routeId: PeddlerRouteId; tokens: number; readyAt: number };
      claimed?: PeddlerClaimView;
      bought?: { id: PeddlerShopItemId; name: string; quantity: number };
    }
  | { ok: false; error?: string };

const ERROR_LABELS: Record<string, string> = {
  life_level_required: "생활 하나를 Lv.50까지 올리면 행상을 보낼 수 있습니다.",
  route_locked: "아직 열리지 않은 교역로입니다.",
  route_busy: "이 교역로에는 이미 수레가 나가 있습니다.",
  cargo_too_small: "짐이 너무 적습니다. 적재 점수 200점 이상을 실어 주세요.",
  over_capacity: "적재량을 넘었습니다.",
  not_enough_items: "실을 산물이 부족합니다. 새로고침해 주세요.",
  invalid_cargo: "실을 수 없는 품목이 있습니다. 새로고침해 주세요.",
  no_dispatch: "받을 수레가 없습니다.",
  not_ready: "수레가 아직 돌아오지 않았습니다.",
  not_enough_tokens: "행상 증표가 부족합니다.",
  weekly_limit: "이번 주 교환 한도에 닿았습니다.",
  unknown_item: "교환하지 않는 품목입니다.",
  invalid_quantity: "수량을 다시 확인해 주세요.",
  rate_limited: "요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.",
};

export function peddlerErrorLabel(error: string | undefined): string {
  return (error && ERROR_LABELS[error]) || "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

export function peddlerRouteUnlockText(unlock: PeddlerRouteUnlock): string {
  switch (unlock.kind) {
    case "start":
      return "";
    case "route_rank": {
      const name = PEDDLER_ROUTES.find((route) => route.id === unlock.routeId)!.name;
      return `${name} 교역 ${unlock.rank}등급에 열립니다.`;
    }
    case "total_rank":
      return `교역 등급 합계 ${unlock.rank}에 열립니다.`;
  }
}

/** 도착까지 남은 시간. 도착했으면 빈 문자열. */
export function peddlerRemainingLabel(readyAt: number, now: number): string {
  const ms = readyAt - now;
  if (ms <= 0) return "";
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}시간 ${minutes % 60}분 남음` : `${minutes}분 남음`;
}

/** 고른 짐의 적재 점수 합계와 그중 우대 품목 점수. */
export function peddlerSelectionTotals(
  cargo: readonly PeddlerCargoView[],
  selection: Readonly<Record<string, number>>,
  preferredIds: readonly string[],
): { points: number; preferredPoints: number; kinds: number } {
  let points = 0;
  let preferredPoints = 0;
  let kinds = 0;
  for (const item of cargo) {
    const quantity = Math.min(item.held, selection[item.id] ?? 0);
    if (quantity <= 0) continue;
    kinds += 1;
    points += quantity * item.points;
    if (preferredIds.includes(item.id)) preferredPoints += quantity * item.points;
  }
  return { points, preferredPoints, kinds };
}

/** 요리 짐의 품질. 요리가 아니면 null. 품질은 품목 id에 들어 있다. */
function peddlerCargoDishQuality(item: PeddlerCargoView): CookingQuality | null {
  if (!item.id.startsWith(PEDDLER_DISH_CARGO_PREFIX)) return null;
  return parseCookingFoodIdFormat(item.id.slice(PEDDLER_DISH_CARGO_PREFIX.length))?.quality ?? null;
}

/** 가진 요리 짐의 품질 목록(낮은 품질부터). */
export function peddlerCargoDishQualities(cargo: readonly PeddlerCargoView[]): CookingQuality[] {
  const found = new Set(cargo.flatMap((item) => peddlerCargoDishQuality(item) ?? []));
  return [...found].sort((a, b) => COOKING_QUALITY_RANK[a] - COOKING_QUALITY_RANK[b]);
}

export type PeddlerCargoFilter = {
  group: PeddlerCargoGroup | "all";
  /** 요리에만 적용한다. 다른 계열은 품질을 골라도 그대로 보인다. */
  quality: CookingQuality | "all";
  query: string;
};

const searchKey = (text: string) => text.replace(/\s+/g, "").toLowerCase();

/** 짐 목록을 계열, 요리 품질, 이름으로 좁힌다. 순서는 바꾸지 않는다. */
export function filterPeddlerCargo(
  cargo: readonly PeddlerCargoView[],
  { group, quality, query }: PeddlerCargoFilter,
): PeddlerCargoView[] {
  const needle = searchKey(query);
  return cargo.filter((item) => {
    if (group !== "all" && item.group !== group) return false;
    if (quality !== "all") {
      const dishQuality = peddlerCargoDishQuality(item);
      if (dishQuality && dishQuality !== quality) return false;
    }
    return !needle || searchKey(item.name).includes(needle);
  });
}

/** 다른 짐을 그대로 둔 채 이 품목을 실을 수 있는 최대 수량. */
export function peddlerMaxLoadable(
  item: PeddlerCargoView,
  cargo: readonly PeddlerCargoView[],
  selection: Readonly<Record<string, number>>,
  capacity: number,
): number {
  const others = peddlerSelectionTotals(cargo, { ...selection, [item.id]: 0 }, []).points;
  return Math.max(0, Math.min(item.held, Math.floor((capacity - others) / item.points)));
}

/** 서버에 보낼 짐. 수량이 0인 품목은 뺀다. */
export function peddlerCargoPayload(
  cargo: readonly PeddlerCargoView[],
  selection: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    cargo.flatMap((item) => {
      const quantity = Math.min(item.held, selection[item.id] ?? 0);
      return quantity > 0 ? [[item.id, quantity]] : [];
    }),
  );
}
