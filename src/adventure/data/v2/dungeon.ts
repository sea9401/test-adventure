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

// === 무한 프론티어 — 깊이 밴드 ========================================
// 단일 사냥터, 깊이(depth) 1→∞. 깊이 1=들판·2=깊은 산(authored)·3+=밴드별 테마 풀.
// 깊이별 스탯/exp/추천파워 = dungeonLadder 제너레이터(무한, ×1.0~). 수동 푸시: 깊이 1~최고도달+1.
// 밴드 = 베이스 평평(깊은 산 앵커)·깊이가 절대 강함 담당. 밴드는 속성·스탯 모양·스킬 밀도로 차별.
// 후반일수록 능력 밀도/개성 강화: A 2/5 → B 둔화 → C 기습 → D 마법버스트 → E DoT 늪 → F 정예.
// ⚠️ 아트는 기존 이미지 재사용(플레이스홀더, orphan snow/throne/runs/volcano 재활용) — 교체 예정.

// 밴드 A — 마른 협곡 (깊이 3~7). 땅·바람·번개 + 무. 능력 2/5(강타·관통).
const BAND_A_CANYON_ENEMIES: DungeonEnemy[] = [
  { key: "모래도마뱀", name: "모래도마뱀", image: "/images/monster/v2/field-grass-snake.webp", element: "earth" },
  { key: "협곡 도적", name: "협곡 도적", image: "/images/monster/v2/mountain-brigand.webp" },
  { key: "바위 골렘", name: "바위 골렘", image: "/images/monster/v2/volcano-ash-golem.webp", element: "earth" },
  { key: "회오리 매", name: "회오리 매", image: "/images/monster/v2/volcano-firebird.webp", element: "wind" },
  { key: "스파크 전갈", name: "스파크 전갈", image: "/images/monster/v2/field-spider.webp", element: "lightning" },
];

// 밴드 B — 얼음 호수 (깊이 8~14). water·wind, 둔중·탱키. statusSkill 한기(둔화) ×2.
const BAND_B_LAKE_ENEMIES: DungeonEnemy[] = [
  { key: "서리 늑대", name: "서리 늑대", image: "/images/monster/v2/snow-leopard.webp", element: "water" },
  { key: "빙벽 골렘", name: "빙벽 골렘", image: "/images/monster/v2/snow-ice-colossus.webp", element: "water" },
  { key: "얼음 정령", name: "얼음 정령", image: "/images/monster/v2/snow-ice-sprite.webp", element: "water", statusSkill: "mob_chilling_touch" },
  { key: "눈보라 매", name: "눈보라 매", image: "/images/monster/v2/snow-blizzard-hunter.webp", element: "wind" },
  { key: "호수 망령", name: "호수 망령", image: "/images/monster/v2/snow-wraith.webp", element: "water", statusSkill: "mob_chilling_touch" },
];

// 밴드 C — 심층 동굴 (깊이 15~21). earth·void, 기습(SPD 편차). 중독·출혈 첫 등장.
const BAND_C_CAVE_ENEMIES: DungeonEnemy[] = [
  { key: "동굴 거미", name: "동굴 거미", image: "/images/monster/v2/forest-crayfish.webp", element: "earth", statusSkill: "mob_venom_bite" },
  { key: "암반 골렘", name: "암반 골렘", image: "/images/monster/v2/mountain-spike-golem.webp", element: "earth" },
  { key: "박쥐 떼", name: "박쥐 떼", image: "/images/monster/v2/ruins-starlit-bat.webp", element: "wind" },
  { key: "심연 벌레", name: "심연 벌레", image: "/images/monster/v2/forest-thorn-vine.webp", element: "void" },
  { key: "동굴 포식자", name: "동굴 포식자", image: "/images/monster/v2/mountain-alpha-wolf.webp", element: "void", statusSkill: "mob_rending_claw" },
];

