// v2 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 신규 플레이어를 "첫 전투 → 장비 → 전직 →
// 수행 → 프론티어" 순서로 리드하고, 콘텐츠/사회 시스템 + 엔드 마일스톤을 안내.
//
// 표시 정책: 전직 퀘스트는 목표 차수를 명시한다. 특히 튜토리얼 배너는 제목만 보일 때가 있어
//   "2차 전직", "3차 전직" 같은 표현을 title/desc 양쪽에 남긴다.
//
// 핵심 설계:
//   ① 완료 판정은 **세이브 상태에서 자동 감지**(QuestCtx). 별도 "수락/제출" 없음 — 자연스럽게
//      달성하면 ✅. 보상만 "받기" 버튼으로 수령(중복 방지 = claimed 집합).
//   ② 라인 = 퀘스트 묶음. sequential 라인은 앞 퀘스트가 끝나야 다음이 열리는 리드(성장의 길·전쟁의 길).
//      비-sequential 라인은 각 마일스톤 독립(정점을 향해·모험가의 길).
//   ③ **직업 전용 라인**(classOnly) — 현 직군에게만 보이는 라인용 메커니즘. 현재 사용하는 데이터는
//      없으나(직업 차수 라인 제거), 추후 직군 한정 콘텐츠에 재사용할 수 있어 로직은 보존.
//   ④ 순수 함수 — ctx + claimed 집합 → 각 퀘스트 status. 서버/클라 공용, 테스트 가능.
//
// 진행도 source(서버 집계, lib/server/v2QuestContext.ts):
//   level·frontierDepth·class = character.v2 / cultivations = proficiency.v2 / tier = 직업 카탈로그
//   battleCount·bossKills = adventure-log.v2 / equippedCount·uniqueOwned = equipment.v2
//   hasGuild = guildMembers / hasTraded = marketplace_listings_v2 / arenaPlayed = arena-history.v2

import type { V2EquipmentId } from "./v2Equipment";
import type { V2Class } from "./classes";
import { V2_LEVEL_CAP } from "./coreLoopConfig";
import type { TitleId } from "../titles";

export type QuestLineId = string;

export type QuestReward = {
  /** 골드(HP 회복 통화 겸용). */
  gold?: number;
  /** 장비 1개 지급(스타터 장비 — 카탈로그 스탯, 굴림 없음). */
  equip?: V2EquipmentId;
  /** 스태미나 회복약 N개 지급(stamina-potions.v1 — 번들 보상과 동일 소비템). */
  staminaPotions?: number;
  /** 칭호 1개 지급(adventure-log.v2.titles — 이미 보유 중이면 no-op). */
  titleId?: TitleId;
};

