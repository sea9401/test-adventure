// v2 협동 보스 — 소환서로 소환하는 공유 HP 월드 보스 (2026-06-13).
//
// 루프(exten 원형 — sea9401/exten coop 시스템의 v2 이식):
//   사냥 승리 → 소환서(재료) 드랍 → N장 소모해 보스 소환 → 모든 유저가 공유 HP 를
//   누적 데미지로 깎음(1회 공격 = COOP_ATTACK_TURNS 턴 시뮬, 보스가 반격) → 처치 시
//   기여도 비율 5티어 보상(골드 + 보스 전용 유니크 확률 + 첫 처치 칭호).
//
// 옛 솔로 "보스 도전"(#622 파일럿, dungeonBosses.ts)은 이 시스템으로 대체 — 보스 3종의
// 이름/아트/스킬/유니크/칭호 자산은 그대로 협동 보스로 승계(보유 유저 호환).
// DB 는 v1 협동 인프라(coop_boss_sessions/contributors/attack_log) 재사용 — regionId
// 컬럼에 CoopBossKindId 를 넣는다(v1 COOP_BOSSES 는 빈 맵이라 cron/respawn 과 충돌 없음).

import type { Monster } from "@/adventure/data/monsters/types";
import { scaleMonsterForFloor } from "./monsterScale";
import { V2_CORE_LOOP_V2 } from "./coreLoopConfig";
import type { V2EquipmentId } from "./v2Equipment";
import type { V2MonsterStatusSkillId } from "./v2Skills";

// === 소환서 (재료) =====================================================
// 강화석 패턴 — V2_MATERIALS 카탈로그 등재(인벤 재료 탭·거래소 거래), NPC 환금 비등재,
// 드랍은 hunt 라우트의 독립 롤(V2_MATERIALS_ENABLED 무관).

export const SUMMON_SCROLL_MATERIAL_ID = "v2_boss_summon_scroll";

// 사냥 승리당 소환서 드랍 확률(%). ⚠️ 라이브 캘리브 다이얼 — 헤비 유저 기준 일 수~십수 장
// 페이스를 의도(스태미나 일 회복 ~2880 × 0.5% ≈ 14장). 레어맵 배수 미적용(별도 축).
export const SUMMON_SCROLL_DROP_PCT = 0.5;

// 사냥 승리 시 소환서 드랍 굴림(순수). rng() ∈ [0,1). 통과 시 1장.
export function rollSummonScrollDrop(rng: () => number): number {
  return rng() * 100 < SUMMON_SCROLL_DROP_PCT ? 1 : 0;
}

// === 보상 티어 =========================================================
// 누적 데미지 / maxHp 비율 임계 — v1 협동 보스와 동일 5단계(검증된 값 승계).

export type CoopRewardTier = "bronze" | "silver" | "gold" | "epic" | "legend";

export const COOP_TIER_ORDER: CoopRewardTier[] = [
  "bronze",
  "silver",
  "gold",
  "epic",
  "legend",
];

export const COOP_TIER_THRESHOLDS: Record<CoopRewardTier, number> = {
  bronze: 0.03,
  silver: 0.1,
  gold: 0.2,
  epic: 0.4,
  legend: 0.6,
};

export const COOP_TIER_LABEL: Record<CoopRewardTier, string> = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  epic: "EPIC",
  legend: "LEGEND",
};

/** 누적 데미지 비율(0~1) → 도달한 최고 티어. bronze 미달이면 null. */
export function coopTierForRatio(ratio: number): CoopRewardTier | null {
  let achieved: CoopRewardTier | null = null;
  for (const tier of COOP_TIER_ORDER) {
    if (ratio >= COOP_TIER_THRESHOLDS[tier]) achieved = tier;
    else break;
  }
  return achieved;
}

// === 보상 = SP 열매 (단일 보상·티어별 확률 굴림) ========================
// 협동 보스 보상 개편(2026-06-26·오너): 골드·유니크·칭호 보상 폐지. 보상은 **SP 열매**뿐.
//   도달한 각 보상 티어를 **독립 굴림**한다 — 통과 시 그 보스 등급 열매 1개. BRONZE/SILVER 는
//   0(GOLD 부터). LEGEND 도달 = GOLD+EPIC+LEGEND 세 번 굴림 = 최대 3개. 전 보스 공통 확률.
//   ⚠️ 캘리브 다이얼. 열매 등급은 보스 고유(산악→I·협곡→II·호수→III, spFruit.fruitTierForBoss).
export const COOP_SP_FRUIT_CHANCE: Record<CoopRewardTier, number> = {
  bronze: 0,
  silver: 0,
  gold: 0.1, // 라이브 하향(2026-06-26) — 15%→10%
  epic: 0.15, // 25%→15%
  legend: 0.2, // 35%→20%
};

