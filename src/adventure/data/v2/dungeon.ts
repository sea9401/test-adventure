// v2 사냥터 — 들판(authored 온보딩) + 프론티어 밴드(마지막 테마에서 끝, MAX_FRONTIER_DEPTH).
//
// 2026-06-19: "깊은 산"(옛 2번째 테마, 깊이 7~12) 삭제 — 다른 테마와 몹/아이템이 겹쳐
// 정리. 이후 테마가 6깊이씩 앞으로 당겨짐(마른 협곡 7~12·얼음 호수 13~18·…). 들판만
// authored 온보딩 풀, 7+ 부터 밴드 테마(DUNGEON_THEMES). 난이도 곡선은 dungeonLadder.
//
// 표시 이름(name)은 지형에 맞춘 v2 고유 이름이고, 스탯/스킬 출처(key)는 라이브 MONSTERS.
// 둘이 분리돼 있어 출처가 무엇이든 지형에 맞는 이름을 붙인다.

import type { Dungeon, DungeonEnemy } from "./types";
import { counterElementOf, type V2Element } from "./elements";
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

// === 프론티어 — 깊이 밴드 ========================================
// 단일 사냥터, 깊이(depth) 1~MAX_FRONTIER_DEPTH(마지막 테마 끝). 깊이 1~6=들판(authored)·7+=밴드별 테마 풀.
// 깊이별 스탯/exp/추천파워 = dungeonLadder 제너레이터(×1.0~). 수동 푸시: 깊이 1~최고도달+1(캡까지).
// 밴드 = 베이스 평평(들판 앵커)·깊이가 절대 강함 담당. 밴드는 속성·스탯 모양·스킬 밀도로 차별.
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
  { key: "얼음 정령", name: "얼음 정령", image: "/images/monster/v2/snow-ice-sprite.webp", element: "water", statusSkill: "mob_chilling_touch", castSkill: "mob_arcane_bolt" },
  { key: "눈보라 매", name: "눈보라 매", image: "/images/monster/v2/snow-blizzard-hunter.webp", element: "wind" },
  { key: "호수 망령", name: "호수 망령", image: "/images/monster/v2/snow-wraith.webp", element: "water", statusSkill: "mob_chilling_touch", castSkill: "mob_arcane_bolt" },
];

// 심층 동굴 — earth·void, 기습(SPD 편차). 중독·출혈 첫 등장.
const BAND_C_CAVE_ENEMIES: DungeonEnemy[] = [
  { key: "동굴 거미", name: "동굴 거미", image: "/images/monster/v2/forest-crayfish.webp", element: "earth", statusSkill: "mob_venom_bite" },
  { key: "암반 골렘", name: "암반 골렘", image: "/images/monster/v2/mountain-spike-golem.webp", element: "earth" },
  // wind→earth(2026-06-12): 테마 주 속성(earth) 3종 확보 — "정답 속성"(공허) 명확화.
  { key: "박쥐 떼", name: "박쥐 떼", image: "/images/monster/v2/ruins-starlit-bat.webp", element: "earth" },
  { key: "심연 벌레", name: "심연 벌레", image: "/images/monster/v2/forest-thorn-vine.webp", element: "void" },
  { key: "동굴 포식자", name: "동굴 포식자", image: "/images/monster/v2/mountain-alpha-wolf.webp", element: "void", statusSkill: "mob_rending_claw" },
];

// 잊힌 성소 — starlight·earth, 마법 버스트(ATK 편차).
const BAND_D_SANCTUM_ENEMIES: DungeonEnemy[] = [
  { key: "수호 석상", name: "수호 석상", image: "/images/monster/v2/throne-guardian.webp", element: "earth" },
  { key: "성소 망령", name: "성소 망령", image: "/images/monster/v2/ruins-wraith.webp", element: "starlight", statusSkill: "mob_rending_claw", castSkill: "mob_arcane_burst" },
  { key: "빛의 정령", name: "빛의 정령", image: "/images/monster/v2/ruins-stardust-sprite.webp", element: "starlight" },
  { key: "타락한 사제", name: "타락한 사제", image: "/images/monster/v2/snow-frost-acolyte.webp", element: "starlight" },
  { key: "별빛 수문장", name: "별빛 수문장", image: "/images/monster/v2/throne-gatekeeper.webp", element: "starlight", statusSkill: "mob_chilling_touch" },
];