// 퀘스트 완료 판정에 쓰는 플레이어 진행 상태. 전부 세이브/DB 에서 파생(서버 집계).
export type QuestCtx = {
  /** 현 직군(전사/무도가/마법사/도적/none). 직업 전용 라인 가시성 판정. */
  class: V2Class;
  level: number;
  /** 현 직업의 차수(1~4) = 직업 카탈로그 tier(jobIdFromLegacy). 전직 진행 신호. */
  tier: number;
  /** 누적 전투 수(킬 + 패배). adventure-log.v2. */
  battleCount: number;
  /** 도달한 사냥터 깊이. character.v2.frontierDepth. */
  frontierDepth: number;
  /** 장착 중인 장비 슬롯 수. equipment.v2.equipped. */
  equippedCount: number;
  /** 보유 유니크 장비 수. equipment.v2.owned 중 rarity:unique. */
  uniqueOwned: number;
  /** 수행 횟수. proficiency.v2 groups[group].cultivations. */
  cultivations: number;
  /** 처치한 협동 보스 수. adventure-log.v2.coopBossKinds + 레거시 칭호 보유분. */
  bossKills: number;
  /** 길드 소속 여부. guildMembers. */
  hasGuild: boolean;
  /** 거래소 거래 성사 경험(구매/판매). marketplace_listings_v2 status='sold'. */
  hasTraded: boolean;
  /** 투기장 전투 기록 ≥1. arena-history.v2. */
  arenaPlayed: boolean;
  /** 투기장 승리 수. arena-history.v2 outcome==='win'. */
  arenaWins: number;
  /** 보유 골드. character.v2.gold. */
  gold: number;
  /** 발견한 거점 수. character.v2.discoveredOutpostIds. */
  outpostsDiscovered: number;
  /** 획득한 칭호 수. adventure-log.v2.titles. */
  titleCount: number;
  // ── 확장 신호(2026-06-11, 라인 4종 추가) ─────────────────────────────────
  /** 총 직업 숙련도(전 직군 합·환생 보존). proficiency totalCumLevel. */
  cumLevel: number;
  /** 환생(재전직) 횟수 — advance-class 환생마다 +1. proficiency.reincarnations. "다시 태어나다" 판정. */
  reincarnations: number;
  /** 처치한 몬스터 종 수(kills>0 인 키 수). adventure-log.v2.monsters. */
  speciesKilled: number;
  /** 거점 점령 시도 경험. outpost_claim_attempts attacker=me ≥1. */
  claimAttempted: boolean;
  /** 내 길드가 현재 점령 중인 거점 존재. outpost_occupations. */
  hasOutpost: boolean;
  /** 공성/점령 승리 수. outpost_claim_attempts attacker=me won. */
  siegeWins: number;
  /** 점령/함락 성공 누적(소유권 획득). adventure-log.v2.warCaptures. */
  warCaptures: number;
  /** 침입자 토벌 승리 누적. adventure-log.v2.warEjectWins. */
  warEjectWins: number;
  /** 거점 금고 회수 골드 누적(자동+수동). adventure-log.v2.warTreasuryGold. */
  warTreasuryGold: number;
  /** 낚시 도감 어종 수. fishing-codex.v1. */
  fishSpecies: number;
  /** 보유 장비 중 최고 강화 레벨. equipment.v2 owned[].enhance. */
  maxEnhanceLevel: number;
  /** 보유 강화석 합(붉은+푸른). character.v2.materials. */
  enhanceStones: number;
  /** 은행(금고) 예치 골드. character.v2.bankedGold. */
  bankedGold: number;
  /** 로드아웃에 장착한 스킬 수. skills.v2.equipped. */
  skillsEquipped: number;
  /** 학습한 스킬 수. skills.v2.learned. */
  skillsLearned: number;
  /** 치료소에서 골드로 HP 회복을 한 적 있는가. character.v2.hasHealed. */
  hasHealed: boolean;
  /** 상점에서 구매(장비/충전)를 한 적 있는가. character.v2.hasShopped. */
  hasShopped: boolean;
  /** 지도에서 한 번이라도 이동했는가. character.v2.tilePos.at(이동 시각)이 찍혔으면 true(신규는 미설정). */
  hasMoved: boolean;
  /** 길드 제작소 제작 완료 횟수. crafting.v2.workshopStats.totalCrafts. */
  workshopCrafts: number;
  /** 길드 제작소 ★ 품질 제작 성공 횟수. crafting.v2.workshopStats.qualityCrafts. */
  workshopQualityCrafts: number;
  /** 대장장이 장인 레벨. crafting.v2.artisan.blacksmith. */
  blacksmithLevel: number;
  /** 농장 레벨과 누적 기록. farm.v1. */
  farmingLevel: number;
  farmHarvests: number;
  farmRareHarvests: number;
  farmDeliveries: number;
  farmReputationEarned: number;
  /** 벌목 레벨과 누적 기록. woodcutting-log.v1. */
  woodcuttingLevel: number;
  woodcuttingCuts: number;
  woodcuttingPerfectCuts: number;
  woodcuttingBestCombo: number;
  woodcuttingSpecies: number;
  /** 채광 레벨과 누적 기록. mining-log.v1. */
  miningLevel: number;
  miningSuccesses: number;
  miningByproducts: number;
  miningSpecies: number;
  /** 낚시 레벨과 누적 어획. fishing-progression.v1. */
  fishingLevel: number;
  fishCaught: number;
  /** 장비 도감 등록 현황. equipment-codex.v1. */
  equipmentCodexRegistered: number;
  equipmentCodexTotal: number;
  /** 숙련의 탑 최고 층과 격자 던전 최근 클리어 기록. */
  masteryTowerFloor: number;
  gridDungeonClears: number;
};

export type QuestDef = {
  id: string;
  line: QuestLineId;
  title: string;
  /** 무엇을 하면 되는지(행동 안내). */
  desc: string;
  reward: QuestReward;
  /** 완료 판정 — 세이브 파생 ctx 로. */
  check: (c: QuestCtx) => boolean;
  /** 영구 업적 점수. 튜토리얼에는 지정하지 않는다. */
  points?: number;
  /** 수치형 업적의 현재 진행도와 목표. */
  progress?: (c: QuestCtx) => number;
  goal?: number;
  /** 체인 — 같은 내용·증가 목표 마일스톤 묶음. 정의 순서대로 "현재 단계"만 노출
   *  (앞 단계 수령 시 다음 등장 — 잠금 표시도 없이 숨김, 패널 난잡함 방지). */
  chain?: string;
};

export type QuestLine = {
  id: QuestLineId;
  name: string;
  subtitle: string;
  /** true = 앞 퀘스트 완료해야 다음이 열림(리드). false = 마일스톤 독립. */
  sequential: boolean;
  /** 지정 시 그 직군에게만 보이는 라인(직업 전용). */
  classOnly?: V2Class;
  /** true = 퀘스트 화면 "튜토리얼" 탭에 노출(기본 조작 안내). false/미지정 = "업적" 탭. */
  tutorial?: boolean;
};

