// 고탑 풀 매핑 — 각 층에 어떤 잡몹/보스가 나오는지 결정.
//
// 잡몹 풀: WORLD_MAP 의 enemies 가 있는 모든 지역에서 mob 배열을 가져와
//          recommendedLevel 오름차순으로 정렬, 5층 단위로 풀 인덱스를 증가시키며 순환.
// 보스 풀: 10/20/.../130 의 13 슬롯에 region.boss + coop boss + 변형 잡몹(elite) 배치.
//          정의된 슬롯 초과 층은 마지막 슬롯을 반복 사용 (이론상 130+ 진입자만 만남).
//
// D-strategy (2026-05-14 결정): 신규 그래픽 부담 없이 기존 자산(보스 + 잡몹) 으로 13층을 채운다.

import { MONSTERS, type Monster } from "@/adventure/data/monsters";
import { WORLD_MAP } from "@/adventure/data/world";
import {
  TOWER_BOSS_INTERVAL,
  TOWER_MAX_DEFINED_FLOOR,
  TOWER_POOL_BLOCK_SIZE,
} from "./types";

/** 보스 슬롯 — F10/F20/.../F130 에 매핑. monsterName 은 MONSTERS 키. */
export type BossSlot = {
  /** MONSTERS 키 — 그래픽/베이스 스탯의 출처. */
  monsterName: string;
  /** 탑 표시명 (override). 미지정이면 monsterName 그대로. */
  displayName?: string;
  /**
   * 베이스 스탯에 곱하는 배수.
   * - real boss (region.boss / coop boss): 1.0 — 기존 보스 스탯을 그대로 층 스케일링.
   * - elite (잡몹 도색): 2.0~3.0 — 잡몹 베이스를 보스급으로 끌어올림.
   */
  bossMultiplier: number;
};

// 13 보스 슬롯 (인덱스 0 = F10, 1 = F20, ..., 12 = F130).
// 1~8: 기존 region.boss(4) + coop boss(4) — bossMultiplier 1.0
// 9~13: 후반부를 채우는 elite — bossMultiplier 2.0~3.0 점증
export const BOSS_SLOTS: readonly BossSlot[] = [
  { monsterName: "광맥의 수호자", bossMultiplier: 1.0 }, // F10
  { monsterName: "옛 성문지기", bossMultiplier: 1.0 }, // F20
  { monsterName: "수심의 것", bossMultiplier: 1.0 }, // F30
  { monsterName: "운봉의 거인", bossMultiplier: 1.0 }, // F40
  { monsterName: "화산의 심장", bossMultiplier: 1.0 }, // F50
  { monsterName: "별을 지키는 자", bossMultiplier: 1.0 }, // F60
  { monsterName: "천공인의 왕", bossMultiplier: 1.0 }, // F70
  { monsterName: "창공의 주재", bossMultiplier: 1.0 }, // F80
  { monsterName: "잠든 황좌 거인", displayName: "고탑의 황좌 거인", bossMultiplier: 3.2 }, // F90
  { monsterName: "황성 호위병", displayName: "고탑의 황성 호위", bossMultiplier: 4.0 }, // F100
  { monsterName: "옥좌의 검신", displayName: "고탑의 옥좌 검신", bossMultiplier: 2.3 }, // F110
  { monsterName: "별빛 사도", displayName: "고탑의 별빛 사도", bossMultiplier: 3.5 }, // F120
  { monsterName: "봉인 파편", displayName: "고탑의 봉인 파편", bossMultiplier: 4.2 }, // F130
];

/** 보스층 → 슬롯. 130 초과는 마지막 슬롯 재사용. */
export function bossSlotForFloor(floor: number): BossSlot | null {
  if (floor <= 0 || floor % TOWER_BOSS_INTERVAL !== 0) return null;
  const idx = Math.min(
    BOSS_SLOTS.length - 1,
    Math.floor(floor / TOWER_BOSS_INTERVAL) - 1,
  );
  return BOSS_SLOTS[idx];
}

// 잡몹 풀 — WORLD_MAP 에서 enemies 가 있는 지역의 mob 배열을 recommendedLevel 오름차순으로 모아둠.
// 모듈 로드 시 한 번 계산.
const MOB_POOLS: readonly string[][] = (() => {
  const regions = WORLD_MAP.regions
    .filter((r) => !r.tags?.includes("town") && r.enemies.length > 0)
    .slice()
    .sort(
      (a, b) =>
        (a.recommendedLevel ?? Number.POSITIVE_INFINITY) -
        (b.recommendedLevel ?? Number.POSITIVE_INFINITY),
    );
  return regions.map((r) => r.enemies.slice());
})();

/** 디버깅/시뮬용 — 현재 등록된 풀 개수. */
export function mobPoolCount(): number {
  return MOB_POOLS.length;
}

/** 층 → 그 층의 잡몹 풀. 5층 단위로 풀 인덱스 증가, 풀 끝나면 처음부터 순환. */
export function mobPoolForFloor(floor: number): readonly string[] {
  if (MOB_POOLS.length === 0) return [];
  const blockIdx = Math.floor((Math.max(1, floor) - 1) / TOWER_POOL_BLOCK_SIZE);
  return MOB_POOLS[blockIdx % MOB_POOLS.length];
}

/** 풀에서 균등 랜덤으로 하나 — rng 주입 가능 (테스트). */
export function pickMobFromPool(
  pool: readonly string[],
  rng: () => number = Math.random,
): string {
  if (pool.length === 0) throw new Error("empty mob pool");
  return pool[Math.floor(rng() * pool.length)];
}

/** 보스 슬롯이 가리키는 베이스 몬스터. MONSTERS 에 없으면 throw (개발 시점 검증용). */
export function bossBaseMonster(slot: BossSlot): Monster {
  const m = MONSTERS[slot.monsterName];
  if (!m) {
    throw new Error(`[tower] unknown boss monster: ${slot.monsterName}`);
  }
  return m;
}

/** 보스 슬롯 표시명. */
export function bossDisplayName(slot: BossSlot): string {
  return slot.displayName ?? slot.monsterName;
}

/** 모든 보스 슬롯 무결성 검사 — MONSTERS 에 모두 존재하는지. 테스트에서 호출. */
export function validateBossSlots(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const slot of BOSS_SLOTS) {
    if (!MONSTERS[slot.monsterName]) missing.push(slot.monsterName);
  }
  return { ok: missing.length === 0, missing };
}

// 노트: TOWER_MAX_DEFINED_FLOOR(130) = BOSS_SLOTS.length × 10.
// 132층 등으로 갔을 때 보스층은 F130 슬롯이 무한 반복 — 스케일링만 계속 올라감.