// 리자드 늪지 — water·earth, DoT 늪(중독·출혈 다수, 매 전투 독 압박).
const BAND_E_SWAMP_ENEMIES: DungeonEnemy[] = [
  { key: "리자드맨 전사", name: "리자드맨 전사", image: "/images/monster/v2/volcano-flame-lizard.webp", element: "earth" },
  { key: "늪 독수", name: "늪 독수", image: "/images/monster/v2/ruins-viper.webp", element: "water", statusSkill: "mob_venom_bite" },
  { key: "수렁 거머리", name: "수렁 거머리", image: "/images/monster/v2/field-slime.webp", element: "water", statusSkill: "mob_rending_claw" },
  { key: "독안개 정령", name: "독안개 정령", image: "/images/monster/v2/forest-water-sprite.webp", element: "water", statusSkill: "mob_venom_bite", castSkill: "mob_arcane_bolt" },
  { key: "늪지 도마뱀왕", name: "늪지 도마뱀왕", image: "/images/monster/v2/forest-salamander.webp", element: "earth", statusSkill: "mob_venom_bite" },
];

// 짐승의 소굴 — 자연 혼합+void 정예, 고공격·관통 강. 능력 5/5. (마지막 테마 = 현재 프론티어 끝)
const BAND_F_DEN_ENEMIES: DungeonEnemy[] = [
  { key: "거대 곰", name: "거대 곰", image: "/images/monster/v2/den-giant-bear.webp", element: "earth" },
  { key: "우두머리 늑대", name: "우두머리 늑대", image: "/images/monster/v2/forest-grey-wolf.webp", element: "wind", statusSkill: "mob_rending_claw" },
  { key: "화염 표범", name: "화염 표범", image: "/images/monster/v2/field-wildcat.webp", element: "fire" },
  { key: "뇌격 들소", name: "뇌격 들소", image: "/images/monster/v2/forest-boar.webp", element: "lightning" },
  { key: "공허 야수", name: "공허 야수", image: "/images/monster/v2/volcano-ash-hound.webp", element: "void", statusSkill: "mob_rending_claw" },
];

// 들판 = 깊이 1~6 의 고유(authored) 풀. element 분포 게이트·온보딩 보호.
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
  ],
};

// 사냥터 테마 순서 — 테마당 THEME_DEPTH_SPAN(6) 깊이씩. 들판 onboarding 풀도 6깊이.
// 마지막 테마(짐승의 소굴)에서 프론티어가 끝난다(MAX_FRONTIER_DEPTH·무한 반복 안 함). 표시는
// "테마명 + 테마 내 로컬 번호(1~6)". 난이도는 테마 무관, 전역 깊이당 상승(dungeonLadder).
// 단일 소스 — enemiesForDepth/depthName 이 themeForDepth 에서 도출(경계 드리프트 방지).
// 2026-06-19: "깊은 산"(옛 7~12) 삭제 → 마른 협곡부터 6깊이씩 앞으로 당겨짐.
export const THEME_DEPTH_SPAN = 6;
const DUNGEON_THEMES: { name: string; enemies: DungeonEnemy[] }[] = [
  { name: "들판", enemies: FLOOR1_ENEMIES }, // 깊이 1~6
  { name: "마른 협곡", enemies: BAND_A_CANYON_ENEMIES }, // 7~12
  { name: "얼음 호수", enemies: BAND_B_LAKE_ENEMIES }, // 13~18
  { name: "심층 동굴", enemies: BAND_C_CAVE_ENEMIES }, // 19~24
  { name: "잊힌 성소", enemies: BAND_D_SANCTUM_ENEMIES }, // 25~30
  { name: "리자드 늪지", enemies: BAND_E_SWAMP_ENEMIES }, // 31~36
  { name: "짐승의 소굴", enemies: BAND_F_DEN_ENEMIES }, // 37~42 (마지막 테마 = 프론티어 끝)
];

// 프론티어 최대 깊이 = 마지막 테마의 끝(테마수 × 6). 2026-06-19 오너 결정 = 마지막 테마를
// 무한 반복하지 않고 여기서 끝낸다(짐승의 소굴 6깊이까지). 더 깊은 사냥터가 필요하면 새 테마를
// DUNGEON_THEMES 에 추가 → 이 캡이 자동으로 늘어난다. 깊이 게이트(hunt route)·UI 가 이 값으로 캡.
export const MAX_FRONTIER_DEPTH = DUNGEON_THEMES.length * THEME_DEPTH_SPAN;

