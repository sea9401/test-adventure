// v2 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 신규 플레이어를 "첫 직업 → 첫 전투 →
// 장비 교체 → 장착 후 전투 → 성장 → 수행·전직" 순서로 리드하고, 기본 기능과 장기 목표를 안내.
//
// 표시 정책: 전직 퀘스트는 목표 차수를 명시한다. 특히 튜토리얼 배너는 제목만 보일 때가 있어
//   "2차 전직", "3차 전직" 같은 표현을 title/desc 양쪽에 남긴다.
//
// 핵심 설계:
//   ① 완료 판정은 **세이브 상태에서 자동 감지**(QuestCtx). 별도 "수락/제출" 없음 — 자연스럽게
//      달성하면 ✅. 보상만 "받기" 버튼으로 수령(중복 방지 = claimed 집합).
//   ② 라인 = 퀘스트 묶음. sequential 라인은 앞 퀘스트가 끝나야 다음이 열리는 리드.
//      비-sequential 라인의 활동 종류는 서로 독립이지만, 같은 누적 기록의 마일스톤은 현재 단계만 노출한다.
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
import { HUNT_MONSTER_SPECIES_COUNT, huntStageName } from "./dungeon";
import type { TitleId } from "../titles";
import { COOKING_RECIPES } from "../../v2/cooking";

export type QuestLineId = string;
export type AchievementBadgeTier = "bronze" | "silver" | "gold" | "legendary";
export type QuestDetailKind = "monster_codex";

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
  /** 현 직업의 단계(0~6) = 직업 카탈로그 tier(jobIdFromLegacy). 전직 진행 신호. */
  tier: number;
  /** 누적 전투 수(킬 + 패배). adventure-log.v2. */
  battleCount: number;
  /** 도달한 사냥터 깊이. character.v2.frontierDepth. */
  frontierDepth: number;
  /** 장착 중인 장비 슬롯 수. equipment.v2.equipped. */
  equippedCount: number;
  /** 인벤토리에서 장비를 직접 바꿔 장착한 적 있는가. character.v2.hasManuallyEquippedGear. */
  hasManuallyEquippedGear: boolean;
  /** 장비를 직접 장착한 뒤 사냥터 전투를 치른 적 있는가. character.v2.hasBattledAfterEquippingGear. */
  hasBattledAfterEquippingGear: boolean;
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
  /** 지갑 보유 골드. character.v2.gold. */
  gold: number;
  /** 발견한 거점 수. character.v2.discoveredOutpostIds. */
  outpostsDiscovered: number;
  /** 획득한 칭호 수. adventure-log.v2.titles. */
  titleCount: number;
  // ── 확장 신호(2026-06-11, 라인 4종 추가) ─────────────────────────────────
  /** 총 직업 숙련도(전 직군 합·재전직 후에도 보존). proficiency totalCumLevel. */
  cumLevel: number;
  /** 재전직 횟수. 저장 호환상 proficiency.reincarnations 카운터를 사용한다. */
  reincarnations: number;
  /** 처치한 몬스터 종 수(kills>0 인 키 수). adventure-log.v2.monsters. */
  speciesKilled: number;
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
  /** 스킬 화면에서 로드아웃을 직접 저장한 적 있는가. 옛 튜토리얼 완료 호환용. */
  hasEditedSkillLoadout: boolean;
  /** 치료소에서 HP·MP 회복을 한 적 있는가. character.v2.hasHealed. */
  hasHealed: boolean;
  /** 상점에서 장비를 구매한 적 있는가. character.v2.hasShopped. */
  hasShopped: boolean;
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
  /** 숙련의 탑 최고 층. */
  masteryTowerFloor: number;
  /** 개인 요리 누적 성장. cooking.v1. */
  cookingLevel: number;
  cookingRecipesDiscovered: number;
  cookingDishesCooked: number;
  cookingOrdersCompleted: number;
  cookingMasterpiecesCooked: number;
  cookingRareIngredientDishes: number;
  /** 길드 시설 개인 활동 누적. guild_activity_log. */
  guildDiningMeals: number;
  guildTrainingDrills: number;
  guildExpeditions: number;
  guildWorkshopDeliveries: number;
  guildAlchemyCrafts: number;
  guildTradeContracts: number;
};

export type QuestDef = {
  id: string;
  line: QuestLineId;
  title: string;
  /** 무엇을 하면 되는지(행동 안내). */
  desc: string;
  /** 진행 중일 때 해당 기능 화면으로 보내는 내부 경로. */
  href?: string;
  reward: QuestReward;
  /** 완료 판정 — 세이브 파생 ctx 로. */
  check: (c: QuestCtx) => boolean;
  /** 영구 업적 점수. 튜토리얼에는 지정하지 않는다. */
  points?: number;
  /** 대표 배지 전시대에 올릴 수 있는 핵심 마일스톤과 그 승급 단계. */
  badgeTier?: AchievementBadgeTier;
  /** 수치형 업적의 현재 진행도와 목표. */
  progress?: (c: QuestCtx) => number;
  goal?: number;
  /** 업적 행에서 열 수 있는 추가 진행 상세. */
  detailKind?: QuestDetailKind;
  /** 현재 사냥 가능 종 수가 이 값보다 적으면 미달성 업적을 숨긴다. */
  requiredHuntableSpecies?: number;
  /** 체인 — 같은 내용·증가 목표 마일스톤 묶음. 정의 순서대로 "현재 단계"만 노출
   *  (앞 단계 수령 시 다음 등장 — 잠금 표시도 없이 숨김, 패널 난잡함 방지). */
  chain?: string;
};

export type QuestLine = {
  id: QuestLineId;
  name: string;
  subtitle: string;
  /** true = 앞 퀘스트 완료해야 다음이 열림(리드). false = 라인 내 서로 다른 계열은 독립. */
  sequential: boolean;
  /** 지정 시 그 직군에게만 보이는 라인(직업 전용). */
  classOnly?: V2Class;
  /** true = 퀘스트 화면 "튜토리얼" 탭에 노출(기본 조작 안내). false/미지정 = "업적" 탭. */
  tutorial?: boolean;
};