// 도달 티어까지 SP 열매 굴림(순수). rng() ∈ [0,1). 보상 가능 티어(확률>0) 중 도달한 것을
//   각각 독립 굴림 → 통과 수 = 획득 개수(0~3). reachedTier=null(브론즈 미달)이면 0.
export function rollCoopSpFruits(
  reachedTier: CoopRewardTier | null,
  rng: () => number,
): number {
  if (!reachedTier) return 0;
  const reachedIdx = COOP_TIER_ORDER.indexOf(reachedTier);
  let count = 0;
  for (const t of COOP_TIER_ORDER) {
    if (COOP_TIER_ORDER.indexOf(t) > reachedIdx) break; // 미도달 티어
    const chance = COOP_SP_FRUIT_CHANCE[t];
    if (chance <= 0) continue; // 보상 없는 티어(bronze/silver)
    if (rng() < chance) count++;
  }
  return count;
}

// 도달 티어에서 받을 수 있는 SP 열매 최대 개수(보상 가능 티어 수). UI 표시용.
export function coopSpFruitMaxAt(tier: CoopRewardTier | null): number {
  if (!tier) return 0;
  const idx = COOP_TIER_ORDER.indexOf(tier);
  return COOP_TIER_ORDER.filter(
    (t) => COOP_SP_FRUIT_CHANCE[t] > 0 && COOP_TIER_ORDER.indexOf(t) <= idx,
  ).length;
}

// === 보스 전용 시그니처 유니크 드랍 (트로피·EPIC+ 확률) ====================
// 보상 개편 후 유니크는 SP 열매와 별개의 희귀 트로피. 도달 티어 단일 굴림(누적 아님)으로 1개.
//   GOLD 이하 0 — 상위 기여자만. ⚠️ 캘리브 다이얼. 어떤 유니크인지는 보스 uniqueIds.
export const COOP_UNIQUE_CHANCE: Record<CoopRewardTier, number> = {
  bronze: 0,
  silver: 0,
  gold: 0,
  epic: 0.12, // 라이브 상향(2026-06-26) — 5%→12%
  legend: 0.25, // 라이브 상향 — 12%→25%
};

// 유니크 드랍 굴림(순수). rng() ∈ [0,1). 도달 티어 확률 단일 굴림 — 통과 시 true.
export function rollCoopUnique(
  reachedTier: CoopRewardTier | null,
  rng: () => number,
): boolean {
  if (!reachedTier) return false;
  return rng() < COOP_UNIQUE_CHANCE[reachedTier];
}

// === 공격 다이얼 =======================================================

// 1회 공격 시뮬 턴 수(플레이어 턴 기준 — resolveBattle maxTurns). 강빌드도 1회로
// 보스를 통째 못 가져가게 하는 1차 가드(2차는 티어 캡·쿨다운).
export const COOP_ATTACK_TURNS = 20;

// 공격 스태미너 비용 — 일반 사냥(HUNT_COST=1)의 20배. ⚠️ 캘리브 다이얼. (코어루프 on 이면
// 스태미나 폐지 → 무료, 소환권이 비용. coopAttackCooldownMs 의 180초가 throttle.)
export const COOP_ATTACK_STAMINA_COST = 20;

// 재공격 쿨다운(ms) — 유저별(lastAttackAt). 매크로/원맨 클리어 견제. ⚠️ 캘리브 다이얼.
export const COOP_ATTACK_COOLDOWN_MS = 2 * 60 * 1000; // 120s — flag off(스태미나 모델)
export const COOP_ATTACK_COOLDOWN_MS_V2 = 180 * 1000; // 180s — 코어루프(무료 공격 throttle, 유저 확정)
// 코어루프 on 이면 180s, off 면 120s.
export function coopAttackCooldownMs(): number {
  return V2_CORE_LOOP_V2 ? COOP_ATTACK_COOLDOWN_MS_V2 : COOP_ATTACK_COOLDOWN_MS;
}