// ── 성장의 길(튜토리얼 리드, 순차) ──────────────────────────────────────────
// 첫 전투 보상으로 쇠사슬 갑옷을 주고 → 다음 퀘스트가 "장착하기"라 자연스러운 학습 루프.
const GROWTH: QuestDef[] = [
  {
    id: "g_first_battle",
    line: "growth",
    title: "첫 발걸음",
    desc: "사냥터에서 첫 전투를 치러보세요.",
    reward: {
      staminaPotions: 1,
      equip: "v2_chain_mail",
      titleId: "first_blood",
    },
    check: (c) => c.battleCount >= 1,
  },
  {
    id: "g_equip",
    line: "growth",
    title: "무장하기",
    desc: "인벤토리에서 장비를 장착하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.equippedCount >= 1,
  },
  {
    id: "g_depth5",
    line: "growth",
    title: "더 깊은 곳으로",
    desc: "사냥터 깊이 5까지 진출하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.frontierDepth >= 5,
  },
  {
    id: "g_cultivate",
    line: "growth",
    title: "수행 입문",
    desc: "성장의 신전에서 수행으로 능력치 한계를 올리세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.cultivations >= 1,
  },
  {
    id: "g_cap1",
    line: "growth",
    title: "정점",
    desc: `레벨 한계치(${V2_LEVEL_CAP})에 도달하세요.`,
    reward: { staminaPotions: 1 },
    // 현재 레벨 또는 보존 숙련도 기준. level 만 보면 환생 직후 레벨 1 리셋으로 뒤 퀘스트가
    // 재잠금되고, cumLevel 만 보면 EXP 묘약 등 레벨 성장 경로와 설명이 어긋난다.
    check: (c) => c.level >= V2_LEVEL_CAP || c.cumLevel >= V2_LEVEL_CAP,
  },
  {
    id: "g_advance2",
    line: "growth",
    title: "2차 전직",
    desc: "성장의 신전에서 더 강한 2차 직업으로 전직하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.tier >= 2,
  },
  {
    // id 는 옛 이름(g_passive) 유지 — 바꾸면 기존 수령 기록이 끊긴다.
    id: "g_passive",
    line: "growth",
    title: "3차 전직",
    desc: "성장의 신전에서 한 번 더 전직해 3차 직업에 도달하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.tier >= 3,
  },
  {
    id: "g_frontier",
    line: "growth",
    title: "프론티어 개척자",
    desc: "프론티어 첫 테마 밴드(깊이 7)에 진입하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.frontierDepth >= 7,
  },
];

// ── 기초 튜토리얼(독립 마일스톤 · 비순차) ────────────────────────────────────
// 성장의 길이 안 다루는 기본 조작을 한 번씩 익히게 하는 묶음(은행·스킬·이동).
// 강화/낚시/보물은 enhance·life 라인이 첫 단계부터 다루므로 여기엔 중복 안 둔다.
const BASICS: QuestDef[] = [
  {
    id: "b_shop",
    line: "basics",
    title: "첫 쇼핑",
    desc: "상점에서 장비나 충전을 구매하세요.",
    reward: { staminaPotions: 2 },
    check: (c) => c.hasShopped,
  },
  {
    id: "b_heal",
    line: "basics",
    title: "회복의 손길",
    desc: "치료소에서 골드로 HP를 회복하세요.",
    reward: { staminaPotions: 2 },
    check: (c) => c.hasHealed,
  },
  {
    id: "b_bank",
    line: "basics",
    title: "안전한 보관",
    desc: "거점 은행에 골드를 맡겨보세요.",
    reward: { staminaPotions: 2 },
    check: (c) => c.bankedGold > 0,
  },
  {
    id: "b_learn",
    line: "basics",
    title: "배움의 시작",
    desc: "스킬을 하나 학습하세요.",
    reward: { staminaPotions: 2 },
    check: (c) => c.skillsLearned >= 1,
  },
  {
    id: "b_skill",
    line: "basics",
    title: "기술 연마",
    desc: "스킬을 하나 장착해보세요.",
    reward: { staminaPotions: 2 },
    check: (c) => c.skillsEquipped >= 1,
  },
  {
    id: "b_travel",
    line: "basics",
    title: "새로운 땅으로",
    desc: "지도에서 다른 곳으로 이동해보세요.",
    reward: { staminaPotions: 2 },
    // 자유 타일 지도 — 한 번이라도 이동하면 완료(옛 "거점 2곳" 조건은 고정 거점이 하나뿐이라 불가).
    check: (c) => c.hasMoved,
  },
];

// ── 영구 업적 ──────────────────────────────────────────────────────────────
// 모든 단계는 독립적으로 노출·달성된다. 기존 id는 보상 수령 기록과 칭호 호환을 위해 유지한다.
type Milestone = {
  id: string;
  title: string;
  goal: number;
  points: number;
  titleId?: TitleId;
};

function milestones(
  line: QuestLineId,
  label: string,
  value: (c: QuestCtx) => number,
  entries: readonly Milestone[],
): QuestDef[] {
  return entries.map((entry) => ({
    id: entry.id,
    line,
    title: entry.title,
    desc: `${label} ${entry.goal.toLocaleString()}${
      label.includes("레벨") ||
      label.includes("깊이") ||
      label.includes("숙련도") ||
      label.includes("강화 +")
        ? ""
        : label.includes("골드")
          ? " G"
          : label.includes("서로 다른")
            ? "종"
            : label.includes("도감") || label.includes("장비") || label.includes("칭호")
              ? "개"
              : label.includes("층")
                ? "층"
                : "회"
    }를 달성하세요.`,
    reward: entry.titleId ? { titleId: entry.titleId } : {},
    points: entry.points,
    progress: value,
    goal: entry.goal,
    check: (c) => value(c) >= entry.goal,
  }));
}

