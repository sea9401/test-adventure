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

  // ── 프론티어 밴드 A — 마른 협곡 (깊이 3~7). 깊은 산 앵커 스케일(깊이가 배율↑). ──────
  모래도마뱀: {
    name: "모래도마뱀",
    tags: ["beast"],
    hp: 220,
    atk: 18,
    def: 9,
    spd: 6,
    exp: 20,
  },
  "협곡 도적": {
    name: "협곡 도적",
    tags: ["humanoid"],
    hp: 195,
    atk: 23,
    def: 6,
    spd: 7,
    exp: 22,
  },
  "바위 골렘": {
    name: "바위 골렘",
    tags: ["golem"],
    hp: 330,
    atk: 16,
    def: 14,
    spd: 2,
    exp: 26,
    skill: { kind: "heavy_blow", name: "내리찍기", everyPhases: 3, multiplier: 1.5 },
  },
  "회오리 매": {
    name: "회오리 매",
    tags: ["beast"],
    hp: 160,
    atk: 20,
    def: 5,
    spd: 9,
    exp: 21,
  },
  "스파크 전갈": {
    name: "스파크 전갈",
    tags: ["beast"],
    hp: 210,
    atk: 19,
    def: 8,
    spd: 6,
    exp: 22,
    skill: { kind: "pierce", name: "독침", armorPierce: 3 },
  },

  // ── 프론티어 밴드 B — 얼음 호수 (깊이 8~14). water·wind, 둔중·탱키. ──────
  "서리 늑대": { name: "서리 늑대", tags: ["beast"], hp: 250, atk: 20, def: 10, spd: 6, exp: 23 },
  "빙벽 골렘": {
    name: "빙벽 골렘",
    tags: ["golem"],
    hp: 360,
    atk: 15,
    def: 16,
    spd: 2,
    exp: 27,
    skill: { kind: "heavy_blow", name: "내리찍기", everyPhases: 3, multiplier: 1.5 },
  },
  "얼음 정령": { name: "얼음 정령", tags: ["spirit"], hp: 200, atk: 22, def: 8, spd: 4, exp: 23 },
  "눈보라 매": { name: "눈보라 매", tags: ["beast"], hp: 170, atk: 21, def: 6, spd: 8, exp: 22 },
  "호수 망령": { name: "호수 망령", tags: ["undead"], hp: 240, atk: 19, def: 9, spd: 5, exp: 25 },

  // ── 프론티어 밴드 C — 심층 동굴 (깊이 15~21). earth·void, 기습·혼합. ──────
  "동굴 거미": { name: "동굴 거미", tags: ["beast"], hp: 175, atk: 21, def: 6, spd: 9, exp: 23 },
  "암반 골렘": {
    name: "암반 골렘",
    tags: ["golem"],
    hp: 350,
    atk: 16,
    def: 16,
    spd: 2,
    exp: 28,
    skill: { kind: "heavy_blow", name: "내리찍기", everyPhases: 3, multiplier: 1.5 },
  },
  "박쥐 떼": { name: "박쥐 떼", tags: ["beast"], hp: 150, atk: 20, def: 4, spd: 9, exp: 21 },
  "심연 벌레": {
    name: "심연 벌레",
    tags: ["beast"],
    hp: 250,
    atk: 20,
    def: 10,
    spd: 6,
    exp: 25,
    skill: { kind: "pierce", name: "파고들기", armorPierce: 4 },
  },
  "동굴 포식자": { name: "동굴 포식자", tags: ["beast"], hp: 260, atk: 24, def: 10, spd: 6, exp: 27 },

  // ── 프론티어 밴드 D — 잊힌 성소 (깊이 22~28). starlight·earth, 마법 버스트. ──────
  "수호 석상": {
    name: "수호 석상",
    tags: ["golem"],
    hp: 340,
    atk: 17,
    def: 16,
    spd: 3,
    exp: 28,
    skill: { kind: "heavy_blow", name: "내리찍기", everyPhases: 3, multiplier: 1.5 },
  },
  "성소 망령": { name: "성소 망령", tags: ["undead"], hp: 190, atk: 25, def: 6, spd: 6, exp: 25 },
  "빛의 정령": {
    name: "빛의 정령",
    tags: ["spirit"],
    hp: 210,
    atk: 22,
    def: 8,
    spd: 6,
    exp: 25,
    skill: { kind: "pierce", name: "신성 관통", armorPierce: 3 },
  },
  "타락한 사제": {
    name: "타락한 사제",
    tags: ["humanoid"],
    hp: 200,
    atk: 24,
    def: 7,
    spd: 6,
    exp: 26,
    skill: { kind: "pierce", name: "신성 일격", armorPierce: 4 },
  },
  "별빛 수문장": {
    name: "별빛 수문장",
    tags: ["golem"],
    hp: 350,
    atk: 18,
    def: 15,
    spd: 3,
    exp: 30,
    skill: { kind: "heavy_blow", name: "내리찍기", everyPhases: 3, multiplier: 1.5 },
  },

  // ── 프론티어 밴드 E — 리자드 늪지 (깊이 29~35). water·earth, DoT 늪. ──────
  "리자드맨 전사": {
    name: "리자드맨 전사",
    tags: ["humanoid"],
    hp: 250,
    atk: 23,
    def: 11,
    spd: 6,
    exp: 26,
    skill: { kind: "pierce", name: "창 찌르기", armorPierce: 3 },
  },
  "늪 독수": { name: "늪 독수", tags: ["beast"], hp: 230, atk: 20, def: 8, spd: 6, exp: 25 },
  "수렁 거머리": { name: "수렁 거머리", tags: ["slime"], hp: 300, atk: 16, def: 13, spd: 3, exp: 27 },
  "독안개 정령": { name: "독안개 정령", tags: ["spirit"], hp: 185, atk: 23, def: 6, spd: 7, exp: 24 },
  "늪지 도마뱀왕": {
    name: "늪지 도마뱀왕",
    tags: ["dragon"],
    hp: 290,
    atk: 25,
    def: 13,
    spd: 5,
    exp: 30,
    skill: { kind: "heavy_blow", name: "꼬리치기", everyPhases: 3, multiplier: 1.5 },
  },

  // ── 프론티어 밴드 F — 짐승의 소굴 (깊이 36+). 자연 혼합+void 정예, 고공격·관통 강. ──────
  "거대 곰": {
    name: "거대 곰",
    tags: ["beast"],
    hp: 350,
    atk: 19,
    def: 15,
    spd: 3,
    exp: 29,
    skill: { kind: "heavy_blow", name: "후려치기", everyPhases: 3, multiplier: 1.5 },
  },
  "우두머리 늑대": {
    name: "우두머리 늑대",
    tags: ["beast"],
    hp: 270,
    atk: 24,
    def: 9,
    spd: 8,
    exp: 28,
    skill: { kind: "pierce", name: "송곳니", armorPierce: 4 },
  },
  "화염 표범": {
    name: "화염 표범",
    tags: ["beast"],
    hp: 210,
    atk: 26,
    def: 6,
    spd: 7,
    exp: 27,
    skill: { kind: "pierce", name: "할퀴기", armorPierce: 4 },
  },
  "뇌격 들소": {
    name: "뇌격 들소",
    tags: ["beast"],
    hp: 330,
    atk: 21,
    def: 14,
    spd: 4,
    exp: 30,
    skill: { kind: "heavy_blow", name: "들이받기", everyPhases: 3, multiplier: 1.6 },
  },
  "공허 야수": {
    name: "공허 야수",
    tags: ["beast"],
    hp: 290,
    atk: 25,
    def: 12,
    spd: 6,
    exp: 32,
    skill: { kind: "pierce", name: "그림자 발톱", armorPierce: 5 },
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