// === 가시성/공격 권한 — 코어루프 협동보스 리워크 ===========================
// 소환권이 비용이라 권한자는 무료 공격. 소환 시 소환자가 공개 범위를 고른다.
export type CoopVisibility = "public" | "guild_only" | "summoner_only";
export const COOP_VISIBILITY_VALUES: readonly CoopVisibility[] = [
  "public",
  "guild_only",
  "summoner_only",
];
export function parseCoopVisibility(v: unknown): CoopVisibility {
  return v === "guild_only" || v === "summoner_only" ? v : "public";
}

// 가시성 표시 라벨 + 선택지 — 소환 UI(목록)와 소환 후 변경 UI(상세) 공용.
export const COOP_VISIBILITY_LABEL: Record<CoopVisibility, string> = {
  public: "공개",
  guild_only: "길드원만",
  summoner_only: "나만",
};
export const COOP_VISIBILITY_OPTIONS: readonly (readonly [
  CoopVisibility,
  string,
])[] = COOP_VISIBILITY_VALUES.map((v) => [v, COOP_VISIBILITY_LABEL[v]] as const);

// 공격/조회 권한 (순수). 가시성 + 소환자/소환 시점 길드 기준. 미지정/구행은 public 폴백.
export function canAccessCoopBoss(
  session: {
    visibility?: string | null;
    summonerId?: string | null;
    summonerGuildId?: number | null;
  },
  viewer: { userId: string; guildId: number | null },
): boolean {
  const vis = session.visibility ?? "public";
  if (vis === "guild_only") {
    return (
      session.summonerGuildId != null &&
      session.summonerGuildId === viewer.guildId
    );
  }
  if (vis === "summoner_only") {
    return session.summonerId === viewer.userId;
  }
  return true; // public 또는 미지정
}

// 같은 종류 동시 소환 상한 — 소환서 비용이 1차 게이트라 느슨한 안전캡(목록/쿼리 비대화 방지).
// ⚠️ 캘리브 다이얼.
export const MAX_ACTIVE_PER_KIND = 5;

// === 보스 정의 =========================================================

export type CoopBossKindId =
  | "mountain_chief"
  | "canyon_predator"
  | "lake_sovereign";

// 발악 스테이지 — 전역 공유 HP 비율이 hpFraction 이하면 적용(누적). 시뮬이 공격 단위
// stateless 라 페이즈를 "현재 상태"로 미리 구워 넣는다 — 토벌이 진행될수록 모두에게
// 더 사나운 보스("레이드가 깊어질수록 위험"). note 는 전투 로그 첫머리 안내.
export type CoopEnrageStage = {
  hpFraction: number;
  note: string;
  /** ATK 곱(스케일 후 적용). */
  atkMult?: number;
  /** DEF 가산(스케일 후 적용). */
  defBonus?: number;
  /** 회피율 가산(%p). */
  evasionBonus?: number;
};

export type CoopBossKind = {
  id: CoopBossKindId;
  name: string;
  /** 보스 상세 화면 플레이버 한 줄. */
  desc: string;
  /** 소환에 소모하는 소환서 장수. */
  scrollCost: number;
  /** 협동 공유 HP — base.hp 와 별개(솔로 hp 는 시뮬 스탯에만 의미). ⚠️ 캘리브 다이얼. */
  sharedMaxHp: number;
  /** 시뮬 스탯 스케일 깊이 — scaleMonsterForFloor 기준(공유 HP 는 별도). */
  anchorDepth: number;
  /** flat 베이스 Monster — 이름/이미지/스킬/페이즈 보존(옛 테마 보스 승계). */
  base: Monster;
  /** 보스 전용 유니크 풀 — 휴면(2026-06-26 보상 개편으로 드랍 폐지). 카탈로그·보유분 보존,
   *  새 유니크 설계 시 재배선. BOSS_UNIQUE_IDS(도감/드랍검증)만 참조. */
  uniqueIds: V2EquipmentId[];
  /** 첫 처치 칭호 id — 휴면(보상 개편으로 지급 폐지). 카탈로그·기보유분 보존, 가이드 퀘스트
   *  bossKills 는 BOSS_TITLE_TO_KIND 로 레거시 호환(v2QuestContext). */
  titleId: string;
  /** 평타 부가 상태이상(매 적중 확률 발동) — 중독/둔화/출혈. */
  statusSkill?: V2MonsterStatusSkillId;
  /** 발악 스테이지 — hpFraction 내림차순 권장(전부 누적 적용). ⚠️ 수치 캘리브 다이얼. */
  enrageStages: CoopEnrageStage[];
  /** 보스 특성 표시 문구(상세/소환 정보 카드) — 스킬·상태이상·발악 요약. */
  traits: string[];
};

