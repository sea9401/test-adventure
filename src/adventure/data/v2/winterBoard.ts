// 겨울 이벤트 주사위 말판 — 순수 규칙 엔진. 설계: docs/superpowers/specs/2026-11-12-winter-dice-board-design.md
//
// DB와 시계에 의존하지 않는다. 서버 서비스(lib/server/winterBoard.ts)가 세이브를 잠근 뒤
// 이 함수들로 다음 상태를 계산하고 보상을 지급한다.

export const WINTER_BOARD_SAVE_KEY = "winter-board.v1";

/** 굴리기 종료(2026-12-10 23:59 KST 다음 순간). */
export const WINTER_ROLLING_ENDS_AT = Date.parse("2026-12-11T00:00:00+09:00");
/** 교환소·바퀴 보상 수령 종료(2026-12-14 23:59 KST 다음 순간). */
export const WINTER_SHOP_ENDS_AT = Date.parse("2026-12-15T00:00:00+09:00");

export const WINTER_QUEST_DICE_DAILY_CAP = 4;
export const WINTER_DAILY_DICE_MAX = 1 + WINTER_QUEST_DICE_DAILY_CAP;
export const WINTER_LAP_COINS = 10;
export const WINTER_ROLL_ALL_MAX = 60;
export const WINTER_RECENT_ROLLS_MAX = 20;

export const WINTER_TITLE_WANDERER_ID = "winter_wanderer";
export const WINTER_TITLE_TRAILBLAZER_ID = "winter_trailblazer";
export const WINTER_TITLE_FINISHER_ID = "winter_finisher";

export type WinterTile =
  | { kind: "start" }
  | { kind: "coins"; coins: number }
  | { kind: "potion" }
  | { kind: "again" }
  | { kind: "forward"; steps: number };

const c = (coins: number): WinterTile => ({ kind: "coins", coins });
const POTION: WinterTile = { kind: "potion" };
const AGAIN: WinterTile = { kind: "again" };
const FORWARD: WinterTile = { kind: "forward", steps: 3 };

// 번호 순서. 앞으로 3칸(8·19번)은 주화 10 칸(11·22번)으로 이어진다.
export const WINTER_TILES: readonly WinterTile[] = [
  { kind: "start" }, c(2), c(2), c(5), AGAIN, c(2),
  POTION, c(2), FORWARD, c(5), c(2), c(10),
  c(2), c(5), AGAIN, c(2), c(2), POTION,
  c(5), FORWARD, c(2), c(5), c(10), c(2),
];

export type WinterPhase = "active" | "shop_only" | "ended";

export function winterPhase(nowMs: number): WinterPhase {
  if (nowMs < WINTER_ROLLING_ENDS_AT) return "active";
  if (nowMs < WINTER_SHOP_ENDS_AT) return "shop_only";
  return "ended";
}

export type WinterReward =
  | { kind: "stamina_potion"; count: number }
  | { kind: "mastery_certificate"; count: number }
  | { kind: "cash_item"; itemId: "enchant_scroll" | "emblem_box"; count: number }
  | { kind: "title"; titleId: string };

export type WinterMilestone = { laps: number; label: string; reward: WinterReward };

export const WINTER_MILESTONES: readonly WinterMilestone[] = [
  { laps: 3, label: "스태미나 회복약 3개", reward: { kind: "stamina_potion", count: 3 } },
  { laps: 6, label: "숙련 증서 30개", reward: { kind: "mastery_certificate", count: 30 } },
  { laps: 9, label: "마법부여서 1장", reward: { kind: "cash_item", itemId: "enchant_scroll", count: 1 } },
  { laps: 12, label: "문장 상자 1개", reward: { kind: "cash_item", itemId: "emblem_box", count: 1 } },
  { laps: 15, label: "칭호 ‘겨울을 완주한 모험가’", reward: { kind: "title", titleId: WINTER_TITLE_FINISHER_ID } },
];

export type WinterShopItem = {
  id: string;
  name: string;
  cost: number;
  /** 이벤트 전체 기간의 구매 한도. */
  limit: number;
  reward: WinterReward;
};