const COMBAT: QuestDef[] = [
  ...milestones("combat", "누적 전투", (c) => c.battleCount, [
    { id: "combat_10", title: "몸풀기", goal: 10, points: 5 },
    { id: "combat_50", title: "전투에 익숙해지다", goal: 50, points: 5 },
    { id: "combat_100", title: "백전", goal: 100, points: 10 },
    { id: "combat_300", title: "노련한 전사", goal: 300, points: 10 },
    { id: "b_battles1000", title: "역전의 용사", goal: 1_000, points: 20 },
    { id: "combat_2500", title: "끝없는 전장", goal: 2_500, points: 25 },
    { id: "b_battles5000", title: "전장의 화신", goal: 5_000, points: 40, titleId: "ach_war_avatar" },
    { id: "combat_10000", title: "만전의 영웅", goal: 10_000, points: 50 },
  ]),
  ...milestones("combat", "서로 다른 몬스터 처치", (c) => c.speciesKilled, [
    { id: "combat_species5", title: "초보 사냥꾼", goal: 5, points: 5 },
    { id: "b_species15", title: "사냥꾼의 기록", goal: 15, points: 10 },
    { id: "combat_species25", title: "생태 조사원", goal: 25, points: 15 },
    { id: "b_species35", title: "토벌 도감의 주인", goal: 35, points: 30, titleId: "ach_bestiary_master" },
    { id: "combat_species40", title: "모든 흔적을 좇아", goal: 40, points: 40 },
  ]),
  ...milestones("combat", "협동 보스 종류 토벌", (c) => c.bossKills, [
    { id: "a_boss", title: "협동 보스 토벌", goal: 1, points: 10 },
    { id: "combat_boss2", title: "보스 추적자", goal: 2, points: 15 },
    { id: "a_boss_master", title: "보스 마스터", goal: 4, points: 30, titleId: "ach_boss_master" },
  ]),
];

const FRONTIER: QuestDef[] = milestones("frontier", "사냥터 깊이", (c) => c.frontierDepth, [
  { id: "b_band_canyon", title: "협곡 입성", goal: 7, points: 5 },
  { id: "frontier_13", title: "황야를 지나", goal: 13, points: 10 },
  { id: "a_depth25", title: "심층 개척", goal: 19, points: 10 },
  { id: "frontier_25", title: "잊힌 길", goal: 25, points: 15 },
  { id: "b_band_swamp", title: "늪지 입성", goal: 31, points: 15 },
  { id: "a_depth40", title: "심연 개척", goal: 34, points: 20 },
  { id: "frontier_48", title: "프론티어 원정대", goal: 48, points: 25 },
  { id: "frontier_60", title: "심해의 문턱", goal: 60, points: 30 },
  { id: "a_depth48", title: "프론티어의 끝", goal: 72, points: 50, titleId: "ach_frontier_end" },
]);

const GROWTH_ACHIEVEMENTS: QuestDef[] = [
  ...milestones("growth_achievement", "총 직업 숙련도", (c) => c.cumLevel, [
    { id: "growth_cum100", title: "쌓이는 경험", goal: 100, points: 5 },
    { id: "r_300", title: "세 번째 생", goal: 450, points: 15 },
    { id: "r_600", title: "윤회의 수레바퀴", goal: 900, points: 20 },
    { id: "r_1200", title: "천년의 혼", goal: 1_800, points: 30 },
    { id: "r_2000", title: "윤회의 정점", goal: 3_000, points: 50, titleId: "ach_rebirth_apex" },
    { id: "growth_cum5000", title: "영겁의 숙련", goal: 5_000, points: 60 },
  ]),
  ...milestones("growth_achievement", "환생", (c) => c.reincarnations, [
    { id: "r_first", title: "다시 태어나다", goal: 1, points: 10, titleId: "ach_reborn" },
    { id: "growth_rebirth3", title: "세 번의 삶", goal: 3, points: 15 },
    { id: "growth_rebirth10", title: "윤회하는 자", goal: 10, points: 30 },
    { id: "growth_rebirth25", title: "끝나지 않는 여정", goal: 25, points: 50 },
  ]),
  { id: "a_apex", line: "growth_achievement", title: "직업의 정점", desc: "최종 단계인 4차 직업으로 전직하세요.", reward: {}, points: 25, progress: (c) => c.tier, goal: 4, check: (c) => c.tier >= 4 },
];

const EQUIPMENT: QuestDef[] = [
  { id: "x_full_gear", line: "equipment", title: "완전 무장", desc: "장비 6부위를 모두 장착하세요.", reward: { titleId: "ach_full_gear" }, points: 10, progress: (c) => c.equippedCount, goal: 6, check: (c) => c.equippedCount >= 6 },
  ...milestones("equipment", "유니크 장비 보유", (c) => c.uniqueOwned, [
    { id: "a_unique", title: "첫 유니크", goal: 1, points: 10 },
    { id: "a_unique5", title: "유니크 컬렉터", goal: 5, points: 20 },
    { id: "equipment_unique10", title: "진귀한 무기고", goal: 10, points: 30 },
    { id: "equipment_unique20", title: "유일무이한 수집가", goal: 20, points: 50 },
  ]),
  ...milestones("equipment", "장비 도감 등록", (c) => c.equipmentCodexRegistered, [
    { id: "codex_10", title: "도감의 첫 장", goal: 10, points: 5 },
    { id: "codex_25", title: "장비 연구가", goal: 25, points: 10 },
    { id: "codex_50", title: "수집의 재미", goal: 50, points: 15 },
    { id: "codex_100", title: "백 가지 장비", goal: 100, points: 25 },
    { id: "codex_150", title: "대수집가", goal: 150, points: 35 },
    { id: "codex_200", title: "도감 박사", goal: 200, points: 50 },
  ]),
  ...milestones("equipment", "장비 최고 강화 +", (c) => c.maxEnhanceLevel, [
    { id: "e_first", title: "첫 단조", goal: 1, points: 5 },
    { id: "e_plus3", title: "단련", goal: 3, points: 10 },
    { id: "e_plus5", title: "숙련된 단조", goal: 5, points: 15 },
    { id: "e_plus7", title: "고강의 영역", goal: 7, points: 25 },
    { id: "e_plus10", title: "전설의 +10", goal: 10, points: 50, titleId: "ach_plus_ten" },
    { id: "equipment_plus12", title: "한계를 두드리다", goal: 12, points: 60 },
  ]),
  { id: "e_stone", line: "equipment", title: "반짝이는 돌", desc: "강화석을 1개 이상 보유하세요.", reward: {}, points: 5, progress: (c) => c.enhanceStones, goal: 1, check: (c) => c.enhanceStones >= 1 },
];