// 깊이(1+) → 0-based 테마 인덱스(DUNGEON_THEMES). 캡(MAX_FRONTIER_DEPTH) 밖은 방어적으로 마지막
// 테마로 클램프(게이트가 이미 막아 실제로는 도달 불가). 깊이→테마 해석의 공용 단일 소스.
export function themeIndexForDepth(depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  return Math.min(
    DUNGEON_THEMES.length - 1,
    Math.floor((d - 1) / THEME_DEPTH_SPAN),
  );
}

// 깊이(1+) → 그 깊이가 속한 테마 블록의 첫 깊이(예: 깊이 10 → 7). 사냥터 목록(V2DungeonList)이
// 테마를 블록 첫 깊이(g.depths[0])로 식별하므로, 사냥터에서 "뒤로 = 그 테마의 깊이 선택" 으로
// 보낼 때 이 값을 openDepth 로 넘긴다.
export function themeFirstDepth(depth: number): number {
  return themeIndexForDepth(depth) * THEME_DEPTH_SPAN + 1;
}

// 깊이(1+) → 테마 + 테마 내 로컬 번호. 마지막 테마는 인덱스 클램프(캡 밖 방어용·도달 불가).
function themeForDepth(depth: number): {
  name: string;
  enemies: DungeonEnemy[];
  localIndex: number;
} {
  const d = Math.max(1, Math.floor(depth));
  const idx = themeIndexForDepth(d);
  return { ...DUNGEON_THEMES[idx], localIndex: d - idx * THEME_DEPTH_SPAN };
}

// 깊이 → 적 풀. 테마당 6깊이(들판 onboarding 포함, 7+ 밴드). 깊이 1~MAX_FRONTIER_DEPTH.
export function enemiesForDepth(depth: number): DungeonEnemy[] {
  return themeForDepth(depth).enemies;
}

// 깊이 → 표시 이름. "테마명 + 테마 내 로컬 번호"(예: 들판 1·마른 협곡 3·짐승의 소굴 6).
// 테마 속성 요약 — 몹 속성 분포(빈도순·무속성 제외)와 "추천 속성"(최빈 속성을
// 카운터하는 픽, 최빈이 3종 이상일 때만 — 혼합 밴드는 정답 없음). 약점찌르기(+25%)
// 가 "어느 속성을 들고 갈까"가 되도록 사냥터 목록이 노출한다.
export function themeElementSummary(depth: number): {
  elements: V2Element[];
  recommended: V2Element | null;
} {
  const counts = new Map<V2Element, number>();
  for (const e of enemiesForDepth(depth)) {
    if (!e.element || e.element === "neutral") continue;
    counts.set(e.element, (counts.get(e.element) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  return {
    elements: sorted.map(([el]) => el),
    recommended: top && top[1] >= 3 ? counterElementOf(top[0]) : null,
  };
}

export function depthName(depth: number): string {
  const { name, localIndex } = themeForDepth(depth);
  return `${name} ${localIndex}`;
}

// 표시용 — 깊이 1..maxDepth 를 THEME_DEPTH_SPAN(6) 깊이 블록(=사냥터 카드)으로 묶는다. 사냥터
// 목록 2단 UI: 테마 카드 누르면 그 안에서 깊이 카드 6개. 캡(MAX_FRONTIER_DEPTH) 밖이 들어와도
// 6깊이씩 블록 유지(이름은 클램프) → 한 블록당 항상 ≤6 깊이. 각 그룹 = { name, depths[] }.
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

// 코덱스(모험의 서) 사냥터 도감용 — 깊이 1..maxDepth 가 닿는 테마를 테마당 1개로(들판/마른 협곡/…),
//   각 테마의 깊이 범위 + 적 풀. depthEnd = 도달한 그 테마의 최고 깊이(= min(maxDepth, 테마 끝)) —
//   "그 사냥터를 처리했을 때 기준" 스탯 표시용 대표 깊이. 마지막 테마(짐승의 소굴)는 한 카드로
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
    // 마지막 테마는 maxDepth 까지 한 카드로(캡 밖이 들어와도 클램프), 그 외엔 테마 6깊이 끝.
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