// ── 성장의 길(튜토리얼 리드, 순차) ──────────────────────────────────────────
// 첫 전투 보상으로 쇠사슬 갑옷을 주고 → 직접 장착 → 장착 후 재전투까지 실제 조작으로 확인한다.
// 신규 캐릭터는 6부위를 자동 장착한 채 시작하므로 equippedCount 만으로 장착 행동을 판정하지 않는다.
const GROWTH: QuestDef[] = [
  {
    id: "g_first_job",
    line: "growth",
    title: "첫 직업",
    desc: "캐릭터 > 성장의 신전에서 첫 직업을 선택하세요.",
    href: "/character/shrine",
    reward: { staminaPotions: 1 },
    progress: (c) => (c.class !== "none" && c.tier >= 1 ? 1 : 0),
    goal: 1,
    check: (c) => c.class !== "none" && c.tier >= 1,
  },
  {
    id: "g_first_battle",
    line: "growth",
    title: "첫 발걸음",
    desc: "전투 > 사냥터에서 첫 전투를 치르세요.",
    href: "/battle/dungeon",
    reward: {
      staminaPotions: 1,
      equip: "v2_chain_mail",
      titleId: "first_blood",
    },
    progress: (c) => c.battleCount,
    goal: 1,
    check: (c) => c.battleCount >= 1,
  },
  {
    id: "g_equip",
    line: "growth",
    title: "무장하기",
    desc: "첫 전투 보상으로 받은 쇠사슬 갑옷을 캐릭터 > 인벤토리에서 장착하세요.",
    href: "/character/inventory",
    reward: { staminaPotions: 1 },
    progress: (c) => (c.hasManuallyEquippedGear ? 1 : 0),
    goal: 1,
    check: (c) => c.hasManuallyEquippedGear,
  },
  {
    id: "g_equipped_battle",
    line: "growth",
    title: "준비된 전투",
    desc: "새 장비를 장착한 상태로 전투 > 사냥터에서 한 번 더 전투하세요.",
    href: "/battle/dungeon",
    reward: { staminaPotions: 1 },
    progress: (c) => (c.hasBattledAfterEquippingGear ? 1 : 0),
    goal: 1,
    check: (c) => c.hasBattledAfterEquippingGear,
  },
  {
    id: "g_level10",
    line: "growth",
    title: "성장의 감각",
    desc: "사냥터 전투를 이어가 레벨 10에 도달하세요.",
    href: "/battle/dungeon",
    reward: { staminaPotions: 1 },
    progress: (c) => Math.max(c.level, Math.min(c.cumLevel, 10)),
    goal: 10,
    check: (c) => c.level >= 10 || c.cumLevel >= 10,
  },
  {
    id: "g_depth5",
    line: "growth",
    title: "더 깊은 곳으로",
    desc: "들판의 최심부를 공략하세요.",
    href: "/battle/dungeon",
    reward: { staminaPotions: 1 },
    progress: (c) => Math.ceil(c.frontierDepth / 2),
    goal: 3,
    check: (c) => c.frontierDepth >= 5,
  },
  {
    id: "g_frontier",
    line: "growth",
    title: "새 사냥터 개척",
    desc: "전투 > 사냥터에서 마른 협곡의 입구를 공략하세요.",
    href: "/battle/dungeon",
    reward: { staminaPotions: 1 },
    progress: (c) => Math.ceil(c.frontierDepth / 2),
    goal: 4,
    check: (c) => c.frontierDepth >= 7,
  },
  {
    id: "g_cap1",
    line: "growth",
    title: "정점",
    desc: `사냥터에서 성장해 레벨 한계치(${V2_LEVEL_CAP})에 도달하세요.`,
    href: "/battle/dungeon",
    reward: { staminaPotions: 1 },
    progress: (c) => Math.max(c.level, Math.min(c.cumLevel, V2_LEVEL_CAP)),
    goal: V2_LEVEL_CAP,
    // 현재 레벨 또는 보존 숙련도 기준. level 만 보면 재전직 직후 레벨 1 리셋으로 뒤 퀘스트가
    // 재잠금되고, cumLevel 만 보면 EXP 묘약 등 레벨 성장 경로와 설명이 어긋난다.
    check: (c) => c.level >= V2_LEVEL_CAP || c.cumLevel >= V2_LEVEL_CAP,
  },
  {
    id: "g_cultivate",
    line: "growth",
    title: "수행 입문",
    desc: "캐릭터 > 성장의 신전 > 수행에서 능력치 한계를 한 번 올리세요.",
    href: "/character/shrine",
    reward: { staminaPotions: 1 },
    progress: (c) => c.cultivations,
    goal: 1,
    check: (c) => c.cultivations >= 1,
  },
  {
    id: "g_advance2",
    line: "growth",
    title: "2차 전직",
    desc: "캐릭터 > 성장의 신전에서 더 강한 2차 직업으로 전직하세요.",
    href: "/character/shrine",
    reward: { staminaPotions: 1 },
    progress: (c) => c.tier,
    goal: 2,
    check: (c) => c.tier >= 2,
  },
  {
    // id 는 옛 이름(g_passive) 유지 — 바꾸면 기존 수령 기록이 끊긴다.
    id: "g_passive",
    line: "growth",
    title: "3차 전직",
    desc: "캐릭터 > 성장의 신전에서 한 번 더 전직해 3차 직업에 도달하세요.",
    href: "/character/shrine",
    reward: { staminaPotions: 1 },
    progress: (c) => c.tier,
    goal: 3,
    check: (c) => c.tier >= 3,
  },
];