const ARENA: QuestDef[] = [
  { id: "s_guild", line: "arena_social", title: "길드의 일원", desc: "길드에 가입하거나 길드를 창단하세요.", reward: {}, points: 5, check: (c) => c.hasGuild },
  { id: "s_trade", line: "arena_social", title: "첫 거래", desc: "거래소에서 거래를 성사시키세요.", reward: {}, points: 5, check: (c) => c.hasTraded },
  { id: "s_arena", line: "arena_social", title: "투기장 입문", desc: "투기장에서 한 판 겨뤄보세요.", reward: {}, points: 5, progress: (c) => (c.arenaPlayed ? 1 : 0), goal: 1, check: (c) => c.arenaPlayed },
  ...milestones("arena_social", "투기장 승리", (c) => c.arenaWins, [
    { id: "s_arena_win", title: "투기장의 승자", goal: 1, points: 5 },
    { id: "arena_win5", title: "연승의 시작", goal: 5, points: 10 },
    { id: "arena_win20", title: "검투사", goal: 20, points: 15 },
    { id: "arena_win50", title: "투기장 베테랑", goal: 50, points: 25 },
    { id: "arena_win100", title: "백승의 명예", goal: 100, points: 40 },
    { id: "arena_win250", title: "투기장의 지배자", goal: 250, points: 60 },
  ]),
];

const FARMING: QuestDef[] = [
  ...milestones("farming", "작물 수확", (c) => c.farmHarvests, [
    { id: "farm_harvest1", title: "첫 수확", goal: 1, points: 5 },
    { id: "farm_harvest10", title: "초보 농부", goal: 10, points: 5 },
    { id: "farm_harvest50", title: "풍성한 바구니", goal: 50, points: 10 },
    { id: "farm_harvest200", title: "계절을 일구다", goal: 200, points: 20 },
    { id: "farm_harvest500", title: "대풍년", goal: 500, points: 40 },
  ]),
  ...milestones("farming", "농사 레벨", (c) => c.farmingLevel, [
    { id: "farm_level10", title: "밭일에 익숙해지다", goal: 10, points: 10 },
    { id: "farm_level25", title: "숙련 농부", goal: 25, points: 20 },
    { id: "farm_level50", title: "대농장주", goal: 50, points: 50 },
  ]),
  ...milestones("farming", "희귀 작물 수확", (c) => c.farmRareHarvests, [
    { id: "farm_rare1", title: "뜻밖의 수확", goal: 1, points: 10 },
    { id: "farm_rare25", title: "희귀 작물 전문가", goal: 25, points: 30 },
  ]),
  ...milestones("farming", "납품 완료", (c) => c.farmDeliveries, [
    { id: "farm_delivery1", title: "첫 납품", goal: 1, points: 5 },
    { id: "farm_delivery30", title: "마을의 공급자", goal: 30, points: 25 },
  ]),
];

const WOODCUTTING: QuestDef[] = [
  ...milestones("woodcutting", "벌목 성공", (c) => c.woodcuttingCuts, [
    { id: "wood_cut1", title: "첫 도끼질", goal: 1, points: 5 },
    { id: "wood_cut25", title: "장작 패기", goal: 25, points: 5 },
    { id: "wood_cut100", title: "벌목꾼", goal: 100, points: 15 },
    { id: "wood_cut500", title: "숲의 일꾼", goal: 500, points: 30 },
    { id: "wood_cut1000", title: "천 그루의 기록", goal: 1_000, points: 50 },
  ]),
  ...milestones("woodcutting", "벌목 레벨", (c) => c.woodcuttingLevel, [
    { id: "wood_level10", title: "도끼 숙련", goal: 10, points: 10 },
    { id: "wood_level25", title: "노련한 벌목꾼", goal: 25, points: 20 },
    { id: "wood_level50", title: "숲의 대가", goal: 50, points: 50 },
  ]),
  ...milestones("woodcutting", "완벽한 벌목", (c) => c.woodcuttingPerfectCuts, [
    { id: "wood_perfect1", title: "정확한 일격", goal: 1, points: 10 },
    { id: "wood_perfect100", title: "흔들림 없는 도끼", goal: 100, points: 30 },
  ]),
];

