// v2 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 신규 플레이어를 "첫 전투 → 장비 → 전직 →
// 수행 → 프론티어" 순서로 리드하고, 콘텐츠/사회 시스템 + 엔드 마일스톤을 안내.
//
// 표시 정책: 유저에게 직업 "차수(N차)" 구분은 노출하지 않는다 — 안내 문구는 "전직/정점"
//   처럼 숫자 없이 쓰고, 차수는 내부 판정(QuestCtx.tier)으로만 사용한다.
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

export type QuestLineId = string;

export type QuestReward = {
  /** 골드(HP 회복 통화 겸용). */
  gold?: number;
  /** 장비 1개 지급(스타터 장비 — 카탈로그 스탯, 굴림 없음). */
  equip?: V2EquipmentId;
  /** 스태미나 회복약 N개 지급(stamina-potions.v1 — 번들 보상과 동일 소비템). */
  staminaPotions?: number;
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
  /** 처치한 협동 보스 수(BOSS_TITLE_IDS 첫 처치 칭호 보유 수). adventure-log.v2.titles. */
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
  /** 총 누적레벨(전 직군 합·환생 보존). proficiency totalCumLevel. */
  cumLevel: number;
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
  /** 보물 도감 골동품 종 수. treasure-codex.v1. */
  antiquesFound: number;
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
    reward: { staminaPotions: 1, equip: "v2_chain_mail" },
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
    // 누적레벨 기준(현재 레벨 아님) — 다음 단계 "2차 전직"은 재전직(환생)이 강제이고
    // 환생은 현재 레벨을 1로 리셋한다. level 기준이면 환생 직후 이 조건이 다시 거짓이 돼
    // 순차 라인의 뒤 퀘스트(전직)가 재잠금된다. cumLevel 은 환생에도 보존·단조증가.
    check: (c) => c.cumLevel >= V2_LEVEL_CAP,
  },
  {
    id: "g_advance2",
    line: "growth",
    title: "전직",
    desc: "성장의 신전에서 더 강한 직업으로 전직하세요.",
    reward: { staminaPotions: 1 },
    check: (c) => c.tier >= 2,
  },
  {
    // id 는 옛 이름(g_passive) 유지 — 바꾸면 기존 수령 기록이 끊긴다.
    id: "g_passive",
    line: "growth",
    title: "거듭된 전직",
    desc: "한 번 더 전직해 직업을 더 키우세요.",
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

// 직업 전용 "차수 달성" 라인(class_*)은 제거됨(2026-06-26). 차수(N차)를 유저에게 노출하지
//   않기로 하면서, 직군별로 같은 전직 마일스톤을 반복하던 라인이 의미를 잃었다. 전직 안내는
//   성장의 길(튜토리얼)과 정점을 향해(ascend) 라인이 숫자 없이 대신한다. 옛 보유 수령 id
//   (class_*/c_*_spec·deepen·apex)는 세이브 claimed 집합에 dormant 로 남는다(비파괴).

// ── 모험가의 길(콘텐츠·사회, 마일스톤 독립) ─────────────────────────────────
const SOCIAL: QuestDef[] = [
  {
    id: "s_guild",
    line: "social",
    title: "길드의 일원",
    desc: "길드에 가입하거나 길드를 창단하세요.",
    reward: { gold: 500 },
    check: (c) => c.hasGuild,
  },
  {
    id: "s_trade",
    line: "social",
    title: "첫 거래",
    desc: "거래소에서 거래를 성사시키세요. (구매 또는 판매)",
    reward: { gold: 500 },
    check: (c) => c.hasTraded,
  },
  {
    id: "s_arena",
    line: "social",
    title: "투기장 입문",
    desc: "투기장에서 한 판 겨뤄보세요.",
    reward: { gold: 500 },
    check: (c) => c.arenaPlayed,
  },
  {
    id: "s_arena_win",
    line: "social",
    title: "투기장의 승자",
    desc: "투기장에서 1승을 거두세요.",
    reward: { gold: 700 },
    check: (c) => c.arenaWins >= 1,
  },
];

// ── 수집과 탐험(마일스톤, 독립) ─────────────────────────────────────────────
const COLLECT: QuestDef[] = [
  {
    id: "x_full_gear",
    line: "collect",
    title: "완전 무장",
    desc: "장비 6부위를 모두 장착하세요.",
    reward: { gold: 400 },
    check: (c) => c.equippedCount >= 6,
  },
  {
    id: "x_outposts",
    line: "collect",
    title: "거점 탐험가",
    desc: "거점 10곳을 발견하세요.",
    reward: { gold: 600 },
    check: (c) => c.outpostsDiscovered >= 10,
  },
  {
    id: "x_rich",
    line: "collect",
    title: "재력가",
    desc: "골드 10,000을 보유하세요.",
    reward: { gold: 800 },
    check: (c) => c.gold >= 10000,
  },
  {
    id: "x_titles",
    line: "collect",
    title: "칭호 수집가",
    desc: "칭호 3개를 획득하세요.",
    reward: { gold: 1000 },
    check: (c) => c.titleCount >= 3,
  },
];

// ── 정점을 향해(마일스톤, 독립) ─────────────────────────────────────────────
const ASCEND: QuestDef[] = [
  {
    id: "a_boss",
    chain: "ascend_boss",
    line: "ascend",
    title: "협동 보스 토벌",
    desc: "협동 보스 토벌에 참여해 처치 보상을 받으세요. (전투 → 협동 보스)",
    reward: { gold: 1200 },
    check: (c) => c.bossKills >= 1,
  },
  {
    id: "a_depth25",
    chain: "ascend_depth",
    line: "ascend",
    title: "심층 개척",
    desc: "사냥터 깊이 19까지 진출하세요.",
    reward: { gold: 2000 },
    check: (c) => c.frontierDepth >= 19,
  },
  {
    id: "a_unique",
    chain: "ascend_unique",
    line: "ascend",
    title: "유니크 수집가",
    desc: "유니크 장비를 1개 이상 획득하세요.",
    reward: { gold: 1500 },
    check: (c) => c.uniqueOwned >= 1,
  },
  {
    id: "a_depth40",
    chain: "ascend_depth",
    line: "ascend",
    title: "심연 개척",
    desc: "사냥터 깊이 34까지 진출하세요.",
    reward: { gold: 2500 },
    check: (c) => c.frontierDepth >= 34,
  },
  {
    id: "a_boss_master",
    chain: "ascend_boss",
    line: "ascend",
    title: "보스 마스터",
    desc: "협동 보스 3종을 모두 토벌하세요.",
    reward: { gold: 3000 },
    check: (c) => c.bossKills >= 3,
  },
  {
    id: "a_unique5",
    chain: "ascend_unique",
    line: "ascend",
    title: "유니크 컬렉터",
    desc: "유니크 장비를 5개 이상 수집하세요.",
    reward: { gold: 2500 },
    check: (c) => c.uniqueOwned >= 5,
  },
  {
    id: "a_depth48",
    chain: "ascend_depth",
    line: "ascend",
    title: "프론티어의 끝",
    desc: "사냥터 깊이 42(마지막 테마 밴드)까지 진출하세요.",
    reward: { gold: 4000 },
    check: (c) => c.frontierDepth >= 42,
  },
  {
    id: "a_apex",
    line: "ascend",
    title: "정점",
    desc: "직업의 정점에 도달하세요.",
    reward: { gold: 3000 },
    check: (c) => c.tier >= 4,
  },
];

// ── 전쟁의 길(순차) — 거점 점령~금고 탈환 전쟁 시스템 가이드 ──────────────────
const WAR: QuestDef[] = [
  {
    id: "w_first_claim",
    line: "war",
    title: "첫 출정",
    desc: "길드에 가입하고 거점 점령을 시도해보세요 (지도에서 거점 선택).",
    reward: { gold: 300 },
    check: (c) => c.claimAttempted,
  },
  {
    id: "w_hold",
    line: "war",
    title: "깃발을 꽂다",
    desc: "거점을 점령해 내 길드의 영토로 만드세요.",
    reward: { gold: 500 },
    check: (c) => c.hasOutpost || c.warCaptures >= 1,
  },
  {
    id: "w_siege5",
    line: "war",
    title: "공성 전문가",
    desc: "점령전(일기토/공성)에서 5회 승리하세요.",
    reward: { gold: 800 },
    check: (c) => c.siegeWins >= 5,
  },
  {
    id: "w_eject",
    line: "war",
    title: "침입자 토벌",
    desc: "내 길드 거점에 침입한 모험가를 토벌하세요.",
    reward: { gold: 600 },
    check: (c) => c.warEjectWins >= 1,
  },
  {
    id: "w_treasury",
    line: "war",
    title: "금고 사냥꾼",
    desc: "거점 금고에서 누적 3,000 G 를 회수하세요 (점령 시 자동 회수 포함).",
    reward: { gold: 1000 },
    check: (c) => c.warTreasuryGold >= 3000,
  },
  {
    id: "w_captures5",
    line: "war",
    title: "정복자",
    desc: "거점 점령(함락 포함)을 누적 5회 달성하세요.",
    reward: { gold: 1500 },
    check: (c) => c.warCaptures >= 5,
  },
];

// ── 윤회의 길 — 환생·누적레벨 마일스톤(독립) ─────────────────────────────────
const REBIRTH: QuestDef[] = [
  {
    id: "r_first",
    chain: "rebirth_cum",
    line: "rebirth",
    title: "다시 태어나다",
    desc: `레벨 한계(${V2_LEVEL_CAP})에 도달한 뒤 성장의 신전에서 환생하세요 (누적레벨 ${V2_LEVEL_CAP + 1}+).`,
    reward: { gold: 1000 },
    check: (c) => c.cumLevel >= V2_LEVEL_CAP + 1,
  },
  {
    id: "r_300",
    chain: "rebirth_cum",
    line: "rebirth",
    title: "세 번째 생",
    desc: "누적레벨 300에 도달하세요.",
    reward: { gold: 1500 },
    check: (c) => c.cumLevel >= 300,
  },
  {
    id: "r_600",
    chain: "rebirth_cum",
    line: "rebirth",
    title: "윤회의 수레바퀴",
    desc: "누적레벨 600에 도달하세요.",
    reward: { gold: 2000 },
    check: (c) => c.cumLevel >= 600,
  },
  {
    id: "r_1200",
    chain: "rebirth_cum",
    line: "rebirth",
    title: "천년의 혼",
    desc: "누적레벨 1,200에 도달하세요.",
    reward: { gold: 3000 },
    check: (c) => c.cumLevel >= 1200,
  },
  {
    id: "r_2000",
    chain: "rebirth_cum",
    line: "rebirth",
    title: "윤회의 정점",
    desc: "누적레벨 2,000에 도달하세요.",
    reward: { gold: 5000 },
    check: (c) => c.cumLevel >= 2000,
  },
];

// ── 생활의 달인 — 낚시·보물 도감(독립) ──────────────────────────────────────
const LIFE: QuestDef[] = [
  {
    id: "l_fish1",
    chain: "life_fish",
    line: "life",
    title: "첫 손맛",
    desc: "낚시터에서 첫 물고기를 낚으세요.",
    reward: { gold: 200 },
    check: (c) => c.fishSpecies >= 1,
  },
  {
    id: "l_fish10",
    chain: "life_fish",
    line: "life",
    title: "어부의 길",
    desc: "어종 도감 10종을 채우세요.",
    reward: { gold: 500 },
    check: (c) => c.fishSpecies >= 10,
  },
  {
    id: "l_fish25",
    chain: "life_fish",
    line: "life",
    title: "강태공",
    desc: "어종 도감 25종을 채우세요 (전체 34종).",
    reward: { gold: 1200 },
    check: (c) => c.fishSpecies >= 25,
  },
  {
    id: "l_dig1",
    chain: "life_antique",
    line: "life",
    title: "첫 발굴",
    desc: "보물 탐사에서 첫 골동품을 발굴하세요.",
    reward: { gold: 200 },
    check: (c) => c.antiquesFound >= 1,
  },
  {
    id: "l_antique8",
    chain: "life_antique",
    line: "life",
    title: "감정가",
    desc: "골동품 도감 8종을 채우세요.",
    reward: { gold: 500 },
    check: (c) => c.antiquesFound >= 8,
  },
  {
    id: "l_antique20",
    chain: "life_antique",
    line: "life",
    title: "고고학자",
    desc: "골동품 도감 20종을 채우세요 (전체 24종).",
    reward: { gold: 1200 },
    check: (c) => c.antiquesFound >= 20,
  },
];

// ── 토벌 도감 — 사냥 수집 심화(독립). 밴드 입성은 정점(a_depth48) 앞을 채운다 ──
const BESTIARY: QuestDef[] = [
  {
    id: "b_species15",
    chain: "bestiary_species",
    line: "bestiary",
    title: "사냥꾼의 기록",
    desc: "서로 다른 몬스터 15종을 처치하세요.",
    reward: { gold: 400 },
    check: (c) => c.speciesKilled >= 15,
  },
  {
    id: "b_species35",
    chain: "bestiary_species",
    line: "bestiary",
    title: "토벌 도감의 주인",
    desc: "서로 다른 몬스터 35종을 처치하세요 (전체 41종).",
    reward: { gold: 1200 },
    check: (c) => c.speciesKilled >= 35,
  },
  {
    id: "b_band_canyon",
    chain: "bestiary_bands",
    line: "bestiary",
    title: "협곡 입성",
    desc: "사냥터 깊이 7(마른 협곡)에 진출하세요.",
    reward: { gold: 300 },
    check: (c) => c.frontierDepth >= 7,
  },
  {
    id: "b_band_cave",
    chain: "bestiary_bands",
    line: "bestiary",
    title: "동굴 입성",
    desc: "사냥터 깊이 19(심층 동굴)에 진출하세요.",
    reward: { gold: 500 },
    check: (c) => c.frontierDepth >= 19,
  },
  {
    id: "b_band_swamp",
    chain: "bestiary_bands",
    line: "bestiary",
    title: "늪지 입성",
    desc: "사냥터 깊이 31(리자드 늪지)에 진출하세요.",
    reward: { gold: 800 },
    check: (c) => c.frontierDepth >= 31,
  },
  {
    id: "b_battles1000",
    chain: "bestiary_battles",
    line: "bestiary",
    title: "역전의 용사",
    desc: "누적 전투 1,000회를 달성하세요.",
    reward: { gold: 800 },
    check: (c) => c.battleCount >= 1000,
  },
  {
    id: "b_battles5000",
    chain: "bestiary_battles",
    line: "bestiary",
    title: "전장의 화신",
    desc: "누적 전투 5,000회를 달성하세요.",
    reward: { gold: 2000 },
    check: (c) => c.battleCount >= 5000,
  },
];

// ── 강화의 길 — 장비 강화 마일스톤(독립). 골드만 강화 가능이라 첫 퀘부터 전 유저 열림 ──
const ENHANCE: QuestDef[] = [
  {
    id: "e_first",
    chain: "enhance_level",
    line: "enhance",
    title: "첫 단조",
    desc: "대장간에서 장비를 +1 강화하세요 (골드만으로도 가능).",
    reward: { gold: 200 },
    check: (c) => c.maxEnhanceLevel >= 1,
  },
  {
    id: "e_stone",
    line: "enhance",
    title: "반짝이는 돌",
    desc: "사냥에서 강화석을 주워 보유하세요 (붉은/푸른 무관).",
    reward: { gold: 300 },
    check: (c) => c.enhanceStones >= 1,
  },
  {
    id: "e_plus3",
    chain: "enhance_level",
    line: "enhance",
    title: "단련",
    desc: "장비 하나를 +3까지 강화하세요.",
    reward: { gold: 400 },
    check: (c) => c.maxEnhanceLevel >= 3,
  },
  {
    id: "e_plus5",
    chain: "enhance_level",
    line: "enhance",
    title: "숙련된 단조",
    desc: "장비 하나를 +5까지 강화하세요.",
    reward: { gold: 800 },
    check: (c) => c.maxEnhanceLevel >= 5,
  },
  {
    id: "e_plus7",
    chain: "enhance_level",
    line: "enhance",
    title: "고강의 영역",
    desc: "장비 하나를 +7까지 강화하세요 (+6부터는 실패 시 하락!).",
    reward: { gold: 1500 },
    check: (c) => c.maxEnhanceLevel >= 7,
  },
  {
    id: "e_plus10",
    chain: "enhance_level",
    line: "enhance",
    title: "전설의 +10",
    desc: "장비 하나를 +10(최대)까지 강화하세요.",
    reward: { gold: 5000 },
    check: (c) => c.maxEnhanceLevel >= 10,
  },
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
    subtitle: "첫 전투부터 직업 전직까지 — 차례로 따라오세요.",
    sequential: true,
    tutorial: true,
  },
  {
    id: "social",
    name: "모험가의 길",
    subtitle: "길드·거래소·투기장 — 모험가의 세계를 경험하세요.",
    sequential: false,
  },
  {
    id: "collect",
    name: "수집과 탐험",
    subtitle: "장비·거점·골드·칭호 — 모으고 누비세요.",
    sequential: false,
  },
  {
    id: "ascend",
    name: "정점을 향해",
    subtitle: "더 깊은 곳과 직업의 정점을 향한 마일스톤.",
    sequential: false,
  },
  {
    id: "war",
    name: "전쟁의 길",
    subtitle: "점령·공성·토벌·금고 탈환 — 영토 전쟁에 뛰어드세요.",
    sequential: true,
  },
  {
    id: "rebirth",
    name: "윤회의 길",
    subtitle: "환생을 거듭하며 누적레벨을 쌓으세요.",
    sequential: false,
  },
  {
    id: "life",
    name: "생활의 달인",
    subtitle: "낚시와 보물 발굴 — 전장 밖의 즐거움.",
    sequential: false,
  },
  {
    id: "bestiary",
    name: "토벌 도감",
    subtitle: "몬스터 도감·밴드 입성·누적 전투 마일스톤.",
    sequential: false,
  },
  {
    id: "enhance",
    name: "강화의 길",
    subtitle: "대장간에서 장비를 단련하세요 — +10 전설까지.",
    sequential: false,
  },
];

export const V2_QUESTS: readonly QuestDef[] = [
  ...GROWTH,
  ...BASICS,
  ...SOCIAL,
  ...COLLECT,
  ...ASCEND,
  ...WAR,
  ...REBIRTH,
  ...LIFE,
  ...BESTIARY,
  ...ENHANCE,
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
  }));
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