// ── 기초 튜토리얼(독립 마일스톤 · 비순차) ────────────────────────────────────
// 성장의 길이 안 다루는 기본 조작과 생활 콘텐츠를 한 번씩 익히게 하는 묶음.
// 비순차 라인이라 시간이 필요한 농사·요리가 다른 튜토리얼 진행을 막지 않는다.
const BASICS: QuestDef[] = [
  {
    id: "b_shop",
    line: "basics",
    title: "첫 쇼핑",
    desc: "마을 > 상점에서 장비를 하나 구매하세요.",
    href: "/town/shop",
    reward: { staminaPotions: 2 },
    progress: (c) => (c.hasShopped ? 1 : 0),
    goal: 1,
    check: (c) => c.hasShopped,
  },
  {
    id: "b_heal",
    line: "basics",
    title: "회복의 손길",
    desc: "마을 > 치료소에서 HP와 MP를 회복하세요.",
    href: "/town/healing",
    reward: { staminaPotions: 2 },
    progress: (c) => (c.hasHealed ? 1 : 0),
    goal: 1,
    check: (c) => c.hasHealed,
  },
  {
    id: "b_bank",
    line: "basics",
    title: "안전한 보관",
    desc: "마을 > 은행에서 골드를 한 번 맡기세요.",
    href: "/town/bank",
    reward: { staminaPotions: 2 },
    progress: (c) => (c.bankedGold > 0 ? 1 : 0),
    goal: 1,
    check: (c) => c.bankedGold > 0,
  },
  {
    id: "b_learn",
    line: "basics",
    title: "배움의 시작",
    desc: "캐릭터 > 스킬에서 스킬을 하나 학습하세요.",
    href: "/character/skills",
    reward: { staminaPotions: 2 },
    progress: (c) => c.skillsLearned,
    goal: 1,
    check: (c) => c.skillsLearned >= 1,
  },
  {
    id: "b_skill",
    line: "basics",
    title: "기술 연마",
    desc: "캐릭터 > 스킬 > 로드아웃에서 배운 스킬을 장착하고 저장하세요.",
    href: "/character/skills",
    reward: { staminaPotions: 2 },
    // 이미 스킬을 장착한 채 퀘스트가 활성화된 사용자도 즉시 완료 처리한다.
    // 옛 행동 플래그는 장착 후 해제한 사용자의 기존 진행을 되돌리지 않도록 함께 인정한다.
    progress: (c) =>
      c.skillsEquipped > 0 || c.hasEditedSkillLoadout ? 1 : 0,
    goal: 1,
    check: (c) => c.skillsEquipped > 0 || c.hasEditedSkillLoadout,
  },
  {
    id: "b_farm",
    line: "basics",
    title: "첫 수확",
    desc: "마을 > 농장에서 씨앗을 심고 작물을 한 번 수확하세요.",
    href: "/town/farm",
    reward: { staminaPotions: 2 },
    progress: (c) => c.farmHarvests,
    goal: 1,
    check: (c) => c.farmHarvests >= 1,
  },
  {
    id: "b_logging",
    line: "basics",
    title: "벌목 입문",
    desc: "지도 > 소나무숲에서 벌목을 한 번 성공하세요.",
    href: "/town/logging?spot=pine_grove",
    reward: { staminaPotions: 2 },
    progress: (c) => c.woodcuttingCuts,
    goal: 1,
    check: (c) => c.woodcuttingCuts >= 1,
  },
  {
    id: "b_mining",
    line: "basics",
    title: "채광 입문",
    desc: "지도 > 철 채석장에서 채광을 한 번 성공하세요.",
    href: "/town/mining?spot=iron_quarry",
    reward: { staminaPotions: 2 },
    progress: (c) => c.miningSuccesses,
    goal: 1,
    check: (c) => c.miningSuccesses >= 1,
  },
  {
    id: "b_fishing",
    line: "basics",
    title: "낚시 입문",
    desc: "마을 > 낚시터에서 물고기를 한 마리 낚으세요.",
    href: "/town/fishing",
    reward: { staminaPotions: 2 },
    progress: (c) => c.fishCaught,
    goal: 1,
    check: (c) => c.fishCaught >= 1,
  },
  {
    id: "b_cooking",
    line: "basics",
    title: "첫 요리",
    desc: "마을 > 주방에서 요리를 한 번 완성하세요.",
    href: "/town/kitchen",
    reward: { staminaPotions: 2 },
    progress: (c) => c.cookingDishesCooked,
    goal: 1,
    check: (c) => c.cookingDishesCooked >= 1,
  },
];

// ── 영구 업적 ──────────────────────────────────────────────────────────────
// 같은 누적 기록의 단계는 chain으로 묶어 현재 미수령 단계만 노출한다.
// 기존 id는 보상 수령 기록과 칭호 호환을 위해 유지한다.
type Milestone = {
  id: string;
  title: string;
  goal: number;
  points: number;
  titleId?: TitleId;
  badgeTier?: AchievementBadgeTier;
};

// 반복해서 쌓을 수 있는 기록의 장기 목표. 초반의 고유 업적명은 그대로 두고, 그 이후는
// 수치가 제목에 바로 보이는 마라톤 단계로 이어 붙인다. 포인트는 뒤로 갈수록 완만하게 증가한다.
function marathonMilestones(
  idPrefix: string,
  titlePrefix: string,
  goals: readonly number[],
  startingPoints = 60,
): Milestone[] {
  return goals.map((goal, index) => ({
    id: `${idPrefix}_${goal}`,
    title: `${titlePrefix} ${goal.toLocaleString()}`,
    goal,
    points: Math.min(250, startingPoints + index * 15),
  }));
}

function milestones(
  line: QuestLineId,
  label: string,
  value: (c: QuestCtx) => number,
  entries: readonly Milestone[],
): QuestDef[] {
  return entries.map((entry) => {
    const unit =
      label.includes("레벨") ||
      label.includes("깊이") ||
      label.includes("숙련도") ||
      label.includes("강화 +")
        ? ""
        : label.includes("골드")
          ? " G"
          : label.includes("서로 다른")
            ? "종"
              : label.includes("도감") ||
                  label.includes("장비") ||
                  label.includes("칭호") ||
                  label.includes("증표") ||
                  label.includes("요리법")
                ? "개"
              : label.includes("층")
                ? "층"
                : "회";
    const particle = unit === "" || unit === "종" || unit === "층" ? "을" : "를";
    return {
      id: entry.id,
      line,
      title: entry.title,
      desc: `${label} ${entry.goal.toLocaleString()}${unit}${particle} 달성하세요.`,
      reward: entry.titleId ? { titleId: entry.titleId } : {},
      points: entry.points,
      badgeTier: entry.badgeTier,
      chain: `${line}:${label}`,
      progress: value,
      goal: entry.goal,
      check: (c) => value(c) >= entry.goal,
    };
  });
}

const MONSTER_SPECIES_ACHIEVEMENTS: QuestDef[] = milestones(
  "combat",
  "서로 다른 몬스터 처치",
  (c) => c.speciesKilled,
  [
    { id: "combat_species5", title: "초보 사냥꾼", goal: 5, points: 5 },
    { id: "b_species15", title: "사냥꾼의 기록", goal: 15, points: 10, badgeTier: "bronze" },
    { id: "combat_species25", title: "생태 조사원", goal: 25, points: 15 },
    { id: "b_species35", title: "토벌 도감의 주인", goal: 35, points: 30, titleId: "ach_bestiary_master", badgeTier: "silver" },
    { id: "combat_species40", title: "모든 흔적을 좇아", goal: 40, points: 40 },
    { id: "combat_species60", title: "대륙의 생태 기록", goal: 60, points: 50, badgeTier: "gold" },
    { id: "combat_species80", title: "끝없는 추적", goal: 80, points: 60 },
    { id: "combat_species95", title: "몬스터 도감 완주", goal: 95, points: 80, badgeTier: "legendary" },
  ],
).map((quest) => ({
  ...quest,
  detailKind: "monster_codex",
  requiredHuntableSpecies: quest.goal,
}));