// 밴드 D — 잊힌 성소 (깊이 22~28). starlight·earth, 마법 버스트(ATK 편차).
const BAND_D_SANCTUM_ENEMIES: DungeonEnemy[] = [
  { key: "수호 석상", name: "수호 석상", image: "/images/monster/v2/throne-guardian.webp", element: "earth" },
  { key: "성소 망령", name: "성소 망령", image: "/images/monster/v2/ruins-wraith.webp", element: "starlight", statusSkill: "mob_rending_claw" },
  { key: "빛의 정령", name: "빛의 정령", image: "/images/monster/v2/ruins-stardust-sprite.webp", element: "starlight" },
  { key: "타락한 사제", name: "타락한 사제", image: "/images/monster/v2/snow-frost-acolyte.webp", element: "starlight" },
  { key: "별빛 수문장", name: "별빛 수문장", image: "/images/monster/v2/throne-gatekeeper.webp", element: "starlight", statusSkill: "mob_chilling_touch" },
];

// 밴드 E — 리자드 늪지 (깊이 29~35). water·earth, DoT 늪(중독·출혈 다수, 매 전투 독 압박).
const BAND_E_SWAMP_ENEMIES: DungeonEnemy[] = [
  { key: "리자드맨 전사", name: "리자드맨 전사", image: "/images/monster/v2/volcano-flame-lizard.webp", element: "earth" },
  { key: "늪 독수", name: "늪 독수", image: "/images/monster/v2/ruins-viper.webp", element: "water", statusSkill: "mob_venom_bite" },
  { key: "수렁 거머리", name: "수렁 거머리", image: "/images/monster/v2/field-slime.webp", element: "water", statusSkill: "mob_rending_claw" },
  { key: "독안개 정령", name: "독안개 정령", image: "/images/monster/v2/forest-water-sprite.webp", element: "water", statusSkill: "mob_venom_bite" },
  { key: "늪지 도마뱀왕", name: "늪지 도마뱀왕", image: "/images/monster/v2/forest-salamander.webp", element: "earth", statusSkill: "mob_venom_bite" },
];

// 밴드 F — 짐승의 소굴 (깊이 36+, 무한 반복). 자연 혼합+void 정예, 고공격·관통 강. 능력 5/5.
const BAND_F_DEN_ENEMIES: DungeonEnemy[] = [
  { key: "거대 곰", name: "거대 곰", image: "/images/monster/v2/forest-bear.webp", element: "earth" },
  { key: "우두머리 늑대", name: "우두머리 늑대", image: "/images/monster/v2/forest-grey-wolf.webp", element: "wind", statusSkill: "mob_rending_claw" },
  { key: "화염 표범", name: "화염 표범", image: "/images/monster/v2/field-wildcat.webp", element: "fire" },
  { key: "뇌격 들소", name: "뇌격 들소", image: "/images/monster/v2/forest-boar.webp", element: "lightning" },
  { key: "공허 야수", name: "공허 야수", image: "/images/monster/v2/volcano-ash-hound.webp", element: "void", statusSkill: "mob_rending_claw" },
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

// 깊이 → 적 풀. 1=들판·2=깊은 산(authored)·3+=밴드 A~F. F(36+)는 무한 반복. 무한 깊이.
export function enemiesForDepth(depth: number): DungeonEnemy[] {
  if (depth <= 1) return FLOOR1_ENEMIES;
  if (depth === 2) return FLOOR2_ENEMIES;
  if (depth <= 7) return BAND_A_CANYON_ENEMIES; // A 마른 협곡 (3~7)
  if (depth <= 14) return BAND_B_LAKE_ENEMIES; // B 얼음 호수 (8~14)
  if (depth <= 21) return BAND_C_CAVE_ENEMIES; // C 심층 동굴 (15~21)
  if (depth <= 28) return BAND_D_SANCTUM_ENEMIES; // D 잊힌 성소 (22~28)
  if (depth <= 35) return BAND_E_SWAMP_ENEMIES; // E 리자드 늪지 (29~35)
  return BAND_F_DEN_ENEMIES; // F 짐승의 소굴 (36+, 무한 반복)
}

// 깊이 → 표시 이름. 1·2 = authored, 3+ = 밴드 테마 이름 + 깊이.
export function depthName(depth: number): string {
  if (depth <= 1) return "들판";
  if (depth === 2) return "깊은 산";
  if (depth <= 7) return `마른 협곡 깊이 ${depth}`;
  if (depth <= 14) return `얼음 호수 깊이 ${depth}`;
  if (depth <= 21) return `심층 동굴 깊이 ${depth}`;
  if (depth <= 28) return `잊힌 성소 깊이 ${depth}`;
  if (depth <= 35) return `리자드 늪지 깊이 ${depth}`;
  return `짐승의 소굴 깊이 ${depth}`;
}
