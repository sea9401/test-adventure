// 길드 영지 시스템 타입.
// Phase 1: 단일 영지 빌더(격자/건물/자원/유닛/영웅/AI 전투).
// Phase 2: 별자리 맵 오버뷰 — 플레이어 영지 + AI 영지 5개, 인접 공격, defeated 영속화.
// 멀티(친구 코드)는 후속 Phase.
// FiefdomId 는 브랜드 타입 — 영지 ID 가 일반 string 과 섞이지 않도록.
export type FiefdomId = string & { readonly __brand: "FiefdomId" };

import type { TerritoryId } from "./territoryMap";

export type ResourceKey = "gold" | "wood" | "food";
export type ResourceBag = Record<ResourceKey, number>;

export type BuildingType =
  | "townhall"
  | "goldmine"
  | "lumbermill"
  | "farm"
  | "barracks";

export type UnitType = "warrior" | "archer";
export type UnitBag = Record<UnitType, number>;

export type Building = {
  type: BuildingType;
  x: number;
  y: number;
  /** 생산 건물에만 존재 — 마지막 생산 정산 시각(ms). */
  lastProduce?: number;
};

export type TrainQueueItem = {
  type: UnitType;
  /** 완성 예정 시각(ms). 큐는 순차 처리(앞 항목 finishAt 다음에 다음 항목이 시작). */
  finishAt: number;
};

export type Enemy = {
  level: number;
  army: UnitBag;
  loot: ResourceBag;
};

export type Hero = {
  name: string;
  level: number;
  xp: number;
  currentHp: number;
  /** 0 이면 활성, >0 이면 회복 완료 예정 시각(ms). */
  recoveringUntil: number;
  /** 마지막 HP regen 정산 시각(ms). */
  lastRegen: number;
};

export type FiefdomState = {
  resources: ResourceBag;
  buildings: Building[];
  units: UnitBag;
  trainQueue: TrainQueueItem[];
  hero: Hero;
  /** 정복한 AI 영지 ID 목록 — 별자리 맵에서 grayed-out 표시 & 재공격 차단. */
  defeatedTerritories: TerritoryId[];
};