export const WINTER_SHOP_ITEMS: readonly WinterShopItem[] = [
  { id: "mastery_certificate", name: "숙련 증서 10개", cost: 15, limit: 20, reward: { kind: "mastery_certificate", count: 10 } },
  { id: "stamina_potion", name: "스태미나 회복약 1개", cost: 20, limit: 15, reward: { kind: "stamina_potion", count: 1 } },
  { id: "enchant_scroll", name: "마법부여서 1장", cost: 60, limit: 3, reward: { kind: "cash_item", itemId: "enchant_scroll", count: 1 } },
  { id: "emblem_box", name: "문장 상자 1개", cost: 60, limit: 3, reward: { kind: "cash_item", itemId: "emblem_box", count: 1 } },
  { id: "title_wanderer", name: "칭호 ‘겨울 나그네’", cost: 150, limit: 1, reward: { kind: "title", titleId: WINTER_TITLE_WANDERER_ID } },
  { id: "title_trailblazer", name: "칭호 ‘눈길의 개척자’", cost: 400, limit: 1, reward: { kind: "title", titleId: WINTER_TITLE_TRAILBLAZER_ID } },
];

const SHOP_ITEM_BY_ID = new Map(WINTER_SHOP_ITEMS.map((item) => [item.id, item]));
const MILESTONE_BY_LAPS = new Map(WINTER_MILESTONES.map((m) => [m.laps, m]));

export type WinterRollEvent = {
  die: number;
  from: number;
  /** 주사위 눈만큼 가서 처음 선 칸. */
  landed: number;
  /** 칸 효과까지 적용한 최종 위치. */
  to: number;
  /** 처음 선 칸의 종류. */
  tile: WinterTile["kind"];
  /** 칸 주화 + 완주 주화. */
  coins: number;
  potions: number;
  diceRefund: number;
  lapsGained: number;
};

export type WinterRollResult = {
  events: WinterRollEvent[];
  coins: number;
  potions: number;
  lapsGained: number;
};

export type WinterBoardState = {
  version: 1;
  position: number;
  laps: number;
  dice: number;
  coins: number;
  coinsEarnedTotal: number;
  /** 마지막으로 적립을 계산한 KST 날짜. */
  dayKey: string;
  visitGranted: boolean;
  questDiceGranted: number;
  purchases: Record<string, number>;
  claimedMilestones: number[];
  recentRolls: WinterRollEvent[];
  lastRoll: { requestId: string; result: WinterRollResult } | null;
};

function nonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseRollEvent(raw: unknown): WinterRollEvent | null {
  if (!isRecord(raw)) return null;
  const tile = raw.tile;
  if (
    tile !== "start" &&
    tile !== "coins" &&
    tile !== "potion" &&
    tile !== "again" &&
    tile !== "forward"
  ) {
    return null;
  }
  return {
    die: nonNegativeInt(raw.die),
    from: nonNegativeInt(raw.from) % WINTER_TILES.length,
    landed: nonNegativeInt(raw.landed) % WINTER_TILES.length,
    to: nonNegativeInt(raw.to) % WINTER_TILES.length,
    tile,
    coins: nonNegativeInt(raw.coins),
    potions: nonNegativeInt(raw.potions),
    diceRefund: nonNegativeInt(raw.diceRefund),
    lapsGained: nonNegativeInt(raw.lapsGained),
  };
}

function parseRollEvents(raw: unknown): WinterRollEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const event = parseRollEvent(item);
    return event ? [event] : [];
  });
}

function parseLastRoll(raw: unknown): WinterBoardState["lastRoll"] {
  if (!isRecord(raw) || typeof raw.requestId !== "string" || !isRecord(raw.result)) {
    return null;
  }
  return {
    requestId: raw.requestId,
    result: {
      events: parseRollEvents(raw.result.events),
      coins: nonNegativeInt(raw.result.coins),
      potions: nonNegativeInt(raw.result.potions),
      lapsGained: nonNegativeInt(raw.result.lapsGained),
    },
  };
}

