// 영지 빌더 상수 — newgametest 프로토타입(game.js)에서 옮겨온 정의.
// 변경 시 균형 검토 필요 (자원 생산률·전투 시뮬 결과에 직결).
import type {
  BuildingType,
  Enemy,
  Hero,
  ResourceBag,
  UnitBag,
  UnitType,
} from "./types";

export const TILE_PX = 32;
export const GRID_W = 20;
export const GRID_H = 15;

export const SAVE_KEY = "fiefdom_preview_v1";
/** 오프라인 누적 생산 캡 — 한 번에 1시간치만 정산. */
export const MAX_OFFLINE_MS = 60 * 60 * 1000;
export const SAVE_INTERVAL_MS = 5000;

export type BuildingDef = {
  name: string;
  cost: Partial<ResourceBag>;
  size: 1 | 2;
  /** SVG <rect> 에 적용할 Tailwind fill 클래스 (light/dark 둘 다 포함). */
  fillClass: string;
  /** SVG <rect> 에 적용할 Tailwind stroke 클래스. */
  strokeClass: string;
  /** 단위 시간당 생산량(없으면 비생산 건물). */
  produces?: Partial<ResourceBag>;
  /** 생산 주기(ms). produces 와 함께 정의. */
  interval?: number;
  /** 최대 건축 가능 수(타운홀 1개 같은 케이스). */
  max?: number;
};

// 톤 매칭 — 본토 MapNode 의 파스텔 fill + 진한 stroke 패턴 따름.
// fillClass/strokeClass 는 Tailwind 클래스라 다크모드도 자동.
export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  townhall: {
    name: "본부",
    cost: {},
    size: 2,
    fillClass: "fill-amber-200 dark:fill-amber-900/60",
    strokeClass: "stroke-amber-500 dark:stroke-amber-700",
    max: 1,
  },
  goldmine: {
    name: "금광",
    cost: { wood: 50 },
    size: 1,
    fillClass: "fill-yellow-200 dark:fill-yellow-900/60",
    strokeClass: "stroke-yellow-500 dark:stroke-yellow-700",
    produces: { gold: 10 },
    interval: 5000,
  },
  lumbermill: {
    name: "제재소",
    cost: { gold: 50 },
    size: 1,
    fillClass: "fill-orange-200 dark:fill-orange-900/60",
    strokeClass: "stroke-orange-600 dark:stroke-orange-700",
    produces: { wood: 10 },
    interval: 5000,
  },
  farm: {
    name: "농장",
    cost: { wood: 30, gold: 20 },
    size: 1,
    fillClass: "fill-emerald-200 dark:fill-emerald-900/60",
    strokeClass: "stroke-emerald-500 dark:stroke-emerald-700",
    produces: { food: 10 },
    interval: 5000,
  },
  barracks: {
    name: "병영",
    cost: { gold: 100, wood: 80 },
    size: 2,
    fillClass: "fill-rose-200 dark:fill-rose-900/60",
    strokeClass: "stroke-rose-500 dark:stroke-rose-700",
  },
};

export type UnitDef = {
  name: string;
  icon: string;
  cost: Partial<ResourceBag>;
  trainTime: number;
  attack: number;
  hp: number;
};

export const UNITS: Record<UnitType, UnitDef> = {
  warrior: {
    name: "전사",
    icon: "⚔️",
    cost: { food: 20, gold: 30 },
    trainTime: 5000,
    attack: 10,
    hp: 30,
  },
  archer: {
    name: "궁수",
    icon: "🏹",
    cost: { food: 15, gold: 50, wood: 20 },
    trainTime: 7000,
    attack: 15,
    hp: 15,
  },
};

export const RES_ICONS: Record<keyof ResourceBag, string> = {
  gold: "🪙",
  wood: "🪵",
  food: "🌾",
};

// — Hero —
export const HERO_BASE_HP = 50;
export const HERO_BASE_ATK = 15;
export const HERO_HP_PER_LEVEL = 20;
export const HERO_ATK_PER_LEVEL = 5;
export const HERO_RECOVERY_MS = 60 * 1000;
export const HERO_REGEN_PER_TICK = 2;
export const HERO_REGEN_INTERVAL = 1000;

export function heroMaxHp(hero: Hero): number {
  return HERO_BASE_HP + (hero.level - 1) * HERO_HP_PER_LEVEL;
}
export function heroAtk(hero: Hero): number {
  return HERO_BASE_ATK + (hero.level - 1) * HERO_ATK_PER_LEVEL;
}
export function xpForNext(level: number): number {
  return level * 100;
}
export function heroAvailable(hero: Hero, now: number): boolean {
  return hero.recoveringUntil === 0 || now >= hero.recoveringUntil;
}

// — Enemy generation —
export function makeEnemy(level: number): Enemy {
  return {
    level,
    army: {
      warrior: 3 + level * 2,
      archer: Math.max(0, level - 1) + Math.floor(level / 2),
    },
    loot: { gold: 80 * level, wood: 60 * level, food: 40 * level },
  };
}

export function defaultHero(): Hero {
  return {
    name: "용사",
    level: 1,
    xp: 0,
    currentHp: HERO_BASE_HP,
    recoveringUntil: 0,
    lastRegen: Date.now(),
  };
}

// 신규 영지 기본 state — 서버(첫 GET 시 자동 생성)와 클라(localStorage 미존재 시) 공용.
export function defaultFiefdomState(): import("./types").FiefdomState {
  return {
    resources: { gold: 200, wood: 200, food: 200 },
    buildings: [{ type: "townhall", x: 9, y: 6 }],
    units: { warrior: 0, archer: 0 },
    trainQueue: [],
    hero: defaultHero(),
    defeatedTerritories: [],
  };
}

export function costText(cost: Partial<ResourceBag>): string {
  return Object.entries(cost)
    .map(([k, v]) => `${RES_ICONS[k as keyof ResourceBag]}${v}`)
    .join(" ");
}

// 클라/서버 공용 — 군대 파워. UNITS 의 attack/hp 합산.
export function computeArmyPower(army: UnitBag): { atk: number; hp: number } {
  let atk = 0;
  let hp = 0;
  for (const k of Object.keys(army) as Array<keyof UnitBag>) {
    atk += army[k] * UNITS[k].attack;
    hp += army[k] * UNITS[k].hp;
  }
  return { atk, hp };
}
