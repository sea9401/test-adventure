// v2 테마 보스 — 사냥터 테마(들판·깊은 산·마른 협곡·…)마다 시그니처 엘리트 1마리.
// "잡으면 이 테마 졸업, 다음 밴드 갈 전투력" 소프트 벤치마크. 의도적 도전(보스 도전 버튼) —
// hunt 핫패스가 boss 플래그로 분기(별도 엔드포인트/페이지 없음). 쿨다운 없이 높은 스태미나가 throttle.
//
// 설계(2026-06-08): 옛 필드 보스(#435 revert)는 들판(초반 버려질 구간)에만 둬서 사장됐다.
//   지금은 무한 프론티어 8테마가 핵심 지속 콘텐츠라, 프론티어 진입 구간에 보스를 둔다.
//   파일럿 3종 — 깊은 산(테마 idx1)·마른 협곡(idx2)·얼음 호수(idx3). 나머지 테마는 보스 없음(null).
//
// 보스 스탯 = flat 베이스(잡몹의 ~1.9× HP·~1.2× ATK)를 그 테마 밴드 **최상단 깊이**(anchorDepth)로
//   scaleMonsterForFloor 한다. 잡몹과 같은 사다리를 타므로 "그 밴드를 끝낸 자" 난이도로 자동 정렬되고,
//   사다리 다이얼이 바뀌어도 보스가 잡몹 대비 비율을 유지한다. armorVulnerable(스펀지 방지)로 적정 시간 처치.

import type { Monster } from "@/adventure/data/monsters/types";
import { scaleMonsterForFloor } from "./monsterScale";
import { themeIndexForDepth, THEME_DEPTH_SPAN } from "./dungeon";
import { floorPowerGate } from "./dungeonLadder";
import type { V2EquipmentId } from "./v2Equipment";

export type ThemeBoss = {
  /** 0-based 테마 인덱스(DUNGEON_THEMES 와 일치). */
  themeIndex: number;
  themeName: string;
  /** 보스 표시명(잡몹과 별개 — base.name 과 동일하게 둠). */
  name: string;
  /** 스케일 기준 깊이 = 그 테마 밴드 최상단(themeIndex×SPAN + SPAN). "밴드 졸업" 난이도. */
  anchorDepth: number;
  /** flat 베이스 Monster — getThemeBoss 가 anchorDepth 로 스케일(이름/이미지/스킬/페이즈 보존). */
  base: Monster;
  /** 보스 전용 유니크 드랍 — 일반 사냥 풀·상점·제작엔 없는 보스 전용. 중복 드랍 허용(반복 추격). */
  uniqueDrop: { chance: number; ids: V2EquipmentId[] };
  /** 첫 처치 칭호 id(grantTitle idempotent — 두 번째부터 무시). base.onDefeatTitleId 와 동일. */
  titleId: string;
};

// 보스 전용 유니크 드랍률 — 보스당 단일 풀. 의도적 고스태미나 단판이라 밴드 풀(1%)보다 후하게.
// ⚠️ 라이브/sim 캘리브 다이얼.
export const BOSS_UNIQUE_DROP_CHANCE = 0.15;

// 보스 도전 스태미나 비용 — 일반 사냥(HUNT_COST=10)의 2배. 쿨다운 없이 이게 throttle.
// ⚠️ 캘리브 다이얼.
export const BOSS_HUNT_COST = 20;