const COMBAT: QuestDef[] = [
  ...milestones("combat", "누적 전투", (c) => c.battleCount, [
    { id: "combat_10", title: "몸풀기", goal: 10, points: 5 },
    { id: "combat_50", title: "전투에 익숙해지다", goal: 50, points: 5 },
    { id: "combat_100", title: "백전", goal: 100, points: 10, badgeTier: "bronze" },
    { id: "combat_300", title: "노련한 전사", goal: 300, points: 10 },
    { id: "b_battles1000", title: "역전의 용사", goal: 1_000, points: 20, badgeTier: "silver" },
    { id: "combat_2500", title: "끝없는 전장", goal: 2_500, points: 25 },
    { id: "b_battles5000", title: "전장의 화신", goal: 5_000, points: 40, titleId: "ach_war_avatar", badgeTier: "gold" },
    { id: "combat_10000", title: "만전의 영웅", goal: 10_000, points: 50, badgeTier: "legendary" },
    ...marathonMilestones("marathon_battle", "누적 전투", [
      25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
    ]),
  ]),
  ...MONSTER_SPECIES_ACHIEVEMENTS,
  ...milestones("combat", "협동 보스 종류 토벌", (c) => c.bossKills, [
    { id: "a_boss", title: "협동 보스 토벌", goal: 1, points: 10, badgeTier: "bronze" },
    { id: "combat_boss2", title: "보스 추적자", goal: 2, points: 15, badgeTier: "silver" },
    { id: "a_boss_master", title: "보스 마스터", goal: 4, points: 30, titleId: "ach_boss_master", badgeTier: "gold" },
    { id: "combat_boss6", title: "협동 보스 정복자", goal: 6, points: 50, badgeTier: "legendary" },
  ]),
];

const FRONTIER_MILESTONES: readonly Milestone[] = [
  { id: "b_band_canyon", title: "협곡 입성", goal: 7, points: 5 },
  { id: "frontier_13", title: "황야를 지나", goal: 13, points: 10 },
  { id: "a_depth25", title: "심층 개척", goal: 19, points: 10, badgeTier: "bronze" },
  { id: "frontier_25", title: "잊힌 길", goal: 25, points: 15 },
  { id: "b_band_swamp", title: "늪지 입성", goal: 31, points: 15 },
  { id: "a_depth40", title: "심연 개척", goal: 34, points: 20, badgeTier: "silver" },
  { id: "frontier_48", title: "사냥터 원정대", goal: 48, points: 25 },
  { id: "frontier_60", title: "심해의 문턱", goal: 60, points: 30, badgeTier: "gold" },
  { id: "a_depth48", title: "사냥터의 끝", goal: 72, points: 50, titleId: "ach_frontier_end", badgeTier: "legendary" },
];

const FRONTIER: QuestDef[] = FRONTIER_MILESTONES.map((entry) => ({
  id: entry.id,
  line: "frontier",
  title: entry.title,
  desc: `${huntStageName(entry.goal)}를 돌파하세요.`,
  reward: entry.titleId ? { titleId: entry.titleId } : {},
  points: entry.points,
  badgeTier: entry.badgeTier,
  chain: "frontier:hunting-stage",
  progress: (c) => Math.ceil(c.frontierDepth / 2),
  goal: Math.ceil(entry.goal / 2),
  check: (c) => c.frontierDepth >= entry.goal,
}));

const GROWTH_ACHIEVEMENTS: QuestDef[] = [
  ...milestones("growth_achievement", "총 직업 숙련도", (c) => c.cumLevel, [
    { id: "growth_cum100", title: "쌓이는 경험", goal: 100, points: 5 },
    { id: "r_300", title: "숙련의 길", goal: 450, points: 15, badgeTier: "bronze" },
    { id: "r_600", title: "노련한 모험가", goal: 900, points: 20 },
    { id: "r_1200", title: "깊어진 숙련", goal: 1_800, points: 30, badgeTier: "silver" },
    { id: "r_2000", title: "숙련의 정점", goal: 3_000, points: 50, titleId: "ach_rebirth_apex" },
    { id: "growth_cum5000", title: "영겁의 숙련", goal: 5_000, points: 60 },
    { id: "growth_cum10000", title: "만 번의 단련", goal: 10_000, points: 70, badgeTier: "gold" },
    { id: "growth_cum20000", title: "대가의 발자취", goal: 20_000, points: 80 },
    { id: "growth_cum35000", title: "초월의 문턱", goal: 35_000, points: 90 },
    { id: "growth_cum50000", title: "끝없는 숙련", goal: 50_000, points: 100, badgeTier: "legendary" },
    ...marathonMilestones("marathon_cum", "총 숙련도", [
      100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000,
      10_000_000,
    ], 110),
  ]),
  ...milestones("growth_achievement", "전투직 재전직", (c) => c.reincarnations, [
    { id: "r_first", title: "새로운 출발", goal: 1, points: 10, titleId: "ach_reborn", badgeTier: "bronze" },
    { id: "growth_rebirth3", title: "세 번의 재도전", goal: 3, points: 15, badgeTier: "silver" },
    { id: "growth_rebirth10", title: "숙련된 전직자", goal: 10, points: 30, badgeTier: "gold" },
    { id: "growth_rebirth25", title: "끝나지 않는 성장", goal: 25, points: 50, badgeTier: "legendary" },
    ...marathonMilestones("marathon_rebirth", "전투직 재전직", [
      50, 100, 250, 500, 1_000, 2_500,
    ]),
  ]),
  { id: "a_apex", line: "growth_achievement", chain: "growth_achievement:tier", title: "심화 직업", desc: "4차 직업으로 전직하세요.", reward: {}, points: 25, progress: (c) => c.tier, goal: 4, check: (c) => c.tier >= 4 },
  { id: "growth_tier5", line: "growth_achievement", chain: "growth_achievement:tier", title: "상급 직업", desc: "5차 직업으로 전직하세요.", reward: {}, points: 40, progress: (c) => c.tier, goal: 5, check: (c) => c.tier >= 5 },
  { id: "growth_tier6", line: "growth_achievement", chain: "growth_achievement:tier", title: "초월 직업", desc: "6차 직업으로 전직하세요.", reward: {}, points: 60, badgeTier: "legendary", progress: (c) => c.tier, goal: 6, check: (c) => c.tier >= 6 },
];

