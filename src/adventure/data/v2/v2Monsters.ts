import type { Monster } from "@/adventure/data/monsters/types";

// v2 전용 몬스터 카탈로그 — v2 사냥터(dungeon hunt)·훈련장(spar)이 쓰는 11종을 V1 MONSTERS
// 에서 분리해 v2 가 직접 소유한다. 옛 구조는 v2 가 V1 region/quest 몹을 stat 출처로 빌려 써서,
// v2 몹 하나 고치려 해도 "이게 V1 퀘스트랑 공유되나?"를 매번 확인해야 했다(예: 산적 궁수가
// 옛 노상강도 공유). 이제 v2 는 여기만 보면 된다.
//
// 규칙:
//   - 스탯/스킬만 보유. 표시 이름·초상화·속성은 dungeon.ts 의 DungeonEnemy 가 덮어쓴다.
//     (훈련 더미만 dungeon 을 안 거치고 직접 조회 → name/image 를 여기서 직접 쓴다.)
//   - drops 는 의도적으로 비움. v2 드랍은 몬스터별이 아니라 floor 풀(dungeonDrops/Equip/Unique)
//     기반이라 hunt 가 monster.drops 를 읽지 않는다. 옛 V1 드랍(재료/레시피 id)을 복사하면
//     V1 카탈로그로 다시 묶이므로 일부러 제외.
//   - key 는 dungeon.ts FLOOR*_ENEMIES 의 key 및 spar 의 V2_SPAR_DUMMY_ID 와 일치해야 한다.
export const V2_MONSTERS: Record<string, Monster> = {
  // ── 들판 (floor 1) — 온보딩 풀. 스킬·상태이상 없음. ──────────────────
  들개: { name: "들개", tags: ["beast"], hp: 38, atk: 3, def: 1, spd: 4, exp: 3 },
  두더지: { name: "두더지", tags: ["beast"], hp: 27, atk: 2, def: 0, spd: 3, exp: 2 },
  박쥐: { name: "박쥐", tags: ["beast"], hp: 49, atk: 5, def: 2, spd: 7, exp: 4 },
  동굴뱀: { name: "동굴뱀", tags: ["beast"], hp: 57, atk: 6, def: 2, spd: 5, exp: 5 },
  거미: { name: "거미", tags: ["beast"], hp: 72, atk: 7, def: 3, spd: 6, exp: 6 },

  // ── 깊은 산 (floor 2) ───────────────────────────────────────────────
  "떠돌이 약탈자": {
    name: "떠돌이 약탈자",
    tags: ["humanoid"],
    hp: 280,
    atk: 24,
    def: 11,
    spd: 6,
    exp: 28,
    skill: { kind: "pierce", name: "급소 노리기", armorPierce: 3 },
  },
  "산적 궁수": {
    name: "산적 궁수",
    tags: ["humanoid"],
    hp: 200,
    atk: 23,
    def: 7,
    spd: 8,
    exp: 24,
  },
  "절벽 늑대": {
    name: "절벽 늑대",
    tags: ["beast"],
    hp: 240,
    atk: 22,
    def: 9,
    spd: 7,
    exp: 22,
  },
  "부서진 골렘": {
    name: "부서진 골렘",
    tags: ["golem"],
    hp: 180,
    atk: 13,
    def: 6,
    spd: 2,
    exp: 14,
  },
  들소: {
    name: "들소",
    tags: ["beast"],
    hp: 320,
    atk: 25,
    def: 14,
    spd: 4,
    exp: 30,
    skill: { kind: "heavy_blow", name: "들이받기", everyPhases: 3, multiplier: 1.5 },
  },

  // ── 훈련장 허수아비 — dungeon 을 안 거치고 spar 가 직접 조회. HP 고정 샌드백. ──
  "훈련용 허수아비": {
    name: "훈련용 허수아비",
    tags: ["humanoid"],
    image: "/images/monster/scarecrow.webp",
    hp: 500000,
    atk: 4,
    def: 2,
    spd: 1,
    exp: 0,
  },
};

// 훈련장 더미 id — 옛 monsters/index 의 SPAR_DUMMY_ID 와 동일 키, v2 소유로 이관.
export const V2_SPAR_DUMMY_ID = "훈련용 허수아비";