// 보스 베이스 — 옛 dungeonBosses.ts(#622 파일럿) 승계 + 협동 레이드 킷(#715).
// phaseTrigger(시뮬 내부 HP 비율 트리거)는 폐기 — 시뮬이 전역 잔여 HP 에서 시작하므로
// 발악은 CoopBossKind.enrageStages(전역 비율)로 coopBossForBattle 이 미리 구워 넣는다.

const MOUNTAIN_CHIEF_BASE: Monster = {
  name: "산군",
  tags: ["humanoid"],
  image: "/images/monster/v2/sangoon.webp",
  hp: 620,
  atk: 30,
  def: 14,
  // spd ↑(2026-06-26) — 협동 보스는 effectiveMonsterSpd(10+raw×6)로 매핑돼 필드 1~9 밴드에선
  //   엔드 플레이어(spd 200~300) 대비 반격이 너무 굼떴다. 레이드 보스라 밴드 밖으로 올림(유효 ~95).
  spd: 14,
  exp: 90,
  skill: {
    kind: "heavy_blow",
    name: "분쇄 강타",
    everyPhases: 3,
    multiplier: 1.8,
  },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.2,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_mountain",
  // v2 시그니처 액티브(MP 게이트) — 포효로 자기 공격력을 끌어올린다. 정해진 MP·전투 내 재생 없음
  //   → MP 소진(≈3회) 후엔 평타·기존 강타만. (scaleMonsterForFloor 가 ...monster 로 보존.)
  v2Skills: { learned: ["mob_savage_roar"], equipped: ["mob_savage_roar"] },
  v2MaxMp: 75,
};

const CANYON_PREDATOR_BASE: Monster = {
  name: "스콜피온 킹",
  tags: ["beast"],
  image: "/images/monster/v2/scorpionking.webp",
  element: "earth",
  hp: 600,
  atk: 31,
  def: 13,
  spd: 15, // ↑ 레이드 보스 속도(유효 ~101) — MOUNTAIN_CHIEF_BASE 주석 참고.
  exp: 95,
  skill: { kind: "pierce", name: "절벽 발톱", armorPierce: 6 },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.2,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_canyon",
  // v2 시그니처 액티브(MP 게이트) — 강한 물리 단일타. MP 소진(≈3회) 후엔 평타·절벽 발톱만.
  v2Skills: { learned: ["mob_crushing_blow"], equipped: ["mob_crushing_blow"] },
  v2MaxMp: 90,
};

const LAKE_SOVEREIGN_BASE: Monster = {
  name: "호수의 괴물",
  tags: ["golem"],
  image: "/images/monster/v2/nessi.webp",
  element: "water",
  hp: 680,
  atk: 29,
  def: 16,
  spd: 12, // ↑ 레이드 보스 속도(유효 ~83·느린 골렘이라 셋 중 최저) — MOUNTAIN_CHIEF_BASE 주석 참고.
  exp: 100,
  // 한기 스택 기믹(옛 월드 보스 「별을 잊은 것」 계열) — 맞을수록 한기가 쌓여 고정
  // 피해 + 회피 감소. "오래 버티는 싸움일수록 아프다" 시간압 — 20턴 공격과 맞물림.
  // ⚠️ 수치 캘리브 다이얼.
  skill: {
    kind: "chill",
    name: "얼어붙는 손길",
    perHit: 1,
    threshold: 3,
    dmgPerStack: 25,
    maxStacks: 8,
    defMitigationFraction: 0.3,
    evasionPenaltyPerStack: 1,
  },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.2,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_lake",
  // v2 시그니처 액티브(MP 게이트) — 비전 폭발(마법 단일타). MP 소진(≈3회) 후엔 평타·한기만.
  v2Skills: { learned: ["mob_arcane_nova"], equipped: ["mob_arcane_nova"] },
  v2MaxMp: 105,
};

