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

// 마른 협곡 — 땅·바람·번개 + 무. 능력 2/5(강타·관통). (테마 순서·깊이는 DUNGEON_THEMES)
const BAND_A_CANYON_ENEMIES: DungeonEnemy[] = [
  { key: "모래도마뱀", name: "모래도마뱀", image: "/images/monster/v2/canyon-sand-lizard.webp", element: "earth" },
  { key: "협곡 도적", name: "협곡 도적", image: "/images/monster/v2/canyon-bandit.webp" },
  { key: "바위 골렘", name: "바위 골렘", image: "/images/monster/v2/volcano-ash-golem.webp", element: "earth" },
  { key: "회오리 매", name: "회오리 매", image: "/images/monster/v2/volcano-firebird.webp", element: "wind" },
  { key: "스파크 전갈", name: "스파크 전갈", image: "/images/monster/v2/canyon-spark-scorpion.webp", element: "lightning" },
];

// 얼음 호수 — water·wind, 둔중·탱키. statusSkill 한기(둔화) ×2.
const BAND_B_LAKE_ENEMIES: DungeonEnemy[] = [
  { key: "서리 늑대", name: "서리 늑대", image: "/images/monster/v2/snow-leopard.webp", element: "water" },
  { key: "빙벽 골렘", name: "빙벽 골렘", image: "/images/monster/v2/snow-ice-colossus.webp", element: "water" },
  { key: "얼음 정령", name: "얼음 정령", image: "/images/monster/v2/snow-ice-sprite.webp", element: "water", statusSkill: "mob_chilling_touch" },
  { key: "눈보라 매", name: "눈보라 매", image: "/images/monster/v2/snow-blizzard-hunter.webp", element: "wind" },
  { key: "호수 망령", name: "호수 망령", image: "/images/monster/v2/snow-wraith.webp", element: "water", statusSkill: "mob_chilling_touch" },
];

// 심층 동굴 — earth·void, 기습(SPD 편차). 중독·출혈 첫 등장.
const BAND_C_CAVE_ENEMIES: DungeonEnemy[] = [
  { key: "동굴 거미", name: "동굴 거미", image: "/images/monster/v2/forest-crayfish.webp", element: "earth", statusSkill: "mob_venom_bite" },
  { key: "암반 골렘", name: "암반 골렘", image: "/images/monster/v2/mountain-spike-golem.webp", element: "earth" },
  { key: "박쥐 떼", name: "박쥐 떼", image: "/images/monster/v2/ruins-starlit-bat.webp", element: "wind" },
  { key: "심연 벌레", name: "심연 벌레", image: "/images/monster/v2/forest-thorn-vine.webp", element: "void" },
  { key: "동굴 포식자", name: "동굴 포식자", image: "/images/monster/v2/mountain-alpha-wolf.webp", element: "void", statusSkill: "mob_rending_claw" },
];

// 잊힌 성소 — starlight·earth, 마법 버스트(ATK 편차).
const BAND_D_SANCTUM_ENEMIES: DungeonEnemy[] = [
  { key: "수호 석상", name: "수호 석상", image: "/images/monster/v2/throne-guardian.webp", element: "earth" },
  { key: "성소 망령", name: "성소 망령", image: "/images/monster/v2/ruins-wraith.webp", element: "starlight", statusSkill: "mob_rending_claw" },
  { key: "빛의 정령", name: "빛의 정령", image: "/images/monster/v2/ruins-stardust-sprite.webp", element: "starlight" },
  { key: "타락한 사제", name: "타락한 사제", image: "/images/monster/v2/snow-frost-acolyte.webp", element: "starlight" },
  { key: "별빛 수문장", name: "별빛 수문장", image: "/images/monster/v2/throne-gatekeeper.webp", element: "starlight", statusSkill: "mob_chilling_touch" },
];

// 리자드 늪지 — water·earth, DoT 늪(중독·출혈 다수, 매 전투 독 압박).
const BAND_E_SWAMP_ENEMIES: DungeonEnemy[] = [
  { key: "리자드맨 전사", name: "리자드맨 전사", image: "/images/monster/v2/volcano-flame-lizard.webp", element: "earth" },
  { key: "늪 독수", name: "늪 독수", image: "/images/monster/v2/ruins-viper.webp", element: "water", statusSkill: "mob_venom_bite" },
  { key: "수렁 거머리", name: "수렁 거머리", image: "/images/monster/v2/field-slime.webp", element: "water", statusSkill: "mob_rending_claw" },
  { key: "독안개 정령", name: "독안개 정령", image: "/images/monster/v2/forest-water-sprite.webp", element: "water", statusSkill: "mob_venom_bite" },
  { key: "늪지 도마뱀왕", name: "늪지 도마뱀왕", image: "/images/monster/v2/forest-salamander.webp", element: "earth", statusSkill: "mob_venom_bite" },
];

