// v2 사냥터 — 2개 구역 (들판 → 깊은 산).
//
// 2026-06-03: 8구역(들판~창공의 옥좌) → 2구역으로 축소. 뒤 구역(숲/산/화산/설원/별빛 권역)
// 제거 — 사냥 가능 층은 1·2 뿐(hunt route VALID_FLOORS). DungeonFloorId 타입과
// FLOOR_DIFFICULTY/드랍·장비·유니크 풀의 3~8 키는 휴면으로 남김(도달 불가, 복원 용이).
//
// 표시 이름(name)은 지형에 맞춘 v2 고유 이름이고, 스탯/스킬 출처(key)는 라이브 MONSTERS.
// 둘이 분리돼 있어 출처가 무엇이든 지형에 맞는 이름을 붙인다.

import type { Dungeon, DungeonEnemy } from "./types";
import { floorPowerGate } from "./dungeonLadder";

// === 1구역 — 들판 ====================================================
// 신캐 Lv1 도 안전한 풀. 상태이상 없음(온보딩 보호). 자연 속성만.
const FLOOR1_ENEMIES: DungeonEnemy[] = [
  { key: "들개", name: "들개", image: "/images/monster/v2/field-wild-dog.webp", element: "lightning" },
  { key: "두더지", name: "두더지", image: "/images/monster/v2/field-mole.webp", element: "earth" },
  { key: "박쥐", name: "멧토끼", image: "/images/monster/v2/field-hare.webp" },
  { key: "동굴뱀", name: "풀뱀", image: "/images/monster/v2/field-grass-snake.webp", element: "wind" },
  { key: "거미", name: "들거미", image: "/images/monster/v2/field-spider.webp", element: "earth" },
];

// === 2구역 — 깊은 산 =================================================
// 들판 다음 사냥터 — 산적 소굴 결. 산적·산적 궁수(사람형=무속성) + 늑대·곰·들소(짐승).
// 스탯 출처(key)는 라이브 몬스터. 산적 궁수는 깊은 산 체급 전용 블록(midlands "산적 궁수").
// ⚠️ 산적 궁수 전용 아트 부재 → field-highwayman 임시 이미지(빌드용, 추후 교체).
// 속성: 번개/대지/불 + 무속성 2.
const FLOOR2_ENEMIES: DungeonEnemy[] = [
  { key: "떠돌이 약탈자", name: "산적", image: "/images/monster/v2/mountain-brigand.webp" },
  { key: "산적 궁수", name: "산적 궁수", image: "/images/monster/v2/field-highwayman.webp" },
  { key: "절벽 늑대", name: "늑대", image: "/images/monster/v2/mountain-cliff-wolf.webp", element: "lightning" },
  { key: "부서진 골렘", name: "곰", image: "/images/monster/v2/forest-bear.webp", element: "earth" },
  { key: "들소", name: "들소", image: "/images/monster/v2/mountain-bison.webp", element: "fire" },
];

// === 무한 프론티어 ===================================================
// 단일 사냥터, 깊이(depth) 1→∞. 깊이 1=들판·2=깊은 산(아래 authored 풀)·3+=프론티어 풀.
// 깊이별 스탯/exp/추천파워 = dungeonLadder 제너레이터(무한, ×1.0~). 수동 푸시: 깊이 1~최고도달+1.
// ⚠️ 프론티어 풀 = 깊은 산 풀 재사용(플레이스홀더). 깊이 밴드별 테마 몹 세트로 점진 교체.
const FRONTIER_ENEMIES: DungeonEnemy[] = FLOOR2_ENEMIES;

// 프론티어 밴드 A — 마른 협곡 (깊이 3~7). 땅·바람·번개 + 무. 스탯은 V2_MONSTERS(깊은 산 앵커
// 스케일)에, 깊이가 dungeonLadder 배율로 올림. ⚠️ 아트는 기존 이미지 재사용(플레이스홀더) — 교체 예정.
const BAND_A_CANYON_ENEMIES: DungeonEnemy[] = [
  { key: "모래도마뱀", name: "모래도마뱀", image: "/images/monster/v2/field-grass-snake.webp", element: "earth" },
  { key: "협곡 도적", name: "협곡 도적", image: "/images/monster/v2/mountain-brigand.webp" },
  { key: "바위 골렘", name: "바위 골렘", image: "/images/monster/v2/volcano-ash-golem.webp", element: "earth" },
  { key: "회오리 매", name: "회오리 매", image: "/images/monster/v2/volcano-firebird.webp", element: "wind" },
  { key: "스파크 전갈", name: "스파크 전갈", image: "/images/monster/v2/field-spider.webp", element: "lightning" },
];

// 들판·깊은 산 = 깊이 1·2 의 고유(authored) 풀. element 분포 게이트·온보딩 보호.
export const MAIN_DUNGEON: Dungeon = {
  id: "main",
  name: "사냥터",
  floors: [
    {
      id: 1,
      name: "들판",
      requirement: { kind: "power", min: floorPowerGate(1) },
      enemies: FLOOR1_ENEMIES,
    },
    {
      id: 2,
      name: "깊은 산",
      requirement: { kind: "power", min: floorPowerGate(2) },
      enemies: FLOOR2_ENEMIES,
    },
  ],
};

// 깊이 → 적 풀. 1=들판·2=깊은 산(authored)·3~7=마른 협곡(밴드 A)·8+=프론티어 플레이스홀더. 무한 깊이.
export function enemiesForDepth(depth: number): DungeonEnemy[] {
  if (depth <= 1) return FLOOR1_ENEMIES;
  if (depth === 2) return FLOOR2_ENEMIES;
  if (depth <= 7) return BAND_A_CANYON_ENEMIES; // 밴드 A — 마른 협곡
  return FRONTIER_ENEMIES; // 8+ — 밴드 B 전까지 깊은 산 플레이스홀더
}

// 깊이 → 표시 이름. 1·2 = authored, 3~7 = 마른 협곡(밴드 A), 8+ = 미테마 프론티어.
export function depthName(depth: number): string {
  if (depth <= 1) return "들판";
  if (depth === 2) return "깊은 산";
  if (depth <= 7) return `마른 협곡 깊이 ${depth}`;
  return `프론티어 깊이 ${depth}`;
}
