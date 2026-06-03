// v2 필드 보스 — 사냥터(던전 floor)마다 싱글 보스 1마리.
//
// 설계 (2026-06-03, 사용자 결정):
//   - 역할 = "다음 사냥터로 넘어갈 전투력 기준점". 소프트(잡으면 보상, 안 잡아도 다음 층
//     이동 가능 — types.ts 의 소프트 게이트 철학과 일관).
//   - 반복 = v1 싱글보스 결. 일일 쿨다운 없음 — 대신 도전 1회당 무거운 스태미너(일반 사냥의
//     20배, V2_BOSS_STAMINA_COST)가 throttle. 이길 때마다 보상(스태미너가 자연 빈도 제한).
//   - 첫 처치엔 칭호(영구·1회). grantTitle 멱등 반환으로 첫 처치 판정 — 별도 플래그/저장 불필요.
//
// 스탯은 라이브 MONSTERS 와 분리된 v2 전용 고정 블록 (scaleMonsterForFloor 안 거침 — 보스는
// floor 난이도 배율과 무관한 자체 곡선). 표시 이름/이미지도 여기서 직접 지정.
//
// ⚠️ DungeonFloor.boss?: { monsterName } (types.ts) 의 휴면 슬롯은 사용하지 않는다 — 보스가
//    이름뿐 아니라 고정 스탯·보상·게이트 데이터를 가져야 해 이 파일이 단일 출처. floor → 보스는
//    getFieldBoss(floorId) 로 조회.
//
// 튜닝: 들판(1층) 몹 hp 38~72 / 깊은 산(2층) 몹 hp 240·atk 22 사이. 들판 졸업(≈ 깊은 산 진입
//   파워 110) 시험이라 floor-1 캐릭에겐 벽, floor-2 갈 캐릭에겐 넘김. phaseTrigger 로 후반 벽 +
//   armorVulnerable 로 스펀지 방지. 정밀 수치는 sim-v2-progression + 라이브 실측 캘리브(테스트 기간).

import type { Monster } from "@/adventure/data/monsters/types";
import type { DungeonFloorId } from "./types";
import type { DropResult } from "./dungeonDrops";

// 필드 보스 도전 스태미너 비용 — 일반 사냥(HUNT_COST=1)의 20배. 일일 쿨다운 대신 이 비용이
// 도전 빈도를 throttle 한다(사용자 결정 2026-06-03). 더 희귀하게 하려면 이 값만 올리면 됨.
export const V2_BOSS_STAMINA_COST = 20;

export type V2FieldBoss = {
  floorId: DungeonFloorId;
  // 전투/UI 표시 이름.
  name: string;
  image?: string;
  // 권장 파워 — "이걸 잡으면 다음 사냥터 갈 준비" 소프트 기준점(표시용).
  recommendedPower: number;
  // 보스 스탯 블록 (v2 전용 고정).
  monster: Monster;
  // 첫 처치 1회성 칭호 (영구·멱등). grantTitle 이 첫 처치 판정도 겸함.
  firstClear: { titleId: string };
  // 처치 보상 — 이길 때마다 지급(쿨다운 없음, 스태미너가 throttle). exp 는 monster.exp 사용.
  //   재료(트로피)만 드랍 — 장비는 이 재료로 대장간 제작(craftOnly, V2_RECIPES). 드랍 RNG 없음.
  reward: { materials: DropResult };
};

// === 들판(1층) — 들개 우두머리 ======================================
// 그동안 잡던 들개 무리의 우두머리. 신호용 드랍 = 들짐승 송곳니(v2_field_fang).
const PLAINS_BOSS: V2FieldBoss = {
  floorId: 1,
  name: "들개 우두머리",
  // 임시 — 들개 아트 재사용(전용 아트 추후). check-images 통과용 기존 참조 이미지.
  image: "/images/monster/v2/field-wild-dog.webp",
  recommendedPower: 110, // 깊은 산(2층) 진입 파워 = 다음 사냥터 기준.
  monster: {
    name: "들개 우두머리",
    tags: ["beast"],
    image: "/images/monster/v2/field-wild-dog.webp",
    hp: 360,
    atk: 18,
    def: 7,
    spd: 5,
    exp: 50,
    dropQualityBias: 3,
    armorVulnerable: 0.3, // 스펀지 방지 — 그 시대 정석 장비면 적정 시간에 잡힘.
    phaseTrigger: {
      hpFraction: 0.3,
      defBonus: 5,
      message: "들개 우두머리가 송곳니를 드러내며 사납게 버틴다.",
    },
    bonusAttackChancePct: 80, // 보스전 압박(광맥의 수호자 170 보다 가볍게).
  },
  firstClear: {
    titleId: "field_boss_plains",
  },
  reward: {
    // 보스 전용 재료 보장 지급(매 승리). 이 재료로 대장간에서 보스 장비(craftOnly) 제작.
    materials: { v2_boss_plains_fang: 2 },
  },
};

export const V2_FIELD_BOSSES: Partial<Record<DungeonFloorId, V2FieldBoss>> = {
  1: PLAINS_BOSS,
};

export function getFieldBoss(floorId: DungeonFloorId): V2FieldBoss | null {
  return V2_FIELD_BOSSES[floorId] ?? null;
}