const EQUIPMENT: QuestDef[] = [
  { id: "x_full_gear", line: "equipment", title: "완전 무장", desc: "장비 6부위를 모두 장착하세요.", reward: { titleId: "ach_full_gear" }, points: 10, progress: (c) => c.equippedCount, goal: 6, check: (c) => c.equippedCount >= 6 },
  ...milestones("equipment", "유니크 장비 보유", (c) => c.uniqueOwned, [
    { id: "a_unique", title: "첫 유니크", goal: 1, points: 10, badgeTier: "bronze" },
    { id: "a_unique5", title: "유니크 컬렉터", goal: 5, points: 20, badgeTier: "silver" },
    { id: "equipment_unique10", title: "진귀한 무기고", goal: 10, points: 30, badgeTier: "gold" },
    { id: "equipment_unique20", title: "유일무이한 수집가", goal: 20, points: 50, badgeTier: "legendary" },
    ...marathonMilestones("marathon_unique", "유니크 장비", [
      50, 100, 250, 500, 1_000,
    ]),
  ]),
  ...milestones("equipment", "장비 도감 등록", (c) => c.equipmentCodexRegistered, [
    { id: "codex_10", title: "도감의 첫 장", goal: 10, points: 5 },
    { id: "codex_25", title: "장비 연구가", goal: 25, points: 10, badgeTier: "bronze" },
    { id: "codex_50", title: "수집의 재미", goal: 50, points: 15 },
    { id: "codex_100", title: "백 가지 장비", goal: 100, points: 25, badgeTier: "silver" },
    { id: "codex_150", title: "대수집가", goal: 150, points: 35 },
    { id: "codex_200", title: "도감 박사", goal: 200, points: 50, badgeTier: "gold" },
    { id: "codex_240", title: "장비 도감 완주", goal: 240, points: 70, badgeTier: "legendary" },
  ]),
  ...milestones("equipment", "장비 최고 강화 +", (c) => c.maxEnhanceLevel, [
    { id: "e_first", title: "첫 단조", goal: 1, points: 5 },
    { id: "e_plus3", title: "단련", goal: 3, points: 10, badgeTier: "bronze" },
    { id: "e_plus5", title: "숙련된 단조", goal: 5, points: 15, badgeTier: "silver" },
    { id: "e_plus7", title: "고강의 영역", goal: 7, points: 25, badgeTier: "gold" },
    { id: "e_plus10", title: "전설의 +10", goal: 10, points: 50, titleId: "ach_plus_ten", badgeTier: "legendary" },
    { id: "equipment_plus12", title: "한계를 두드리다", goal: 12, points: 60 },
  ]),
  { id: "e_stone", line: "equipment", title: "반짝이는 돌", desc: "강화석을 1개 이상 보유하세요.", reward: {}, points: 5, progress: (c) => c.enhanceStones, goal: 1, check: (c) => c.enhanceStones >= 1 },
];

const ARENA: QuestDef[] = [
  { id: "s_guild", line: "arena_social", title: "길드의 일원", desc: "길드에 가입하거나 길드를 창단하세요.", reward: {}, points: 5, check: (c) => c.hasGuild },
  { id: "s_trade", line: "arena_social", title: "첫 거래", desc: "거래소에서 거래를 성사시키세요.", reward: {}, points: 5, check: (c) => c.hasTraded },
  { id: "s_arena", line: "arena_social", title: "투기장 입문", desc: "투기장에서 한 판 겨뤄보세요.", reward: {}, points: 5, progress: (c) => (c.arenaPlayed ? 1 : 0), goal: 1, check: (c) => c.arenaPlayed },
  ...milestones("arena_social", "투기장 승리", (c) => c.arenaWins, [
    { id: "s_arena_win", title: "투기장의 승자", goal: 1, points: 5, badgeTier: "bronze" },
    { id: "arena_win5", title: "연승의 시작", goal: 5, points: 10 },
    { id: "arena_win20", title: "검투사", goal: 20, points: 15, badgeTier: "silver" },
    { id: "arena_win50", title: "아레나 베테랑", goal: 50, points: 25 },
    { id: "arena_win100", title: "백승의 명예", goal: 100, points: 40, badgeTier: "gold" },
    { id: "arena_win250", title: "투기장의 지배자", goal: 250, points: 60, badgeTier: "legendary" },
    ...marathonMilestones("marathon_arena", "투기장 승리", [
      500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ]),
  ]),
];

const FARMING: QuestDef[] = [
  ...milestones("farming", "작물 수확", (c) => c.farmHarvests, [
    { id: "farm_harvest1", title: "첫 수확", goal: 1, points: 5 },
    { id: "farm_harvest10", title: "초보 농부", goal: 10, points: 5, badgeTier: "bronze" },
    { id: "farm_harvest50", title: "풍성한 바구니", goal: 50, points: 10, badgeTier: "silver" },
    { id: "farm_harvest200", title: "계절을 일구다", goal: 200, points: 20 },
    { id: "farm_harvest500", title: "대풍년", goal: 500, points: 40, badgeTier: "gold" },
    { id: "farm_harvest2500", title: "사계절의 풍요", goal: 2_500, points: 75, badgeTier: "legendary" },
    ...marathonMilestones("marathon_harvest", "작물 수확", [
      5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
      1_000_000,
    ], 80),
  ]),
  ...milestones("farming", "농사 레벨", (c) => c.farmingLevel, [
    { id: "farm_level10", title: "밭일에 익숙해지다", goal: 10, points: 10 },
    { id: "farm_level25", title: "숙련 농부", goal: 25, points: 20 },
    { id: "farm_level50", title: "대농장주", goal: 50, points: 50, badgeTier: "legendary" },
  ]),
  ...milestones("farming", "희귀 작물 수확", (c) => c.farmRareHarvests, [
    { id: "farm_rare1", title: "뜻밖의 수확", goal: 1, points: 10 },
    { id: "farm_rare25", title: "희귀 작물 전문가", goal: 25, points: 30 },
    ...marathonMilestones("marathon_farm_rare", "희귀 작물", [
      50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
    ]),
  ]),
  ...milestones("farming", "납품 완료", (c) => c.farmDeliveries, [
    { id: "farm_delivery1", title: "첫 납품", goal: 1, points: 5 },
    { id: "farm_delivery30", title: "마을의 공급자", goal: 30, points: 25, badgeTier: "gold" },
    ...marathonMilestones("marathon_farm_delivery", "농장 납품", [
      100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000,
    ]),
  ]),
  ...milestones("farming", "농장 증표 획득", (c) => c.farmReputationEarned, [
    { id: "farm_reputation100", title: "농촌의 새 얼굴", goal: 100, points: 10, badgeTier: "bronze" },
    { id: "farm_reputation1000", title: "신뢰받는 농장주", goal: 1_000, points: 30, badgeTier: "gold" },
    { id: "farm_reputation5000", title: "풍요의 상징", goal: 5_000, points: 60, badgeTier: "legendary" },
    ...marathonMilestones("marathon_farm_reputation", "농장 증표", [
      10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
      2_500_000, 5_000_000, 10_000_000,
    ], 75),
  ]),
];