const MINING: QuestDef[] = [
  ...milestones("mining", "채광 성공", (c) => c.miningSuccesses, [
    { id: "mine_1", title: "첫 광석", goal: 1, points: 5 },
    { id: "mine_25", title: "갱도의 신입", goal: 25, points: 5 },
    { id: "mine_100", title: "광부", goal: 100, points: 15 },
    { id: "mine_500", title: "깊은 곳의 빛", goal: 500, points: 30 },
    { id: "mine_1000", title: "대광부", goal: 1_000, points: 50 },
  ]),
  ...milestones("mining", "채광 레벨", (c) => c.miningLevel, [
    { id: "mine_level10", title: "곡괭이 숙련", goal: 10, points: 10 },
    { id: "mine_level25", title: "숙련 광부", goal: 25, points: 20 },
    { id: "mine_level50", title: "광맥의 대가", goal: 50, points: 50 },
  ]),
  ...milestones("mining", "부산물 발견", (c) => c.miningByproducts, [
    { id: "mine_byproduct1", title: "광맥의 선물", goal: 1, points: 10 },
    { id: "mine_byproduct100", title: "보석 감별사", goal: 100, points: 30 },
  ]),
];

const FISHING: QuestDef[] = [
  ...milestones("fishing", "물고기 낚기", (c) => c.fishCaught, [
    { id: "fish_catch1", title: "첫 손맛", goal: 1, points: 5 },
    { id: "fish_catch25", title: "낚시꾼", goal: 25, points: 5 },
    { id: "fish_catch100", title: "백 마리의 기록", goal: 100, points: 15 },
    { id: "fish_catch500", title: "물가의 터줏대감", goal: 500, points: 30 },
    { id: "fish_catch1000", title: "천 번의 손맛", goal: 1_000, points: 50 },
  ]),
  ...milestones("fishing", "낚시 레벨", (c) => c.fishingLevel, [
    { id: "fish_level10", title: "찌를 읽는 눈", goal: 10, points: 10 },
    { id: "fish_level25", title: "숙련 낚시꾼", goal: 25, points: 20 },
    { id: "fish_level50", title: "낚시의 대가", goal: 50, points: 50 },
  ]),
  ...milestones("fishing", "어종 도감 등록", (c) => c.fishSpecies, [
    { id: "l_fish1", title: "도감의 첫 물고기", goal: 1, points: 5 },
    { id: "l_fish10", title: "어부의 길", goal: 10, points: 10 },
    { id: "l_fish25", title: "강태공", goal: 25, points: 30, titleId: "ach_codex_angler" },
    { id: "fish_species34", title: "물고기 박사", goal: 34, points: 50 },
  ]),
];

const ARTISAN: QuestDef[] = [
  ...milestones("artisan", "길드 제작소 제작", (c) => c.workshopCrafts, [
    { id: "a_first_craft", title: "첫 제작 의뢰", goal: 1, points: 5 },
    { id: "artisan_craft10", title: "제작 견습생", goal: 10, points: 10 },
    { id: "artisan_craft50", title: "쉼 없는 망치", goal: 50, points: 20 },
    { id: "artisan_craft200", title: "명품 제작자", goal: 200, points: 40 },
  ]),
  ...milestones("artisan", "고품질 장비 제작", (c) => c.workshopQualityCrafts, [
    { id: "a_quality_plus1", title: "고품질 단조", goal: 1, points: 10 },
    { id: "artisan_quality25", title: "품질 보증", goal: 25, points: 25 },
    { id: "artisan_quality100", title: "장인의 작품", goal: 100, points: 50 },
  ]),
  ...milestones("artisan", "대장장이 레벨", (c) => c.blacksmithLevel, [
    { id: "a_blacksmith_lv2", title: "대장장이의 손", goal: 2, points: 5 },
    { id: "artisan_smith5", title: "숙련 대장장이", goal: 5, points: 20 },
    { id: "artisan_smith10", title: "전설의 대장장이", goal: 10, points: 50 },
  ]),
];

const CHALLENGE: QuestDef[] = [
  ...milestones("challenge", "숙련의 탑 최고 층", (c) => c.masteryTowerFloor, [
    { id: "tower_5", title: "탑에 오르다", goal: 5, points: 5 },
    { id: "tower_10", title: "열 번째 계단", goal: 10, points: 10 },
    { id: "tower_20", title: "탑의 도전자", goal: 20, points: 15 },
    { id: "tower_30", title: "구름 위로", goal: 30, points: 25 },
    { id: "tower_40", title: "정상이 보인다", goal: 40, points: 35 },
    { id: "tower_50", title: "숙련의 정점", goal: 50, points: 60 },
  ]),
  ...milestones("challenge", "격자 던전 클리어", (c) => c.gridDungeonClears, [
    { id: "grid_clear1", title: "미궁 탈출", goal: 1, points: 10 },
    { id: "grid_clear5", title: "길을 읽는 자", goal: 5, points: 20 },
    { id: "grid_clear10", title: "미궁 정복자", goal: 10, points: 40 },
  ]),
];

