// v2 사냥터 — 2개 구역 (들판 → 깊은 산).
//
// 2026-06-03: 8구역(들판~창공의 옥좌) → 2구역으로 축소. 뒤 구역(숲/산/화산/설원/별빛 권역)
// 제거 — 사냥 가능 층은 1·2 뿐(hunt route VALID_FLOORS). DungeonFloorId 타입과
// FLOOR_DIFFICULTY/드랍·장비·유니크 풀의 3~8 키는 휴면으로 남김(도달 불가, 복원 용이).
//
// 표시 이름(name)은 지형에 맞춘 v2 고유 이름이고, 스탯/스킬 출처(key)는 라이브 MONSTERS.
// 둘이 분리돼 있어 출처가 무엇이든 지형에 맞는 이름을 붙인다.

import type {
  Dungeon,
  DungeonEnemy,
  DungeonFloor,
  DungeonFloorId,
} from "./types";
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

// === 구역별 난이도 = 사다리 제너레이터 ================================
// 난이도/exp 배율은 dungeonLadder(floorStatMult/DefMult/ExpMult)가 깊은 산(2) 앵커 대비
// 자동 산출 → scaleMonsterForFloor 가 적용. (옛 FLOOR_DIFFICULTY Record 폐지, 공식으로 일원화.)

// floors 3~8 — 사다리 자동 생성. 권장 파워 = floorPowerGate(§5.1, K=2 간격 40).
// ⚠️ 플레이스홀더: 몹은 깊은 산 풀 재사용·이름은 임시 테마. 추후 권역별 몹/아트/이름 테마링 필요.
const LADDER_FLOOR_NAMES: Record<number, string> = {
  3: "협곡",
  4: "빙하 지대",
  5: "화산",
  6: "고대 폐허",
  7: "심연",
  8: "정점",
};
const LADDER_FLOORS: DungeonFloor[] = (
  [3, 4, 5, 6, 7, 8] as DungeonFloorId[]
).map((id) => ({
  id,
  name: LADDER_FLOOR_NAMES[id],
  requirement: { kind: "power", min: floorPowerGate(id) },
  enemies: FLOOR2_ENEMIES,
}));

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
    ...LADDER_FLOORS,
  ],
};