// 짐승의 소굴 — 자연 혼합+void 정예, 고공격·관통 강. 능력 5/5. (마지막 테마 = 무한 반복)
const BAND_F_DEN_ENEMIES: DungeonEnemy[] = [
  { key: "거대 곰", name: "거대 곰", image: "/images/monster/v2/den-giant-bear.webp", element: "earth" },
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

// 사냥터 테마 순서 — 테마당 THEME_DEPTH_SPAN(6) 깊이씩. 들판·깊은 산 onboarding 풀도 6깊이.
// 마지막(짐승의 소굴)은 무한 반복(인덱스 클램프, 로컬 번호는 6 넘어 계속 증가). 표시는
// "테마명 + 테마 내 로컬 번호(1~)". 난이도는 테마 무관, 전역 깊이당 상승(dungeonLadder).
// 단일 소스 — enemiesForDepth/depthName 이 themeForDepth 에서 도출(경계 드리프트 방지).
export const THEME_DEPTH_SPAN = 6;
const DUNGEON_THEMES: { name: string; enemies: DungeonEnemy[] }[] = [
  { name: "들판", enemies: FLOOR1_ENEMIES }, // 깊이 1~6
  { name: "깊은 산", enemies: FLOOR2_ENEMIES }, // 7~12
  { name: "마른 협곡", enemies: BAND_A_CANYON_ENEMIES }, // 13~18
  { name: "얼음 호수", enemies: BAND_B_LAKE_ENEMIES }, // 19~24
  { name: "심층 동굴", enemies: BAND_C_CAVE_ENEMIES }, // 25~30
  { name: "잊힌 성소", enemies: BAND_D_SANCTUM_ENEMIES }, // 31~36
  { name: "리자드 늪지", enemies: BAND_E_SWAMP_ENEMIES }, // 37~42
  { name: "짐승의 소굴", enemies: BAND_F_DEN_ENEMIES }, // 43~48, 49+ 무한
];

// 깊이(1+) → 0-based 테마 인덱스(DUNGEON_THEMES). 마지막 테마(무한)는 클램프.
// 테마별 보스(dungeonBosses)가 깊이→테마 해석에 쓰는 공용 단일 소스.
export function themeIndexForDepth(depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  return Math.min(
    DUNGEON_THEMES.length - 1,
    Math.floor((d - 1) / THEME_DEPTH_SPAN),
  );
}

// 깊이(1+) → 테마 + 테마 내 로컬 번호. 마지막 테마는 인덱스 클램프(로컬 번호 무한 증가).
function themeForDepth(depth: number): {
  name: string;
  enemies: DungeonEnemy[];
  localIndex: number;
} {
  const d = Math.max(1, Math.floor(depth));
  const idx = themeIndexForDepth(d);
  return { ...DUNGEON_THEMES[idx], localIndex: d - idx * THEME_DEPTH_SPAN };
}

// 깊이 → 적 풀. 테마당 6깊이(들판·깊은 산 onboarding 포함). 무한 깊이.
export function enemiesForDepth(depth: number): DungeonEnemy[] {
  return themeForDepth(depth).enemies;
}

// 깊이 → 표시 이름. "테마명 + 테마 내 로컬 번호"(예: 들판 1·깊은 산 3·짐승의 소굴 7).
export function depthName(depth: number): string {
  const { name, localIndex } = themeForDepth(depth);
  return `${name} ${localIndex}`;
}

// 표시용 — 깊이 1..maxDepth 를 THEME_DEPTH_SPAN(6) 깊이 블록(=사냥터 카드)으로 묶는다. 사냥터
// 목록 2단 UI: 테마 카드 누르면 그 안에서 깊이 카드 6개. 무한 마지막 테마(짐승의 소굴)도 6깊이씩
// 블록 유지(이름은 클램프) → 한 블록당 항상 ≤6 깊이. 각 그룹 = { name, depths[] }.
export function dungeonThemeGroups(
  maxDepth: number,
): { name: string; depths: number[] }[] {
  const groups: { name: string; depths: number[] }[] = [];
  let curBlock = -1;
  const end = Math.max(1, Math.floor(maxDepth));
  for (let depth = 1; depth <= end; depth++) {
    const block = Math.floor((depth - 1) / THEME_DEPTH_SPAN);
    if (block !== curBlock) {
      curBlock = block;
      const name =
        DUNGEON_THEMES[Math.min(block, DUNGEON_THEMES.length - 1)].name;
      groups.push({ name, depths: [] });
    }
    groups[groups.length - 1].depths.push(depth);
  }
  return groups;
}

// 코덱스(모험의 서) 사냥터 도감용 — 깊이 1..maxDepth 가 닿는 테마를 테마당 1개로(들판/깊은 산/…),
//   각 테마의 깊이 범위 + 적 풀. depthEnd = 도달한 그 테마의 최고 깊이(= min(maxDepth, 테마 끝)) —
//   "그 사냥터를 처리했을 때 기준" 스탯 표시용 대표 깊이. 마지막 테마(짐승의 소굴, 무한)는 한 카드로
//   합쳐 중복 카드 방지. maxDepth < 1 이면 빈 배열(도달 전).
export function dungeonThemeCatalog(maxDepth: number): {
  name: string;
  depthStart: number;
  depthEnd: number;
  enemies: DungeonEnemy[];
}[] {
  const end = Math.floor(maxDepth);
  if (end < 1) return [];
  const lastBlock = DUNGEON_THEMES.length - 1;
  const reached = Math.min(lastBlock, Math.floor((end - 1) / THEME_DEPTH_SPAN));
  const out: {
    name: string;
    depthStart: number;
    depthEnd: number;
    enemies: DungeonEnemy[];
  }[] = [];
  for (let block = 0; block <= reached; block++) {
    const depthStart = block * THEME_DEPTH_SPAN + 1;
    // 마지막(무한) 테마는 maxDepth 까지 한 카드로, 그 외엔 테마 6깊이 끝(클램프).
    const depthEnd =
      block === lastBlock
        ? end
        : Math.min(end, depthStart + THEME_DEPTH_SPAN - 1);
    out.push({
      name: DUNGEON_THEMES[block].name,
      depthStart,
      depthEnd,
      enemies: DUNGEON_THEMES[block].enemies,
    });
  }
  return out;
}