const WAR: QuestDef[] = [
  { id: "w_first_claim", line: "war", title: "첫 출정", desc: "거점 점령을 1회 시도하세요.", reward: {}, points: 5, check: (c) => c.claimAttempted },
  { id: "w_hold", line: "war", title: "깃발을 꽂다", desc: "길드가 거점을 점령하거나 직접 점령에 성공하세요.", reward: {}, points: 10, check: (c) => c.hasOutpost || c.warCaptures >= 1 },
  ...milestones("war", "점령전 승리", (c) => c.siegeWins, [
    { id: "w_siege5", title: "공성 전문가", goal: 5, points: 15 },
    { id: "war_siege25", title: "성문 파괴자", goal: 25, points: 30 },
  ]),
  ...milestones("war", "거점 점령", (c) => c.warCaptures, [
    { id: "w_captures5", title: "정복자", goal: 5, points: 20 },
    { id: "war_capture20", title: "전선의 지배자", goal: 20, points: 40 },
  ]),
  ...milestones("war", "침입자 토벌", (c) => c.warEjectWins, [
    { id: "w_eject", title: "침입자 토벌", goal: 1, points: 10 },
    { id: "war_eject20", title: "철벽의 수호자", goal: 20, points: 35 },
  ]),
  ...milestones("war", "거점 금고 골드 회수", (c) => c.warTreasuryGold, [
    { id: "w_treasury", title: "금고 사냥꾼", goal: 3_000, points: 10 },
    { id: "war_treasury100k", title: "전쟁의 전리품", goal: 100_000, points: 40 },
  ]),
];

const COLLECTION: QuestDef[] = [
  ...milestones("collection", "골드 보유", (c) => c.gold, [
    { id: "x_rich", title: "재력가", goal: 10_000, points: 10, titleId: "ach_gold_keeper" },
    { id: "gold_100k", title: "두둑한 지갑", goal: 100_000, points: 20 },
    { id: "gold_1m", title: "백만장자", goal: 1_000_000, points: 40 },
  ]),
  ...milestones("collection", "칭호 획득", (c) => c.titleCount, [
    { id: "x_titles", title: "칭호 수집가", goal: 3, points: 10 },
    { id: "titles_10", title: "수많은 이름", goal: 10, points: 25 },
  ]),
];

// 라인 순서 = 퀘스트 화면의 라인 섹션 표시 순서(튜토리얼/업적 탭). 튜토리얼 탭은 기초 → 성장.
// (배너 "현재 목표" 우선순위는 이 순서가 아니라 V2_QUESTS 정의 순서를 따른다 — 성장이 먼저.)
export const QUEST_LINES: readonly QuestLine[] = [
  {
    id: "basics",
    name: "기초 튜토리얼",
    subtitle: "상점·치료·은행·스킬·이동 — 기본 조작을 한 번씩 익혀보세요.",
    sequential: false,
    tutorial: true,
  },
  {
    id: "growth",
    name: "성장의 길",
    subtitle: "첫 전투부터 2차·3차 전직까지 — 차례로 따라오세요.",
    sequential: true,
    tutorial: true,
  },
  { id: "combat", name: "전투와 토벌", subtitle: "전투 횟수·몬스터 도감·협동 보스 기록.", sequential: false },
  { id: "frontier", name: "프론티어", subtitle: "현재 사냥터의 끝까지 이어지는 개척 기록.", sequential: false },
  { id: "growth_achievement", name: "성장과 윤회", subtitle: "직업 숙련도·최종 전직·환생 기록.", sequential: false },
  { id: "equipment", name: "장비와 도감", subtitle: "장비 수집·도감 등록·강화 기록.", sequential: false },
  { id: "arena_social", name: "경쟁과 교류", subtitle: "길드·거래소·투기장 승리 기록.", sequential: false },
  { id: "farming", name: "농사", subtitle: "수확·희귀 작물·납품·농사 레벨.", sequential: false },
  { id: "woodcutting", name: "벌목", subtitle: "벌목 성공·완벽한 벌목·벌목 레벨.", sequential: false },
  { id: "mining", name: "채광", subtitle: "채광 성공·부산물·채광 레벨.", sequential: false },
  { id: "fishing", name: "낚시", subtitle: "어획·어종 도감·낚시 레벨.", sequential: false },
  { id: "artisan", name: "제작과 장인", subtitle: "길드 제작소와 대장장이 숙련 기록.", sequential: false },
  { id: "challenge", name: "도전 콘텐츠", subtitle: "숙련의 탑과 격자 던전 정복 기록.", sequential: false },
  { id: "war", name: "거점 전쟁", subtitle: "점령·공성·방어·금고 회수 기록.", sequential: false },
  { id: "collection", name: "부와 명예", subtitle: "골드와 칭호 수집 기록.", sequential: false },
];

export const V2_QUESTS: readonly QuestDef[] = [
  ...GROWTH,
  ...BASICS,
  ...COMBAT,
  ...FRONTIER,
  ...GROWTH_ACHIEVEMENTS,
  ...EQUIPMENT,
  ...ARENA,
  ...FARMING,
  ...WOODCUTTING,
  ...MINING,
  ...FISHING,
  ...ARTISAN,
  ...CHALLENGE,
  ...WAR,
  ...COLLECTION,
];

const QUEST_BY_ID = new Map(V2_QUESTS.map((q) => [q.id, q]));
const LINE_BY_ID = new Map(QUEST_LINES.map((l) => [l.id, l]));

export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID.get(id);
}

// 라인이 "튜토리얼" 탭 소속인가(기본 조작 안내 라인). 그 외는 "업적" 탭.
export function isTutorialLine(lineId: QuestLineId): boolean {
  return LINE_BY_ID.get(lineId)?.tutorial === true;
}