// 테마별 보스(themeIndex 키). 파일럿 = 깊은 산(1)·마른 협곡(2)·얼음 호수(3)만. 나머지는 미정의(보스 없음).
// 아트는 그 테마 몹 이미지 재사용(플레이스홀더 — 교체 예정, 기존 참조라 check-images 통과).
const THEME_BOSSES: Record<number, ThemeBoss> = {
  // 깊은 산(깊이 7~12) — 산적 두목. 주기 강타형. anchor 12.
  1: {
    themeIndex: 1,
    themeName: "깊은 산",
    name: "산적 두목",
    anchorDepth: 12,
    base: {
      name: "산적 두목",
      tags: ["humanoid"],
      image: "/images/monster/v2/boss-mountain-chief.webp",
      hp: 620,
      atk: 30,
      def: 14,
      spd: 6,
      exp: 90,
      skill: {
        kind: "heavy_blow",
        name: "분쇄 강타",
        everyPhases: 3,
        multiplier: 1.8,
      },
      phaseTrigger: {
        hpFraction: 0.5,
        defBonus: 6,
        message: "두목이 분노로 날뛴다!",
      },
      armorVulnerable: 0.3,
      playerDefVulnerable: 0.2,
      dropQualityBias: 3,
      onDefeatTitleId: "v2_boss_mountain",
    },
    uniqueDrop: { chance: BOSS_UNIQUE_DROP_CHANCE, ids: ["v2_boss_mountain_axe"] },
    titleId: "v2_boss_mountain",
  },
  // 마른 협곡(깊이 13~18) — 사구의 포식자. 관통형(절벽 발톱). anchor 18.
  2: {
    themeIndex: 2,
    themeName: "마른 협곡",
    name: "사구의 포식자",
    anchorDepth: 18,
    base: {
      name: "사구의 포식자",
      tags: ["beast"],
      image: "/images/monster/v2/boss-canyon-predator.webp",
      element: "earth",
      hp: 600,
      atk: 31,
      def: 13,
      spd: 7,
      exp: 95,
      skill: { kind: "pierce", name: "절벽 발톱", armorPierce: 6 },
      phaseTrigger: {
        hpFraction: 0.5,
        defBonus: 6,
        message: "포식자가 송곳니를 드러낸다!",
      },
      armorVulnerable: 0.3,
      playerDefVulnerable: 0.2,
      dropQualityBias: 3,
      onDefeatTitleId: "v2_boss_canyon",
    },
    uniqueDrop: { chance: BOSS_UNIQUE_DROP_CHANCE, ids: ["v2_boss_canyon_fang"] },
    titleId: "v2_boss_canyon",
  },
  // 얼음 호수(깊이 19~24) — 호심의 군주. 잦은 강타형(동결). anchor 24.
  3: {
    themeIndex: 3,
    themeName: "얼음 호수",
    name: "호심의 군주",
    anchorDepth: 24,
    base: {
      name: "호심의 군주",
      tags: ["golem"],
      image: "/images/monster/v2/boss-lake-sovereign.webp",
      element: "water",
      hp: 680,
      atk: 29,
      def: 16,
      spd: 5,
      exp: 100,
      skill: {
        kind: "heavy_blow",
        name: "동결 강타",
        everyPhases: 2,
        multiplier: 1.6,
      },
      phaseTrigger: {
        hpFraction: 0.5,
        defBonus: 7,
        message: "군주의 주변이 얼어붙는다!",
      },
      armorVulnerable: 0.3,
      playerDefVulnerable: 0.2,
      dropQualityBias: 3,
      onDefeatTitleId: "v2_boss_lake",
    },
    uniqueDrop: { chance: BOSS_UNIQUE_DROP_CHANCE, ids: ["v2_boss_lake_maul"] },
    titleId: "v2_boss_lake",
  },
};

// 전 보스 전용 유니크 id 합집합(드랍 풀 검증·도감용). 일반 사냥 풀엔 없고 보스 처치로만 떨어진다.
export const BOSS_UNIQUE_IDS: V2EquipmentId[] = [
  ...new Set(Object.values(THEME_BOSSES).flatMap((b) => b.uniqueDrop.ids)),
];

// 전 보스 첫 처치 칭호 id 합집합. adventure-log.v2.titles 에 이 중 하나라도 있으면 "보스 처치 경험"
// (가이드 퀘스트 판정 등). 보스가 늘면 자동 반영.
export const BOSS_TITLE_IDS: string[] = [
  ...new Set(Object.values(THEME_BOSSES).map((b) => b.titleId)),
];

// 깊이 → 그 테마의 보스 정의(없으면 null). 보스 없는 테마(들판·심층 동굴 이후 등)는 null.
export function getThemeBossDef(depth: number): ThemeBoss | null {
  return THEME_BOSSES[themeIndexForDepth(depth)] ?? null;
}

// 깊이 → 스케일된 보스 Monster(anchorDepth 기준). 표시 이름/이미지/속성/스킬/페이즈 전부 보존.
// 보스 없으면 null. 엔드포인트가 전투 적으로, UI 가 스탯 미리보기로 사용.
export function getThemeBoss(depth: number): Monster | null {
  const def = getThemeBossDef(depth);
  if (!def) return null;
  return scaleMonsterForFloor(def.base, def.anchorDepth);
}

// 그 테마가 시작하는 깊이(밴드 최하단) — 보스 도전 게이트(이 깊이 도달 = 테마 진입)용.
export function themeStartDepth(depth: number): number {
  return themeIndexForDepth(depth) * THEME_DEPTH_SPAN + 1;
}

// 보스 권장 전투력 — anchorDepth(밴드 최상단)의 권장 전투력. UI 표시용. 보스 없으면 null.
export function bossRecommendedPower(depth: number): number | null {
  const def = getThemeBossDef(depth);
  return def ? floorPowerGate(def.anchorDepth) : null;
}

// 보스 유니크 드랍 굴림(순수) — 보스 처치 시. rollBandUniqueDrop 패턴(중복 드랍 허용 = 반복 추격).
//   rng() ∈ [0,1). 보스 없음/풀 비었음 → null(rng 미소비). 통과 시 풀에서 균등 pick.
export function rollBossUniqueDrop(
  depth: number,
  rng: () => number,
  chanceMult: number = 1,
): V2EquipmentId | null {
  const def = getThemeBossDef(depth);
  if (!def) return null;
  const pool = def.uniqueDrop;
  if (pool.chance <= 0 || pool.ids.length === 0) return null;
  if (rng() >= Math.min(1, pool.chance * chanceMult)) return null;
  return pool.ids[Math.floor(rng() * pool.ids.length)];
}