const WOODCUTTING: QuestDef[] = [
  ...milestones("woodcutting", "벌목 성공", (c) => c.woodcuttingCuts, [
    { id: "wood_cut1", title: "첫 도끼질", goal: 1, points: 5 },
    { id: "wood_cut25", title: "장작 패기", goal: 25, points: 5, badgeTier: "bronze" },
    { id: "wood_cut100", title: "벌목꾼", goal: 100, points: 15, badgeTier: "silver" },
    { id: "wood_cut500", title: "숲의 일꾼", goal: 500, points: 30 },
    { id: "wood_cut1000", title: "천 그루의 기록", goal: 1_000, points: 50, badgeTier: "gold" },
    { id: "wood_cut5000", title: "숲을 새긴 자", goal: 5_000, points: 75, badgeTier: "legendary" },
    ...marathonMilestones("marathon_wood", "벌목 성공", [
      10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
    ], 80),
  ]),
  ...milestones("woodcutting", "벌목 레벨", (c) => c.woodcuttingLevel, [
    { id: "wood_level10", title: "도끼 숙련", goal: 10, points: 10 },
    { id: "wood_level25", title: "노련한 벌목꾼", goal: 25, points: 20 },
    { id: "wood_level50", title: "숲의 대가", goal: 50, points: 50, badgeTier: "legendary" },
  ]),
];

const MINING: QuestDef[] = [
  ...milestones("mining", "채광 성공", (c) => c.miningSuccesses, [
    { id: "mine_1", title: "첫 광석", goal: 1, points: 5 },
    { id: "mine_25", title: "갱도의 신입", goal: 25, points: 5, badgeTier: "bronze" },
    { id: "mine_100", title: "광부", goal: 100, points: 15, badgeTier: "silver" },
    { id: "mine_500", title: "깊은 곳의 빛", goal: 500, points: 30 },
    { id: "mine_1000", title: "대광부", goal: 1_000, points: 50, badgeTier: "gold" },
    { id: "mine_5000", title: "대지를 깨운 자", goal: 5_000, points: 75, badgeTier: "legendary" },
    ...marathonMilestones("marathon_mining", "채광 성공", [
      10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
    ], 80),
  ]),
  ...milestones("mining", "채광 레벨", (c) => c.miningLevel, [
    { id: "mine_level10", title: "곡괭이 숙련", goal: 10, points: 10 },
    { id: "mine_level25", title: "숙련 광부", goal: 25, points: 20 },
    { id: "mine_level50", title: "광맥의 대가", goal: 50, points: 50, badgeTier: "legendary" },
  ]),
  ...milestones("mining", "부산물 발견", (c) => c.miningByproducts, [
    { id: "mine_byproduct1", title: "광맥의 선물", goal: 1, points: 10 },
    { id: "mine_byproduct100", title: "보석 감별사", goal: 100, points: 30, badgeTier: "gold" },
    ...marathonMilestones("marathon_byproduct", "부산물 발견", [
      250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
    ]),
  ]),
];

const FISHING: QuestDef[] = [
  ...milestones("fishing", "물고기 낚기", (c) => c.fishCaught, [
    { id: "fish_catch1", title: "첫 손맛", goal: 1, points: 5 },
    { id: "fish_catch25", title: "낚시꾼", goal: 25, points: 5, badgeTier: "bronze" },
    { id: "fish_catch100", title: "백 마리의 기록", goal: 100, points: 15, badgeTier: "silver" },
    { id: "fish_catch500", title: "물가의 터줏대감", goal: 500, points: 30 },
    { id: "fish_catch1000", title: "천 번의 손맛", goal: 1_000, points: 50, badgeTier: "gold" },
    { id: "fish_catch5000", title: "물결의 전설", goal: 5_000, points: 75, badgeTier: "legendary" },
    ...marathonMilestones("marathon_fishing", "물고기 낚기", [
      10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
    ], 80),
  ]),
  ...milestones("fishing", "낚시 레벨", (c) => c.fishingLevel, [
    { id: "fish_level10", title: "찌를 읽는 눈", goal: 10, points: 10 },
    { id: "fish_level25", title: "숙련 낚시꾼", goal: 25, points: 20 },
    { id: "fish_level50", title: "낚시의 대가", goal: 50, points: 50, badgeTier: "legendary" },
  ]),
  ...milestones("fishing", "어종 도감 등록", (c) => c.fishSpecies, [
    { id: "l_fish1", title: "도감의 첫 물고기", goal: 1, points: 5 },
    { id: "l_fish10", title: "어부의 길", goal: 10, points: 10, badgeTier: "bronze" },
    { id: "l_fish25", title: "강태공", goal: 25, points: 30, titleId: "ach_codex_angler", badgeTier: "gold" },
    { id: "fish_species34", title: "물고기 박사", goal: 34, points: 50, badgeTier: "legendary" },
  ]),
];