export function parseWinterBoardState(raw: unknown): WinterBoardState {
  const r = isRecord(raw) ? raw : {};
  const purchases: Record<string, number> = {};
  if (isRecord(r.purchases)) {
    for (const item of WINTER_SHOP_ITEMS) {
      const count = Math.min(item.limit, nonNegativeInt(r.purchases[item.id]));
      if (count > 0) purchases[item.id] = count;
    }
  }
  const claimedMilestones = Array.isArray(r.claimedMilestones)
    ? WINTER_MILESTONES.map((m) => m.laps).filter((laps) =>
        (r.claimedMilestones as unknown[]).includes(laps),
      )
    : [];
  return {
    version: 1,
    position: nonNegativeInt(r.position) % WINTER_TILES.length,
    laps: nonNegativeInt(r.laps),
    dice: nonNegativeInt(r.dice),
    coins: nonNegativeInt(r.coins),
    coinsEarnedTotal: nonNegativeInt(r.coinsEarnedTotal),
    dayKey: typeof r.dayKey === "string" ? r.dayKey : "",
    visitGranted: r.visitGranted === true,
    questDiceGranted: Math.min(
      WINTER_QUEST_DICE_DAILY_CAP,
      nonNegativeInt(r.questDiceGranted),
    ),
    purchases,
    claimedMilestones,
    recentRolls: parseRollEvents(r.recentRolls).slice(-WINTER_RECENT_ROLLS_MAX),
    lastRoll: parseLastRoll(r.lastRoll),
  };
}

/**
 * 그날의 접속 주사위(1)와 일일 퀘스트 완료 수만큼의 주사위(하루 4개까지)를 적립한다.
 * 이미 적립한 수와의 차이만 더하므로 여러 번 불러도 같다. 적립할 것이 없으면 같은 객체를 돌려준다.
 */
export function syncWinterDice(
  state: WinterBoardState,
  dayKey: string,
  completedDailyQuests: number,
): { state: WinterBoardState; granted: number } {
  const sameDay = state.dayKey === dayKey;
  const visitGranted = sameDay && state.visitGranted;
  const questGranted = sameDay ? state.questDiceGranted : 0;
  const questTarget = Math.max(
    questGranted,
    Math.min(WINTER_QUEST_DICE_DAILY_CAP, nonNegativeInt(completedDailyQuests)),
  );
  const granted = (visitGranted ? 0 : 1) + (questTarget - questGranted);
  if (granted === 0 && sameDay) return { state, granted: 0 };
  return {
    granted,
    state: {
      ...state,
      dayKey,
      visitGranted: true,
      questDiceGranted: questTarget,
      dice: state.dice + granted,
    },
  };
}

/** 주사위 눈 하나로 말을 옮긴 결과. 앞으로 가는 칸의 연쇄는 한 번뿐이다. */
export function resolveWinterMove(
  position: number,
  die: number,
  tiles: readonly WinterTile[] = WINTER_TILES,
): WinterRollEvent {
  const size = tiles.length;
  let raw = position + die;
  let lapsGained = raw >= size ? 1 : 0;
  const landed = raw % size;
  const first = tiles[landed]!;
  let to = landed;
  let effect: WinterTile = first;
  if (first.kind === "forward") {
    raw = landed + first.steps;
    if (raw >= size) lapsGained += 1;
    to = raw % size;
    const destination = tiles[to]!;
    // 도착한 칸이 또 앞으로 가는 칸이면 효과 없이 멈춘다.
    effect = destination.kind === "forward" ? { kind: "start" } : destination;
  }
  const tileCoins = effect.kind === "coins" ? effect.coins : 0;
  return {
    die,
    from: position,
    landed,
    to,
    tile: first.kind,
    coins: tileCoins + lapsGained * WINTER_LAP_COINS,
    potions: effect.kind === "potion" ? 1 : 0,
    diceRefund: effect.kind === "again" ? 1 : 0,
    lapsGained,
  };
}

function rollDie(rng: () => number): number {
  return 1 + Math.min(5, Math.max(0, Math.floor(rng() * 6)));
}

