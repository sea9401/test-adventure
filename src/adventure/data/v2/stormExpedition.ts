import type { Monster } from "@/adventure/data/monsters/types";
import { scaleMonsterForFloor } from "./monsterScale";

export const STORM_EXPEDITION_SAVE_KEY = "storm-expedition.v1";
export const STORM_EXPEDITION_UNLOCK_DEPTH = 72;
export const STORM_EXPEDITION_DAILY_ATTEMPTS = 3;
export const STORM_EXPEDITION_STAGE_COUNT = 4;

export type StormExpeditionRouteId = "gale" | "thunder" | "wreckage";

export type StormExpeditionRoute = {
  id: StormExpeditionRouteId;
  name: string;
  tagline: string;
  threat: string;
  accent: "sky" | "violet" | "amber";
};

export const STORM_EXPEDITION_ROUTES: StormExpeditionRoute[] = [
  {
    id: "gale",
    name: "칼바람 항로",
    tagline: "빠른 적을 뚫고 가장 짧은 길로 전진합니다.",
    threat: "높은 속도 · 회피 · 치명타",
    accent: "sky",
  },
  {
    id: "thunder",
    name: "뇌운 항로",
    tagline: "마력이 요동치는 구름층을 정면으로 가릅니다.",
    threat: "마법 공격 · 연속 스킬",
    accent: "violet",
  },
  {
    id: "wreckage",
    name: "부유 잔해지",
    tagline: "무너진 섬의 잔해 사이로 묵직하게 돌파합니다.",
    threat: "높은 방어 · 관통 · 강타",
    accent: "amber",
  },
];

export type StormExpeditionActive = {
  routeId: StormExpeditionRouteId;
  /** 다음에 싸울 0-based 구간. 0~3. */
  stage: number;
  hp: number;
  mp: number;
  pendingGold: number;
};

export type StormExpeditionState = {
  date: string;
  attemptsUsed: number;
  active: StormExpeditionActive | null;
  clears: number;
};

export function stormExpeditionDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseStormExpeditionState(
  raw: unknown,
  date = stormExpeditionDateKey(),
): StormExpeditionState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const sameDay = source.date === date;
  const active = parseActive(source.active);
  return {
    date,
    attemptsUsed: sameDay ? clampInt(source.attemptsUsed, 0, STORM_EXPEDITION_DAILY_ATTEMPTS) : 0,
    // 자정이 지나도 진행 중 원정은 사라지지 않는다. 새 입장 횟수만 갱신한다.
    active,
    clears: clampInt(source.clears, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function stormExpeditionRoute(
  id: unknown,
): StormExpeditionRoute | null {
  return STORM_EXPEDITION_ROUTES.find((route) => route.id === id) ?? null;
}

export function stormExpeditionStageReward(stage: number): number {
  return [18_000, 28_000, 42_000, 72_000][clampInt(stage, 0, 3)] ?? 0;
}

export function stormExpeditionEnemy(
  routeId: StormExpeditionRouteId,
  stage: number,
): Monster {
  const s = clampInt(stage, 0, STORM_EXPEDITION_STAGE_COUNT - 1);
  return scaleMonsterForFloor(stormExpeditionEnemyBase(routeId, s), 72 + s);
}

function stormExpeditionEnemyBase(
  routeId: StormExpeditionRouteId,
  s: number,
): Monster {
  const boss = s === STORM_EXPEDITION_STAGE_COUNT - 1;
  const common = {
    tags: boss ? ["spirit", "golem"] as Monster["tags"] : ["spirit"] as Monster["tags"],
    exp: 0,
    drops: [],
    armorVulnerable: boss ? 0.22 : 0.12,
  };

  if (routeId === "gale") {
    return {
      ...common,
      name: boss ? "폭풍날개 라자크" : ["돌개바람 사냥꾼", "절벽의 칼깃", "폭풍 추격자"][s],
      hp: [430, 520, 650, 1_050][s],
      atk: [39, 42, 45, 49][s],
      def: [12, 14, 16, 20][s],
      spd: [12, 14, 16, 18][s],
      accuracy: [35, 45, 55, 68][s],
      evasionPct: [24, 28, 32, 36][s],
      critPct: [25, 30, 35, 42][s],
      element: "wind",
      skill: { kind: "pierce", name: "진공 발톱", armorPierce: boss ? 10 : 7 },
      bonusAttackChancePct: boss ? 70 : s * 15,
    };
  }
  if (routeId === "thunder") {
    return {
      ...common,
      name: boss ? "뇌정의 핵 아스트라" : ["뇌운 정령", "낙뢰 인도자", "자전 마도체"][s],
      hp: [410, 500, 620, 980][s],
      atk: [40, 43, 46, 51][s],
      def: [11, 13, 15, 18][s],
      magicDef: [15, 18, 21, 27][s],
      spd: [9, 10, 11, 13][s],
      accuracy: [30, 40, 50, 64][s],
      evasionPct: [14, 17, 20, 24][s],
      atkType: "magic",
      critPct: [18, 22, 28, 35][s],
      element: "lightning",
      v2Skills: {
        learned: boss ? ["mob_arcane_burst", "mob_arcane_nova"] : ["mob_arcane_burst"],
        equipped: boss ? ["mob_arcane_nova", "mob_arcane_burst"] : ["mob_arcane_burst"],
      },
      v2MaxMp: boss ? 220 : 120 + s * 20,
      bonusAttackChancePct: boss ? 35 : 0,
    };
  }
  return {
    ...common,
    name: boss ? "붕괴의 수문장 모르가" : ["잔해 갑주병", "부유석 파쇄자", "고철 감시자"][s],
    hp: [520, 640, 790, 1_250][s],
    atk: [37, 40, 43, 48][s],
    def: [20, 24, 28, 34][s],
    spd: [5, 6, 7, 8][s],
    accuracy: [28, 38, 48, 62][s],
    evasionPct: [5, 7, 9, 12][s],
    critPct: [12, 16, 20, 28][s],
    element: "earth",
    skill: boss
      ? { kind: "heavy_blow", name: "섬 붕괴", everyPhases: 3, multiplier: 1.9 }
      : { kind: "pierce", name: "잔해 관통", armorPierce: 7 + s },
    playerDefVulnerable: boss ? 0.24 : 0.1,
  };
}

function parseActive(raw: unknown): StormExpeditionActive | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const route = stormExpeditionRoute(source.routeId);
  if (!route) return null;
  return {
    routeId: route.id,
    stage: clampInt(source.stage, 0, STORM_EXPEDITION_STAGE_COUNT - 1),
    hp: clampInt(source.hp, 0, Number.MAX_SAFE_INTEGER),
    mp: clampInt(source.mp, 0, Number.MAX_SAFE_INTEGER),
    pendingGold: clampInt(source.pendingGold, 0, Number.MAX_SAFE_INTEGER),
  };
}

function clampInt(raw: unknown, min: number, max: number): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