const COOKING: QuestDef[] = [
  ...milestones("cooking", "요리 레벨", (c) => c.cookingLevel, [
    { id: "cooking_level10", title: "주방에 익숙해지다", goal: 10, points: 10, badgeTier: "bronze" },
    { id: "cooking_level25", title: "능숙한 요리사", goal: 25, points: 20, badgeTier: "gold" },
    { id: "cooking_level50", title: "전설의 요리사", goal: 50, points: 50, badgeTier: "legendary" },
  ]),
  ...milestones("cooking", "요리법 발견", (c) => c.cookingRecipesDiscovered, [
    { id: "cooking_recipe5", title: "차려지는 식탁", goal: 5, points: 10, badgeTier: "bronze" },
    { id: "cooking_recipe10", title: "풍성한 차림", goal: 10, points: 25 },
    { id: "cooking_recipe15", title: "맛의 탐험가", goal: 15, points: 30, badgeTier: "silver" },
    { id: "cooking_recipe25", title: "대륙의 조리법", goal: 25, points: 40, badgeTier: "gold" },
    {
      id: "cooking_recipe18",
      title: "모든 맛의 기록",
      goal: COOKING_RECIPES.length,
      points: 50,
      badgeTier: "legendary",
    },
  ]),
  ...milestones("cooking", "요리 완성", (c) => c.cookingDishesCooked, [
    { id: "cooking_dish10", title: "첫 상차림", goal: 10, points: 5, badgeTier: "bronze" },
    { id: "cooking_dish100", title: "백 접시의 정성", goal: 100, points: 15, badgeTier: "silver" },
    { id: "cooking_dish500", title: "분주한 주방", goal: 500, points: 35, badgeTier: "gold" },
    { id: "cooking_dish2500", title: "끝없는 만찬", goal: 2_500, points: 70, badgeTier: "legendary" },
    ...marathonMilestones("marathon_dishes", "요리 완성", [
      5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
      1_000_000,
    ], 75),
  ]),
  ...milestones("cooking", "요리 의뢰 완료", (c) => c.cookingOrdersCompleted, [
    { id: "cooking_order1", title: "첫 주문표", goal: 1, points: 5 },
    { id: "cooking_order25", title: "단골이 생긴 주방", goal: 25, points: 15, badgeTier: "bronze" },
    { id: "cooking_order100", title: "소문난 맛집", goal: 100, points: 35, badgeTier: "gold" },
    { id: "cooking_order500", title: "왕국의 연회 담당", goal: 500, points: 70, badgeTier: "legendary" },
    ...marathonMilestones("marathon_orders", "요리 의뢰", [
      1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
    ], 75),
  ]),
  ...milestones("cooking", "걸작 요리 완성", (c) => c.cookingMasterpiecesCooked, [
    { id: "cooking_masterpiece1", title: "우연이 아닌 걸작", goal: 1, points: 10, badgeTier: "bronze" },
    { id: "cooking_masterpiece25", title: "황금빛 접시", goal: 25, points: 30, badgeTier: "gold" },
    { id: "cooking_masterpiece100", title: "전설의 식탁", goal: 100, points: 60, badgeTier: "legendary" },
    ...marathonMilestones("marathon_masterpiece", "걸작 요리", [
      250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ], 70),
  ]),
  ...milestones("cooking", "희귀 재료 요리 완성", (c) => c.cookingRareIngredientDishes, [
    { id: "cooking_rare1", title: "특별한 한 접시", goal: 1, points: 10, badgeTier: "bronze" },
    { id: "cooking_rare50", title: "비밀 재료의 대가", goal: 50, points: 35, badgeTier: "gold" },
    { id: "cooking_rare250", title: "환상의 미식가", goal: 250, points: 70, badgeTier: "legendary" },
    ...marathonMilestones("marathon_rare_dish", "희귀 재료 요리", [
      500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
    ], 75),
  ]),
];

const ARTISAN: QuestDef[] = [
  ...milestones("artisan", "길드 제작소 제작", (c) => c.workshopCrafts, [
    { id: "a_first_craft", title: "첫 제작 의뢰", goal: 1, points: 5 },
    { id: "artisan_craft10", title: "제작 견습생", goal: 10, points: 10 },
    { id: "artisan_craft50", title: "쉼 없는 망치", goal: 50, points: 20 },
    { id: "artisan_craft200", title: "명품 제작자", goal: 200, points: 40 },
    ...marathonMilestones("marathon_craft", "제작소 제작", [
      500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
    ], 60),
  ]),
  ...milestones("artisan", "고품질 장비 제작", (c) => c.workshopQualityCrafts, [
    { id: "a_quality_plus1", title: "고품질 단조", goal: 1, points: 10 },
    { id: "artisan_quality25", title: "품질 보증", goal: 25, points: 25 },
    { id: "artisan_quality100", title: "장인의 작품", goal: 100, points: 50 },
    ...marathonMilestones("marathon_quality", "고품질 제작", [
      250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ], 65),
  ]),
  ...milestones("artisan", "대장장이 레벨", (c) => c.blacksmithLevel, [
    { id: "a_blacksmith_lv2", title: "대장장이의 손", goal: 2, points: 5 },
    { id: "artisan_smith5", title: "숙련 대장장이", goal: 5, points: 20 },
    { id: "artisan_smith10", title: "전설의 대장장이", goal: 10, points: 50 },
  ]),
];