// === 소환 유지시간 — 공유 HP 비례 ====================================
// HP 가 클수록 다 같이 깎을 시간이 필요 — HP COOP_DURATION_HP_PER_HOUR 당 1시간,
// 최소 2시간 ~ 최대 24시간(사용자 결정 2026-06-13). ⚠️ 캘리브 다이얼.
// 현 3종(HP ×2 리워크): 30k→6h · 80k→16h · 200k→24h(캡). HP 2배라 토벌 시간도 비례 확대.
export const COOP_DURATION_HP_PER_HOUR = 5_000;
export const COOP_DURATION_MIN_MS = 2 * 3_600_000;
export const COOP_DURATION_MAX_MS = 24 * 3_600_000;

export function coopBossDurationMs(kind: CoopBossKind): number {
  const ms = (kind.sharedMaxHp / COOP_DURATION_HP_PER_HOUR) * 3_600_000;
  return Math.min(
    COOP_DURATION_MAX_MS,
    Math.max(COOP_DURATION_MIN_MS, Math.round(ms)),
  );
}

/** 유지시간 표시 라벨 — "3시간"/"3시간 30분". UI·매뉴얼 공용. */
export function coopBossDurationLabel(kind: CoopBossKind): string {
  const m = Math.round(coopBossDurationMs(kind) / 60_000);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}시간 ${rest}분` : `${h}시간`;
}

// 3단 사다리 — 소환서 5/10/20장, 시뮬 스탯은 깊이 12/24/42 스케일(상위 보스일수록
// 반격이 아파 약빌드는 비싼 보스에 함부로 못 붙는다). 공유 HP·보상은 ⚠️ 라이브 캘리브.
// 보상 = SP 열매뿐(COOP_SP_FRUIT_CHANCE·티어별 확률 굴림). 골드·유니크·칭호 보상 폐지(2026-06-26).
export const COOP_BOSSES: Record<CoopBossKindId, CoopBossKind> = {
  mountain_chief: {
    id: "mountain_chief",
    name: "산군",
    desc: "산을 틀어쥔 채 군림하는 자. 분노하면 바위도 갈라지는 강타를 휘두른다.",
    scrollCost: 5,
    sharedMaxHp: 30_000,
    anchorDepth: 12,
    base: MOUNTAIN_CHIEF_BASE,
    uniqueIds: ["v2_boss_mountain_axe", "v2_boss_mountain_amulet"],
    titleId: "v2_boss_mountain",
    statusSkill: "mob_rending_claw",
    // 발악 완만화(리워크) — 옛 단일 50% 절벽(atk×1.25)을 3단 점증으로. 누적 최종은 비슷하되
    //   70%부터 미리 예고되며 단계적으로 사나워진다("갑작스러움" 해소). 누적: 20%에서 atk×1.43·def+10.
    enrageStages: [
      {
        hpFraction: 0.7,
        note: "산군이 거칠어지기 시작했다 (공격력 상승)",
        atkMult: 1.1,
      },
      {
        hpFraction: 0.45,
        note: "산군이 분노로 날뛴다! (공격력·방어력 상승)",
        atkMult: 1.13,
        defBonus: 4,
      },
      {
        hpFraction: 0.2,
        note: "산군이 광란에 빠졌다! (공격력·방어력 대폭 상승)",
        atkMult: 1.15,
        defBonus: 6,
      },
    ],
    traits: [
      "분쇄 강타 — 주기적으로 강한 일격",
      "살점 뜯기 — 출혈",
      "발악 — HP 70%·45%·20% 단계로 점점 강해짐(공격력·방어력)",
    ],
  },
  canyon_predator: {
    id: "canyon_predator",
    name: "스콜피온 킹",
    desc: "마른 협곡의 모래 밑을 헤엄치는 거대한 전갈. 절벽조차 집게로 꿰뚫는다.",
    scrollCost: 10,
    sharedMaxHp: 80_000,
    anchorDepth: 24,
    base: CANYON_PREDATOR_BASE,
    uniqueIds: ["v2_boss_canyon_fang", "v2_boss_canyon_boots"],
    titleId: "v2_boss_canyon",
    statusSkill: "mob_venom_bite",
    // 발악 완만화 — 옛 60% 회피 + 25% atk×1.4 두 절벽을 3단 점증으로. 회피가 먼저 서서히 깔리고
    //   공격력은 두 번에 나눠 오른다. 누적: 20%에서 atk×1.44·회피+10(옛 최종과 유사하되 점증).
    enrageStages: [
      {
        hpFraction: 0.7,
        note: "모래바람이 일기 시작한다 (회피 상승)",
        evasionBonus: 5,
      },
      {
        hpFraction: 0.45,
        note: "모래폭풍이 거세진다! (공격력·회피 상승)",
        atkMult: 1.18,
        evasionBonus: 5,
      },
      {
        hpFraction: 0.2,
        note: "스콜피온 킹이 광폭화했다! (공격력 대폭 상승)",
        atkMult: 1.22,
      },
    ],
    traits: [
      "절벽 발톱 — 방어 관통",
      "독니 — 중독",
      "발악 — HP 70%·45%·20% 단계로 점점 강해짐(회피·공격력)",
    ],
  },
  lake_sovereign: {
    id: "lake_sovereign",
    name: "호수의 괴물",
    desc: "얼음 호수 가장 깊은 곳에서 깨어난 거대한 존재. 닿는 것마다 얼어붙는다.",
    scrollCost: 20,
    sharedMaxHp: 200_000,
    anchorDepth: 42,
    base: LAKE_SOVEREIGN_BASE,
    uniqueIds: ["v2_boss_lake_maul", "v2_boss_lake_gloves"],
    titleId: "v2_boss_lake",
    statusSkill: "mob_chilling_touch",
    // 발악 완만화 — 옛 50% def + 20% atk×1.5 절벽을 3단 점증으로. 방어가 먼저 두꺼워지고 공격력은
    //   두 번에 나눠 폭발한다. 누적: 20%에서 atk×1.53·def+18(옛 최종보다 약간 사납되 점증·예고).
    enrageStages: [
      {
        hpFraction: 0.7,
        note: "서리가 갑주에 맺힌다 (방어력 상승)",
        defBonus: 5,
      },
      {
        hpFraction: 0.45,
        note: "서리 갑주가 두꺼워진다! (공격력·방어력 상승)",
        atkMult: 1.18,
        defBonus: 7,
      },
      {
        hpFraction: 0.2,
        note: "심해의 분노가 폭발한다! (공격력 대폭 상승)",
        atkMult: 1.3,
        defBonus: 6,
      },
    ],
    traits: [
      "얼어붙는 손길 — 한기 누적(맞을수록 고정 피해·회피 감소)",
      "한기 — 둔화",
      "발악 — HP 70%·45%·20% 단계로 점점 강해짐(방어력·공격력)",
    ],
  },
};

export const COOP_BOSS_KIND_IDS = Object.keys(
  COOP_BOSSES,
) as CoopBossKindId[];

export function parseCoopBossKindId(v: unknown): CoopBossKindId | null {
  return typeof v === "string" && v in COOP_BOSSES
    ? (v as CoopBossKindId)
    : null;
}

// 시뮬용 전투 Monster — anchorDepth 로 스탯 스케일 후:
//   ① hp = 전역 잔여 HP(currentHp) — 시뮬이 남은 피에서 시작해 막타의 처치가 리플레이에
//      실제로 보이고, damageDealt = 시작 hp − 종료 hp 가 자연 클램프된다.
//   ② 발악 스테이지 — 전역 비율(currentHp/sharedMaxHp)이 임계 이하인 스테이지를 전부
//      미리 적용(공격 단위 stateless 라 "현재 상태"로 굽는다). notes 는 전투 로그 안내용.
//   ③ statusSkill — 평타 부가 상태이상(중독/둔화/출혈)을 v2Skills 로 주입(잡몹과 동일 경로).
export function coopBossForBattle(
  kind: CoopBossKind,
  currentHp: number,
): { monster: Monster; enrageNotes: string[] } {
  // 협동 보스는 sharedMaxHp + anchorDepth 로 난이도를 독립 튜닝 → 솔로 엔드게임 완화(softenEndgame)
  //   는 적용하지 않는다(앵커 24·42 가 완화 임계 위라 보스 atk 가 의도치 않게 약화되는 것 방지).
  const scaled = scaleMonsterForFloor(kind.base, kind.anchorDepth, false);
  const hp = Math.max(1, Math.min(Math.floor(currentHp), kind.sharedMaxHp));
  const frac = hp / kind.sharedMaxHp;
  let atk = scaled.atk;
  let def = scaled.def;
  let evasion = scaled.evasionPct ?? 0;
  const enrageNotes: string[] = [];
  for (const stage of kind.enrageStages) {
    if (frac > stage.hpFraction) continue;
    if (stage.atkMult) atk = Math.round(atk * stage.atkMult);
    if (stage.defBonus) def += stage.defBonus;
    if (stage.evasionBonus) evasion += stage.evasionBonus;
    enrageNotes.push(stage.note);
  }
  const monster: Monster = {
    ...scaled,
    hp,
    atk,
    def,
    ...(evasion > 0 ? { evasionPct: evasion } : {}),
    ...(kind.statusSkill
      ? {
          v2Skills: {
            learned: [kind.statusSkill],
            equipped: [kind.statusSkill],
          },
        }
      : {}),
  };
  return { monster, enrageNotes };
}

// === 발악 단계 라이브 상태 (전투 체감 — UI 배지/예고) ===================
// 현재 공유 HP 비율(0~1)에서 발악 스테이지가 몇 개 발동했고 다음이 어느 임계인지.
//   상세 화면이 "발악 N/총 단계 + 곧 발악(다음 임계·안내)" 배지를 라이브로 그린다.
//   coopBossForBattle 의 적용 규칙(frac ≤ hpFraction 이면 발동)과 동일 기준.
export type CoopEnrageStatus = {
  /** 현재 발동 중인 발악 단계 수. */
  activeCount: number;
  /** 전체 발악 단계 수. */
  totalStages: number;
  /** 다음 발동될 단계(아직 미발동 중 임계가 가장 높은 = 가장 임박). 없으면 null. */
  nextStage: CoopEnrageStage | null;
  /** 단계 트래커용 — hpFraction 내림차순 + 발동 여부. */
  stages: { stage: CoopEnrageStage; active: boolean }[];
};

export function coopEnrageStatus(
  kind: CoopBossKind,
  hpFraction: number,
): CoopEnrageStatus {
  // 내림차순(임계 높은 = 먼저 발동) — 트래커 표시 순서와 일치.
  const sorted = [...kind.enrageStages].sort(
    (a, b) => b.hpFraction - a.hpFraction,
  );
  const stages = sorted.map((stage) => ({
    stage,
    active: hpFraction <= stage.hpFraction,
  }));
  const pending = sorted.filter((st) => hpFraction > st.hpFraction);
  return {
    activeCount: stages.filter((s) => s.active).length,
    totalStages: sorted.length,
    // pending 은 내림차순 → 첫 항목이 가장 높은 임계 = 다음에 발동(가장 임박).
    nextStage: pending.length > 0 ? pending[0] : null,
    stages,
  };
}

// === 옛 테마 보스 호환 export ==========================================
// v2QuestContext(가이드 퀘스트 bossKills)·도감류가 쓰는 합집합 — dungeonBosses.ts 시절
// 시그니처 유지. 칭호 지급은 폐지됐지만(보상 개편) id·카탈로그는 보존(기보유분 호환).

export const BOSS_UNIQUE_IDS: V2EquipmentId[] = [
  ...new Set(Object.values(COOP_BOSSES).flatMap((b) => b.uniqueIds)),
];

export const BOSS_TITLE_IDS: string[] = [
  ...new Set(Object.values(COOP_BOSSES).map((b) => b.titleId)),
];

// 칭호 id → 보스 kind id. 보상 개편으로 칭호 지급은 끊겼지만, 가이드 퀘스트 bossKills 가
//   "격파한 보스 종류 수"라서 레거시 칭호 보유분을 종류로 환산해 호환(v2QuestContext).
//   신규 격파는 adventure-log.v2.coopBossKinds 에 직접 기록 → 둘을 합집합.
export const BOSS_TITLE_TO_KIND: Record<string, CoopBossKindId> = Object.values(
  COOP_BOSSES,
).reduce<Record<string, CoopBossKindId>>((acc, b) => {
  acc[b.titleId] = b.id;
  return acc;
}, {});