// claimed   — 이미 보상 수령(서버 영속 guide-quests.v2.claimed).
// claimable — 조건 충족 + (순차 라인이면 앞이 다 열림) + 미수령 → "받기" 가능.
// active    — 열렸지만 조건 미충족 → 지금 향할 목표.
// locked    — 순차 라인에서 앞 퀘스트가 아직 미완(조건 미충족) → 잠김.
export type QuestStatus = "claimed" | "claimable" | "active" | "locked";

export type QuestView = {
  id: string;
  line: QuestLineId;
  title: string;
  desc: string;
  reward: QuestReward;
  status: QuestStatus;
  points: number;
  progress: number | null;
  goal: number | null;
};

// 직업 전용 라인은 현 직군에게만 보임(classOnly 없으면 전원).
function lineVisible(line: QuestLine | undefined, ctx: QuestCtx): boolean {
  if (!line) return false;
  if (!line.classOnly) return true;
  return line.classOnly === ctx.class;
}
function isVisible(def: QuestDef, ctx: QuestCtx): boolean {
  return lineVisible(LINE_BY_ID.get(def.line), ctx);
}

// 순차 라인에서 "열림" = 앞 퀘스트들이 전부 충족(수령됨 || 현재 check true). 비순차는 항상 열림.
// 수령(claimed)도 충족으로 인정 — 한 번 수령한 앞 단계의 조건이 나중에 다시 거짓이 돼도
// (예: 정점=레벨캡을 찍고 재전직하면 현재 레벨이 1로 리셋) 뒤 퀘스트가 재잠금되지 않게.
function isUnlocked(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): boolean {
  const line = LINE_BY_ID.get(def.line);
  if (!line?.sequential) return true;
  for (const q of V2_QUESTS) {
    if (q.line !== def.line) continue;
    if (q.id === def.id) break; // 자기 자신 앞까지만
    if (!claimed.has(q.id) && !q.check(ctx)) return false;
  }
  return true;
}

// 체인 숨김 — 같은 체인의 더 앞(정의 순서) 단계가 미수령이면 이 퀘스트는 숨김.
// 수령된 퀘스트는 항상 보임(완료 탭). 과거 독립 수령 시절 상위만 받은 세이브도 안전
// (하위가 현재 단계로 노출, 수령된 상위는 완료 탭).
function hiddenByChain(def: QuestDef, claimed: ReadonlySet<string>): boolean {
  if (!def.chain || claimed.has(def.id)) return false;
  for (const q of V2_QUESTS) {
    if (q.id === def.id) return false; // 자신이 첫 미수령 단계
    if (q.chain === def.chain && !claimed.has(q.id)) return true;
  }
  return false;
}

export function questStatus(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestStatus {
  if (claimed.has(def.id)) return "claimed";
  if (!isUnlocked(def, ctx, claimed)) return "locked";
  return def.check(ctx) ? "claimable" : "active";
}

// 수령 가능 여부(서버 검증) — 가시(현 직군) + 미수령 + 열림 + 조건 충족.
// isVisible 가드가 타 직군 라인 퀘스트의 교차 수령(tier 등 공유 조건)을 차단.
export function isQuestClaimable(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): boolean {
  if (!isVisible(def, ctx)) return false;
  // 체인 순서 가드 — 앞 단계 미수령이면 조건 충족이라도 수령 불가(단계 건너뛰기 차단).
  if (hiddenByChain(def, claimed)) return false;
  return questStatus(def, ctx, claimed) === "claimable";
}

// 현 직군에게 보이는 라인만.
export function questLinesFor(ctx: QuestCtx): QuestLine[] {
  return QUEST_LINES.filter((l) => lineVisible(l, ctx));
}

export function deriveQuestViews(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestView[] {
  return V2_QUESTS.filter(
    (q) => isVisible(q, ctx) && !hiddenByChain(q, claimed),
  ).map((q) => ({
    id: q.id,
    line: q.line,
    title: q.title,
    desc: q.desc,
    reward: q.reward,
    status: questStatus(q, ctx, claimed),
    points: q.points ?? 0,
    progress: q.progress ? Math.max(0, Math.floor(q.progress(ctx))) : null,
    goal: q.goal ?? null,
  }));
}

export type AchievementSummary = {
  score: number;
  completed: number;
  total: number;
  maxScore: number;
};

/** 업적 점수는 조건 달성 즉시 반영하며, 이미 보상을 받은 업적은 진행 수치가 변해도 보존한다. */
export function achievementSummary(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): AchievementSummary {
  const achievements = V2_QUESTS.filter((q) => !isTutorialLine(q.line));
  const completed = achievements.filter(
    (q) => claimed.has(q.id) || q.check(ctx),
  );
  return {
    score: completed.reduce((sum, q) => sum + (q.points ?? 0), 0),
    completed: completed.length,
    total: achievements.length,
    maxScore: achievements.reduce((sum, q) => sum + (q.points ?? 0), 0),
  };
}

export function achievementScore(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): number {
  return achievementSummary(ctx, claimed).score;
}

// 홈 배너용 — 지금 안내할 "현재 목표" 하나. 우선순위 = V2_QUESTS 정의 순서(성장 먼저, 라인
// 섹션 표시 순서인 QUEST_LINES 와 무관) 내에서 수령 가능 > 진행 중. 전부 끝났으면 null.
export function currentGuideQuest(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestView | null {
  const views = deriveQuestViews(ctx, claimed);
  return (
    views.find((v) => v.status === "claimable") ??
    views.find((v) => v.status === "active") ??
    null
  );
}