export function rollWinterDice(
  state: WinterBoardState,
  opts: { all: boolean; rng: () => number },
): { state: WinterBoardState; result: WinterRollResult } | { error: "no_dice" } {
  if (state.dice <= 0) return { error: "no_dice" };
  const maxRolls = opts.all ? WINTER_ROLL_ALL_MAX : 1;
  const events: WinterRollEvent[] = [];
  let { position, dice, laps } = state;
  let coins = 0;
  let potions = 0;
  let lapsGained = 0;
  while (dice > 0 && events.length < maxRolls) {
    const event = resolveWinterMove(position, rollDie(opts.rng));
    events.push(event);
    dice += event.diceRefund - 1;
    position = event.to;
    laps += event.lapsGained;
    coins += event.coins;
    potions += event.potions;
    lapsGained += event.lapsGained;
  }
  return {
    result: { events, coins, potions, lapsGained },
    state: {
      ...state,
      position,
      dice,
      laps,
      coins: state.coins + coins,
      coinsEarnedTotal: state.coinsEarnedTotal + coins,
      recentRolls: [...state.recentRolls, ...events].slice(-WINTER_RECENT_ROLLS_MAX),
    },
  };
}

export function claimWinterMilestone(
  state: WinterBoardState,
  laps: number,
):
  | { state: WinterBoardState; reward: WinterReward }
  | { error: "unknown_milestone" | "milestone_locked" | "already_claimed" } {
  const milestone = MILESTONE_BY_LAPS.get(laps);
  if (!milestone) return { error: "unknown_milestone" };
  if (state.claimedMilestones.includes(laps)) return { error: "already_claimed" };
  if (state.laps < laps) return { error: "milestone_locked" };
  return {
    reward: milestone.reward,
    state: {
      ...state,
      claimedMilestones: [...state.claimedMilestones, laps].sort((a, b) => a - b),
    },
  };
}

export function buyWinterShopItem(
  state: WinterBoardState,
  itemId: string,
):
  | { state: WinterBoardState; item: WinterShopItem }
  | { error: "unknown_item" | "limit_reached" | "not_enough_coins" } {
  const item = SHOP_ITEM_BY_ID.get(itemId);
  if (!item) return { error: "unknown_item" };
  const purchased = state.purchases[item.id] ?? 0;
  if (purchased >= item.limit) return { error: "limit_reached" };
  if (state.coins < item.cost) return { error: "not_enough_coins" };
  return {
    item,
    state: {
      ...state,
      coins: state.coins - item.cost,
      purchases: { ...state.purchases, [item.id]: purchased + 1 },
    },
  };
}

/** 굴릴 주사위 수 + 받을 수 있는 바퀴 보상 수. 알림 표시에 쓴다. */
export function winterPendingCount(state: WinterBoardState): number {
  const claimable = WINTER_MILESTONES.filter(
    (m) => state.laps >= m.laps && !state.claimedMilestones.includes(m.laps),
  ).length;
  return state.dice + claimable;
}

/** API가 화면에 돌려주는 말판 상태. */
export type WinterBoardView = {
  ok: true;
  phase: WinterPhase;
  rollingEndsAt: number;
  shopEndsAt: number;
  serverNow: number;
  position: number;
  laps: number;
  dice: number;
  coins: number;
  today: { visitGranted: boolean; questDiceGranted: number; questDiceCap: number };
  milestones: { laps: number; label: string; claimed: boolean; claimable: boolean }[];
  shop: { id: string; name: string; cost: number; limit: number; purchased: number }[];
  recentRolls: WinterRollEvent[];
  /** 굴릴 주사위 수 + 받을 수 있는 바퀴 보상 수. */
  pending: number;
};

/**
 * 말판을 가로 5칸, 세로 9칸의 테두리에 시계 방향으로 두른다(5 + 8 + 4 + 7 = 24칸).
 * 격자 좌표는 1부터 센다.
 */
export function winterTileCell(index: number): { col: number; row: number } {
  if (index <= 4) return { col: index + 1, row: 1 };
  if (index <= 12) return { col: 5, row: index - 3 };
  if (index <= 16) return { col: 17 - index, row: 9 };
  return { col: 1, row: 25 - index };
}