const GUILD_FACILITIES: QuestDef[] = [
  ...milestones("guild_facilities", "길드 식당 식사", (c) => c.guildDiningMeals, [
    { id: "guild_dining1", title: "함께하는 한 끼", goal: 1, points: 5 },
    { id: "guild_dining10", title: "길드 식당 단골", goal: 10, points: 15 },
    { id: "guild_dining50", title: "백년지기 식탁", goal: 50, points: 35 },
    ...marathonMilestones("marathon_guild_dining", "길드 식사", [
      100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
      100_000,
    ]),
  ]),
  ...milestones("guild_facilities", "길드 훈련 완료", (c) => c.guildTrainingDrills, [
    { id: "guild_training1", title: "첫 합동 훈련", goal: 1, points: 5 },
    { id: "guild_training10", title: "훈련장 모범생", goal: 10, points: 15 },
    { id: "guild_training50", title: "전술 훈련의 달인", goal: 50, points: 35 },
    ...marathonMilestones("marathon_guild_training", "길드 훈련", [
      100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
      100_000,
    ]),
  ]),
  ...milestones("guild_facilities", "길드 원정 완료", (c) => c.guildExpeditions, [
    { id: "guild_expedition1", title: "첫 원정 귀환", goal: 1, points: 10 },
    { id: "guild_expedition5", title: "노련한 원정대", goal: 5, points: 20 },
    { id: "guild_expedition20", title: "미지의 개척자", goal: 20, points: 40 },
    ...marathonMilestones("marathon_guild_expedition", "길드 원정", [
      50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ]),
  ]),
  ...milestones("guild_facilities", "길드 제작 납품", (c) => c.guildWorkshopDeliveries, [
    { id: "guild_delivery1", title: "첫 제작 납품", goal: 1, points: 10 },
    { id: "guild_delivery10", title: "믿음직한 납품가", goal: 10, points: 20 },
    { id: "guild_delivery50", title: "길드의 명품 공급자", goal: 50, points: 40 },
    ...marathonMilestones("marathon_guild_delivery", "길드 제작 납품", [
      100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
      100_000,
    ]),
  ]),
  ...milestones("guild_facilities", "길드 연금 제작", (c) => c.guildAlchemyCrafts, [
    { id: "guild_alchemy1", title: "첫 연금술", goal: 1, points: 10 },
    { id: "guild_alchemy25", title: "연금 공방의 손", goal: 25, points: 30 },
    ...marathonMilestones("marathon_guild_alchemy", "길드 연금 제작", [
      50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ]),
  ]),
  ...milestones("guild_facilities", "길드 교역 계약 완료", (c) => c.guildTradeContracts, [
    { id: "guild_trade1", title: "첫 길드 교역", goal: 1, points: 10 },
    { id: "guild_trade25", title: "교역로의 큰손", goal: 25, points: 30 },
    ...marathonMilestones("marathon_guild_trade", "길드 교역", [
      50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
    ]),
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
];

const COLLECTION: QuestDef[] = [
  // 코어 루프의 은행은 입금 전용이고 모든 골드 소비가 은행 잔액을 먼저 쓴다.
  // 따라서 재산 업적도 지갑만이 아닌 지갑+은행의 실제 총 보유액을 기준으로 한다.
  ...milestones("collection", "총 보유 골드", (c) => c.gold + c.bankedGold, [
    { id: "x_rich", title: "재력가", goal: 10_000, points: 10, titleId: "ach_gold_keeper" },
    { id: "gold_100k", title: "두둑한 지갑", goal: 100_000, points: 20 },
    { id: "gold_1m", title: "백만장자", goal: 1_000_000, points: 40 },
    ...marathonMilestones("marathon_gold", "총 보유 골드", [
      5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
      250_000_000, 500_000_000, 1_000_000_000, 2_500_000_000,
      5_000_000_000, 10_000_000_000,
    ], 60),
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
    subtitle: "상점·치료소·은행·스킬과 생활 콘텐츠의 기본 조작을 하나씩 익혀보세요.",
    sequential: false,
    tutorial: true,
  },
  {
    id: "growth",
    name: "성장의 길",
    subtitle: "첫 직업과 전투 준비부터 수행·2차·3차 전직까지 차례로 따라오세요.",
    sequential: true,
    tutorial: true,
  },
  { id: "combat", name: "전투와 토벌", subtitle: "전투 횟수·몬스터 도감·협동 보스 기록.", sequential: false },
  { id: "frontier", name: "사냥터 개척", subtitle: "현재 사냥터의 끝까지 이어지는 개척 기록.", sequential: false },
  { id: "growth_achievement", name: "직업과 숙련", subtitle: "직업 숙련도·고차 직업·전투직 재전직 기록.", sequential: false },
  { id: "equipment", name: "장비와 도감", subtitle: "장비 수집·도감 등록·강화 기록.", sequential: false },
  { id: "arena_social", name: "경쟁과 교류", subtitle: "길드·거래소·투기장 승리 기록.", sequential: false },
  { id: "farming", name: "농사", subtitle: "수확·희귀 작물·납품·농사 레벨.", sequential: false },
  { id: "woodcutting", name: "벌목", subtitle: "벌목 성공·벌목 레벨.", sequential: false },
  { id: "mining", name: "채광", subtitle: "채광 성공·부산물·채광 레벨.", sequential: false },
  { id: "fishing", name: "낚시", subtitle: "어획·어종 도감·낚시 레벨.", sequential: false },
  { id: "cooking", name: "요리", subtitle: "요리 레벨·조리·의뢰·걸작과 요리법 기록.", sequential: false },
  { id: "artisan", name: "제작과 장인", subtitle: "길드 제작소와 대장장이 숙련 기록.", sequential: false },
  { id: "guild_facilities", name: "길드 시설", subtitle: "식당·훈련장·원정·제작소·연금·교역 활동 기록.", sequential: false },
  { id: "challenge", name: "도전 콘텐츠", subtitle: "숙련의 탑 정복 기록.", sequential: false },
  { id: "collection", name: "부와 명예", subtitle: "지갑·은행 합산 골드와 칭호 수집 기록.", sequential: false },
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
  ...COOKING,
  ...ARTISAN,
  ...GUILD_FACILITIES,
  ...CHALLENGE,
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
  href: string | null;
  reward: QuestReward;
  status: QuestStatus;
  points: number;
  progress: number | null;
  goal: number | null;
  detailKind: QuestDetailKind | null;
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

// 현재 콘텐츠로 달성할 수 없는 미래 마일스톤은 진행 중 목록·총점에서 제외한다.
// 과거 몬스터 기록으로 이미 조건을 채웠거나 수령한 이용자의 권리는 그대로 보존한다.
function isContentAvailable(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): boolean {
  if (def.requiredHuntableSpecies == null) return true;
  return (
    HUNT_MONSTER_SPECIES_COUNT >= def.requiredHuntableSpecies ||
    claimed.has(def.id) ||
    def.check(ctx)
  );
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
  if (!isContentAvailable(def, ctx, claimed)) return false;
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
    (q) =>
      isVisible(q, ctx) &&
      isContentAvailable(q, ctx, claimed) &&
      !hiddenByChain(q, claimed),
  ).map((q) => ({
    id: q.id,
    line: q.line,
    title: q.title,
    desc: q.desc,
    href: q.href ?? null,
    reward: q.reward,
    status: questStatus(q, ctx, claimed),
    points: q.points ?? 0,
    progress: q.progress ? Math.max(0, Math.floor(q.progress(ctx))) : null,
    goal: q.goal ?? null,
    detailKind: q.detailKind ?? null,
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
  const achievements = V2_QUESTS.filter(
    (q) =>
      !isTutorialLine(q.line) && isContentAvailable(q, ctx, claimed),
  );
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

// 홈 배너용 — 사용자가 추적한 진행 중 업적을 우선하고, 없으면 V2_QUESTS 정의 순서 내에서
// 수령 가능 > 진행 중 순으로 자동 추천한다. 추적 업적을 수령했거나 숨겨졌으면 자동 추천으로 복귀.
export function currentGuideQuest(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
  trackedQuestId?: string | null,
): QuestView | null {
  const views = deriveQuestViews(ctx, claimed);
  const tracked = trackedQuestId
    ? views.find(
        (view) =>
          view.id === trackedQuestId &&
          !isTutorialLine(view.line) &&
          (view.status === "active" || view.status === "claimable"),
      )
    : null;
  return (
    tracked ??
    views.find((v) => v.status === "claimable") ??
    views.find((v) => v.status === "active") ??
    null
  );
}
