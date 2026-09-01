// v2 협동 보스 — 소환서로 소환하는 공유 HP 월드 보스 (2026-06-13).
//
// 루프(exten 원형 — sea9401/exten coop 시스템의 v2 이식):
//   사냥 승리 → 소환서(재료) 드랍 → N장 소모해 보스 소환 → 모든 유저가 공유 HP 를
//   누적 데미지로 깎음(1회 공격 = 일반 PvE와 같은 3,000 ATB 틱, 보스가 반격) → 처치 시
//   기여도 비율 5티어 보상(골드 + 보스 전용 유니크 확률 + 첫 처치 칭호).
//
// 옛 솔로 "보스 도전"(#622 파일럿, dungeonBosses.ts)은 이 시스템으로 대체 — 기존 보스들의
// 이름/아트/스킬/유니크/칭호 자산은 그대로 협동 보스로 승계(보유 유저 호환).
// DB 는 v1 협동 인프라(coop_boss_sessions/contributors/attack_log) 재사용 — regionId
// 컬럼에 CoopBossKindId 를 넣는다(v1 COOP_BOSSES 는 빈 맵이라 cron/respawn 과 충돌 없음).

import type { Monster } from "@/adventure/data/monsters/types";
import type { BattleLogEntry } from "@/adventure/v2/combat/engineState";
import { TRACKING_THREAT_MAX } from "@/adventure/v2/combat/trackingWeaponMechanic";
import {
  invincibleFortressBarrierTarget,
  invincibleFortressTierForDamage,
  normalizeInvincibleFortressState,
  type InvincibleFortressBattleState,
  type InvincibleFortressEnrageTier,
} from "@/adventure/v2/combat/invincibleFortressMechanic";
import {
  initialSkywardCrystalEyeState,
  normalizeSkywardCrystalEyeState,
  skywardCrystalEyeArtilleryPowerPct,
  skywardCrystalEyeBasePowerPct,
  type SkywardCrystalEyeArtilleryPowerPct,
  type SkywardCrystalEyeBattleState,
} from "@/adventure/v2/combat/skywardCrystalEyeMechanic";
import { scaleMonsterForFloor } from "./monsterScale";
import { V2_CORE_LOOP_V2 } from "./coreLoopConfig";
import type { V2EquipmentId } from "./v2Equipment";
import type { V2MonsterStatusSkillId } from "./v2Skills";
import {
  UNEXPLORED_BOSSES,
  type UnexploredBossId,
} from "./unexploredBosses";

// === 소환서 (재료) =====================================================
// 강화석 패턴 — V2_MATERIALS 카탈로그 등재(인벤 재료 탭·거래소 거래), NPC 환금 비등재,
// 드랍은 hunt 라우트의 독립 롤(V2_MATERIALS_ENABLED 무관).

export const SUMMON_SCROLL_MATERIAL_ID = "v2_boss_summon_scroll";

// 사냥 승리당 소환서 드랍 확률(%). ⚠️ 라이브 캘리브 다이얼 — 헤비 유저 기준 일 수~십수 장
// 페이스를 의도(스태미나 일 회복 ~2880 × 0.5% ≈ 14장). 레어맵 배수 미적용(별도 축).
export const SUMMON_SCROLL_DROP_PCT = 0.5;

// 사냥 승리 시 소환서 드랍 굴림(순수). rng() ∈ [0,1). 통과 시 1장.
export function rollSummonScrollDrop(
  rng: () => number,
  chanceMult: number = 1,
): number {
  const mult = Math.max(0, Number(chanceMult) || 0);
  const chance = Math.min(100, SUMMON_SCROLL_DROP_PCT * mult);
  return chance > 0 && rng() * 100 < chance ? 1 : 0;
}

// 낚시 성공 시 초저확률로 자동 소환되는 이벤트 보스.
// 성공 챔질 기준 0.02%: 2,000회 성공당 출현 확률 약 33%.
export const FISHING_COOP_BOSS_KIND_ID = "abyssal_tyrant";
export const FISHING_COOP_BOSS_SPAWN_CHANCE = 0.0002;

export function rollFishingCoopBossSpawn(rng: () => number): boolean {
  return rng() < FISHING_COOP_BOSS_SPAWN_CHANCE;
}

function isCriticalHitLog(text: string): boolean {
  // 저장된 과거 리플레이는 이전 표기를 유지하므로 판독 호환성을 보존한다.
  return (
    text.includes("[치명타]") ||
    text.includes("[크리티컬]") ||
    text.includes("[크리]")
  );
}

export function coopCriticalDamageFromLog(log: readonly BattleLogEntry[]): number {
  return log.reduce((sum, entry) => {
    if (entry.kind !== "player_attack") return sum;
    if (!isCriticalHitLog(entry.text)) return sum;
    const match = entry.text.match(/(\d+)\s*피해/);
    const damage = match ? Number(match[1]) : 0;
    return sum + (Number.isFinite(damage) ? Math.max(0, Math.floor(damage)) : 0);
  }, 0);
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
  epic: 0.3,
  // 선공자가 기여도를 쌓은 뒤 공개한 보스도 다른 이용자가 마무리할 동기를 얻도록 완화한다.
  legend: 0.35,
};

export const COOP_HARD_TIER_THRESHOLDS: Record<CoopRewardTier, number> = {
  bronze: 0.05,
  silver: 0.1,
  gold: 0.18,
  epic: 0.3,
  legend: 0.35,
};

export const COOP_TIER_LABEL: Record<CoopRewardTier, string> = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  epic: "EPIC",
  legend: "LEGEND",
};

export type CoopBossDifficulty = "normal" | "hard";

export function coopBossDifficultyOf(
  kind: CoopBossKindId | { difficulty?: CoopBossDifficulty } | null | undefined,
): CoopBossDifficulty {
  if (kind && typeof kind === "object" && kind.difficulty) {
    return kind.difficulty;
  }
  return kind === "mountain_chief_hard" || kind === "abyssal_tyrant"
    || kind === "canyon_predator_hard" || kind === "lake_sovereign_hard"
    ? "hard"
    : "normal";
}

export function coopTierThresholdsFor(
  kind?: CoopBossKindId | { difficulty?: CoopBossDifficulty } | null,
): Record<CoopRewardTier, number> {
  return coopBossDifficultyOf(kind) === "hard"
    ? COOP_HARD_TIER_THRESHOLDS
    : COOP_TIER_THRESHOLDS;
}

export function coopTierThresholdFor(
  tier: CoopRewardTier,
  kind?: CoopBossKindId | { difficulty?: CoopBossDifficulty } | null,
): number {
  return coopTierThresholdsFor(kind)[tier];
}

/** 누적 데미지 비율(0~1) → 도달한 최고 티어. bronze 미달이면 null. */
export function coopTierForRatio(
  ratio: number,
  kind?: CoopBossKindId | { difficulty?: CoopBossDifficulty } | null,
): CoopRewardTier | null {
  const thresholds = coopTierThresholdsFor(kind);
  let achieved: CoopRewardTier | null = null;
  for (const tier of COOP_TIER_ORDER) {
    if (ratio >= thresholds[tier]) achieved = tier;
    else break;
  }
  return achieved;
}

// === 보상 = SP 열매 (단일 보상·티어별 확률 굴림) ========================
// 협동 보스 보상 개편(2026-06-26·오너): 골드·유니크·칭호 보상 폐지. 보상은 **SP 열매**뿐.
//   도달한 각 보상 티어를 **독립 굴림**한다 — 통과 시 그 보스 등급 열매 1개. BRONZE/SILVER 는
//   0(GOLD 부터). LEGEND 도달 = GOLD+EPIC+LEGEND 세 번 굴림 = 최대 3개. 전 보스 공통 확률.
//   ⚠️ 캘리브 다이얼. 열매 등급은 보스 고유(산악→I·협곡→II·호수→III·공허→IV, spFruit.fruitTierForBoss).
export const COOP_SP_FRUIT_CHANCE: Record<CoopRewardTier, number> = {
  bronze: 0,
  silver: 0,
  gold: 0.05, // 라이브 하향(2026-07-30) — 10%→5%
  epic: 0.075, // 15%→7.5%
  legend: 0.1, // 20%→10%
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

// 1회 공격의 플레이어 행동 안전 상한. 라이브 ATB에서는 공통 3,000틱 제한이 먼저 적용되므로
// 공격력뿐 아니라 생존력·지속력도 끝까지 기여한다. 레거시 폴백에서도 무한 전투를 막는다.
export const COOP_ATTACK_TURNS = 3_000;

// 공격 스태미너 비용 — 짧은 10초 쿨다운 대신 공격마다 스태미나를 소모한다.
export const COOP_ATTACK_STAMINA_COST = 20;

// 재공격 쿨다운(ms) — 유저별(lastAttackAt). 매크로/원맨 클리어 견제. ⚠️ 캘리브 다이얼.
export const COOP_ATTACK_COOLDOWN_MS = 10 * 1000;
export const COOP_ATTACK_COOLDOWN_MS_V2 = 10 * 1000;
// 코어루프 on/off 모두 10초. 분기 함수는 기존 호출부 호환을 위해 유지한다.
export function coopAttackCooldownMs(): number {
  return V2_CORE_LOOP_V2 ? COOP_ATTACK_COOLDOWN_MS_V2 : COOP_ATTACK_COOLDOWN_MS;
}

// 협동 보스 공유 MP — 전투 1회가 아니라 세션 전체가 같이 깎는 자원.
// base.v2MaxMp 는 솔로 전투 기준 시전 2~4회분이라, 공유 풀은 넉넉히 키워 여러 명이
// "먼저 탈진시키는" 선택지를 갖게 한다.
export const COOP_BOSS_MP_POOL_MULTIPLIER = 8;
export const COOP_BOSS_MP_DAMAGE_RATIO = 1.2;
export const COOP_BOSS_MP_ATTACK_DRAIN = 2;
export const COOP_BOSS_MP_CRIT_DRAIN = 2;

// === 가시성/공격 권한 ======================================================
// 모든 보스는 소환자 전용으로 시작하며, 소환 후 길드 또는 전체에 공개한다.
export type CoopVisibility = "public" | "guild_only" | "summoner_only";
export const COOP_INITIAL_VISIBILITY: CoopVisibility = "summoner_only";
export const COOP_VISIBILITY_VALUES: readonly CoopVisibility[] = [
  "public",
  "guild_only",
  "summoner_only",
];
export function parseCoopVisibility(v: unknown): CoopVisibility {
  return v === "guild_only" || v === "summoner_only" ? v : "public";
}

export function coopVisibilityTransition(
  current: unknown,
  requested: CoopVisibility,
):
  | { ok: true; changed: boolean }
  | { ok: false; error: "visibility_locked" } {
  const stored = parseCoopVisibility(current);
  if (stored === "public" && requested !== "public") {
    return { ok: false, error: "visibility_locked" };
  }
  return { ok: true, changed: stored !== requested };
}

// 가시성 표시 라벨 + 소환 후 변경 UI 선택지.
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
    regionId?: string | null;
    visibility?: string | null;
    summonerId?: string | null;
    summonerGuildId?: number | null;
  },
  viewer: { userId: string; guildId: number | null },
): boolean {
  const kindId = parseCoopBossKindId(session.regionId);
  if (kindId && COOP_BOSSES[kindId].visibilityLocked) {
    return session.summonerId === viewer.userId;
  }
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
export const MAX_ACTIVE_PER_KIND = 20;

// === 보스 정의 =========================================================

export type CoopBossKindId =
  | "mountain_chief"
  | "mountain_chief_hard"
  | "abyssal_tyrant"
  | "canyon_predator"
  | "canyon_predator_hard"
  | "lake_sovereign"
  | "lake_sovereign_hard"
  | "void_priest"
  | UnexploredBossId;

/** 기존 협동 기여 티어·협동 주화 보상을 사용하는 공개 보스 ID. */
export type StandardCoopBossKindId = Exclude<CoopBossKindId, UnexploredBossId>;

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
  /** 행동 속도 곱. */
  spdMult?: number;
  /** 관통 스킬의 방어 관통 가산. */
  armorPierceBonus?: number;
  /** 이 페이즈에서 사용할 몬스터 상태 스킬. */
  statusSkill?: V2MonsterStatusSkillId;
  /** 한기 스택의 적중당 누적량 가산. */
  chillAmountBonus?: number;
  /** 한기 스택당 고정 피해 가산. */
  chillFixedDamageBonus?: number;
};

export type CoopConditionalEnrage = {
  hpFraction: number;
  normal: CoopEnrageStage;
  weakened: CoopEnrageStage;
};

export type CoopBossKind = {
  id: CoopBossKindId;
  /** 보상 해석 경로. 개인 보스는 협동 기여 티어 보상을 사용하지 않는다. */
  rewardMode: "coop" | "unexplored_personal";
  /** true면 세션의 summoner_only 공개 범위를 끝까지 바꿀 수 없다. */
  visibilityLocked: boolean;
  /** 일반 소환서 대신 소비할 보스별 거래 가능 소환석. */
  summonMaterialId?: string;
  difficulty?: CoopBossDifficulty;
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
  /** 조건부 발악 — 상태 저장이 필요한 하드 보스용. */
  conditionalEnrage?: CoopConditionalEnrage;
  /** 보스 특성 표시 문구(상세/소환 정보 카드) — 스킬·상태이상·발악 요약. */
  traits: string[];
};

export type CoopMechanicState = {
  bossMp?: number;
  trackingThreat?: number;
  fortress?: InvincibleFortressBattleState;
  crystalEye?: SkywardCrystalEyeBattleState;
};

export function parseCoopMechanicState(value: unknown): CoopMechanicState {
  if (!value || typeof value !== "object") return {};
  const src = value as {
    bossMp?: unknown;
    trackingThreat?: unknown;
    fortress?: unknown;
    crystalEye?: unknown;
  };
  const next: CoopMechanicState = {};
  if (typeof src.bossMp === "number" && Number.isFinite(src.bossMp)) {
    next.bossMp = Math.max(0, Math.floor(src.bossMp));
  }
  if (
    typeof src.trackingThreat === "number" &&
    Number.isFinite(src.trackingThreat)
  ) {
    next.trackingThreat = Math.max(
      0,
      Math.min(TRACKING_THREAT_MAX, Math.floor(src.trackingThreat)),
    );
  }
  if (src.fortress != null) {
    const maxHp = UNEXPLORED_BOSSES.invincible_fortress.sharedMaxHp;
    next.fortress = normalizeInvincibleFortressState(
      src.fortress,
      maxHp,
      maxHp,
    );
  }
  if (src.crystalEye != null) {
    next.crystalEye = normalizeSkywardCrystalEyeState(src.crystalEye);
  }
  return next;
}

export function coopInvincibleFortressState(
  kind: CoopBossKind,
  stateRaw: unknown,
  currentHp: number,
): InvincibleFortressBattleState {
  const rawFortress =
    stateRaw && typeof stateRaw === "object" && !Array.isArray(stateRaw)
      ? (stateRaw as { fortress?: unknown }).fortress
      : undefined;
  return normalizeInvincibleFortressState(
    rawFortress,
    kind.sharedMaxHp,
    currentHp,
  );
}

export function withCoopInvincibleFortressState(
  kind: CoopBossKind,
  stateRaw: unknown,
  fortress: InvincibleFortressBattleState,
  currentHp: number,
): CoopMechanicState {
  return {
    ...parseCoopMechanicState(stateRaw),
    fortress: normalizeInvincibleFortressState(
      fortress,
      kind.sharedMaxHp,
      currentHp,
    ),
  };
}

export type CoopInvincibleFortressDisplay = {
  fortressBarrierActive: boolean;
  fortressBarrierTicksRemaining: number;
  fortressBarrierDamage: number;
  fortressBarrierTarget: number;
  fortressEnrageTier: InvincibleFortressEnrageTier;
  fortressProjectedEnrageTier: InvincibleFortressEnrageTier;
  fortressCompletedBarrierCount: number;
  fortressNextBarrierHpFraction: 0.75 | 0.5 | 0.25 | null;
  fortressLastResultTier: InvincibleFortressEnrageTier | null;
};

const FORTRESS_FUTURE_BARRIER_FRACTIONS = [0.75, 0.5, 0.25] as const;

export function coopInvincibleFortressDisplay(
  kind: CoopBossKind,
  stateRaw: unknown,
  currentHp: number,
): CoopInvincibleFortressDisplay {
  if (kind.id !== "invincible_fortress") {
    return {
      fortressBarrierActive: false,
      fortressBarrierTicksRemaining: 0,
      fortressBarrierDamage: 0,
      fortressBarrierTarget: 0,
      fortressEnrageTier: 0,
      fortressProjectedEnrageTier: 0,
      fortressCompletedBarrierCount: 0,
      fortressNextBarrierHpFraction: null,
      fortressLastResultTier: null,
    };
  }
  const state = coopInvincibleFortressState(kind, stateRaw, currentHp);
  const active = state.activeBarrierIndex !== null;
  const lastResultTier = state.barrierResults.at(-1) ?? null;
  const nextFractionIndex = state.completedBarrierCount - 1 + (active ? 1 : 0);
  return {
    fortressBarrierActive: active,
    fortressBarrierTicksRemaining: active ? state.barrierTicksRemaining : 0,
    fortressBarrierDamage: active ? state.barrierDamage : 0,
    fortressBarrierTarget: invincibleFortressBarrierTarget(kind.sharedMaxHp),
    fortressEnrageTier: active
      ? (lastResultTier ?? 0)
      : state.enrageTier,
    fortressProjectedEnrageTier: active
      ? invincibleFortressTierForDamage(state.barrierDamage, kind.sharedMaxHp)
      : state.enrageTier,
    fortressCompletedBarrierCount: state.completedBarrierCount,
    fortressNextBarrierHpFraction:
      FORTRESS_FUTURE_BARRIER_FRACTIONS[nextFractionIndex] ?? null,
    fortressLastResultTier: lastResultTier,
  };
}

export function coopSkywardCrystalEyeState(
  kind: CoopBossKind,
  stateRaw: unknown,
): SkywardCrystalEyeBattleState {
  if (kind.id !== "skyward_crystal_eye") {
    return initialSkywardCrystalEyeState();
  }
  const rawCrystalEye =
    stateRaw && typeof stateRaw === "object" && !Array.isArray(stateRaw)
      ? (stateRaw as { crystalEye?: unknown }).crystalEye
      : undefined;
  return normalizeSkywardCrystalEyeState(rawCrystalEye);
}

export function withCoopSkywardCrystalEyeState(
  kind: CoopBossKind,
  stateRaw: unknown,
  crystalEye: SkywardCrystalEyeBattleState,
): CoopMechanicState {
  return {
    ...parseCoopMechanicState(stateRaw),
    crystalEye:
      kind.id === "skyward_crystal_eye"
        ? normalizeSkywardCrystalEyeState(crystalEye)
        : initialSkywardCrystalEyeState(),
  };
}

export type CoopSkywardCrystalEyeDisplay = {
  crystalEyeAimTicksRemaining: number;
  crystalEyeDisruptionStacks: number;
  crystalEyeProjectedPowerPct: SkywardCrystalEyeArtilleryPowerPct;
  crystalEyeBasePowerPct: 180 | 210 | 240 | 270;
  crystalEyeCoreExposed: boolean;
  crystalEyeCoreExposureTicksRemaining: number;
  crystalEyeArtilleryCount: number;
  crystalEyeLastArtilleryStacks: number | null;
  crystalEyeLastArtilleryPowerPct: SkywardCrystalEyeArtilleryPowerPct | null;
  crystalEyeLastArtilleryDamage: number | null;
};

export function coopSkywardCrystalEyeDisplay(
  kind: CoopBossKind,
  stateRaw: unknown,
  currentHp: number,
): CoopSkywardCrystalEyeDisplay {
  const state = coopSkywardCrystalEyeState(kind, stateRaw);
  return {
    crystalEyeAimTicksRemaining: state.aimTicksRemaining,
    crystalEyeDisruptionStacks: state.disruptionStacks,
    crystalEyeProjectedPowerPct: skywardCrystalEyeArtilleryPowerPct(
      state.disruptionStacks,
    ),
    crystalEyeBasePowerPct: skywardCrystalEyeBasePowerPct(
      currentHp,
      kind.sharedMaxHp,
    ),
    crystalEyeCoreExposed: state.coreExposureTicksRemaining > 0,
    crystalEyeCoreExposureTicksRemaining: state.coreExposureTicksRemaining,
    crystalEyeArtilleryCount: state.artilleryCount,
    crystalEyeLastArtilleryStacks: state.lastArtilleryStacks,
    crystalEyeLastArtilleryPowerPct: state.lastArtilleryPowerPct,
    crystalEyeLastArtilleryDamage: state.lastArtilleryDamage,
  };
}

export function coopBossTrackingThreatMax(kind: CoopBossKind): number {
  return kind.id === "tracking_weapon" ? TRACKING_THREAT_MAX : 0;
}

export function coopBossTrackingThreat(
  kind: CoopBossKind,
  stateRaw: unknown,
): number {
  const max = coopBossTrackingThreatMax(kind);
  if (max <= 0) return 0;
  const parsed = parseCoopMechanicState(stateRaw);
  return Math.max(0, Math.min(max, parsed.trackingThreat ?? 0));
}

export function withCoopBossTrackingThreat(
  kind: CoopBossKind,
  stateRaw: unknown,
  threat: number,
): CoopMechanicState {
  const parsed = parseCoopMechanicState(stateRaw);
  const max = coopBossTrackingThreatMax(kind);
  if (max <= 0) return parsed;
  const normalized = Number.isFinite(threat) ? Math.floor(threat) : 0;
  return {
    ...parsed,
    trackingThreat: Math.max(0, Math.min(max, normalized)),
  };
}

export function coopBossMaxMp(kind: CoopBossKind): number {
  return Math.max(
    0,
    Math.floor((kind.base.v2MaxMp ?? 0) * COOP_BOSS_MP_POOL_MULTIPLIER),
  );
}

export function coopBossCurrentMp(
  kind: CoopBossKind,
  stateRaw: unknown,
): number {
  const maxMp = coopBossMaxMp(kind);
  const parsed = parseCoopMechanicState(stateRaw);
  return Math.max(0, Math.min(maxMp, parsed.bossMp ?? maxMp));
}

export function withCoopBossMp(
  kind: CoopBossKind,
  stateRaw: unknown,
  bossMp: number,
): CoopMechanicState {
  const maxMp = coopBossMaxMp(kind);
  return {
    ...parseCoopMechanicState(stateRaw),
    bossMp: Math.max(0, Math.min(maxMp, Math.floor(bossMp))),
  };
}

export function coopBossMpPressureDamage(
  log: readonly BattleLogEntry[],
  args: {
    damageDealt: number;
    bossMaxHp: number;
    bossMaxMp: number;
  },
): number {
  const bossMaxHp = Math.max(1, args.bossMaxHp);
  const bossMaxMp = Math.max(0, args.bossMaxMp);
  if (bossMaxMp <= 0) return 0;
  let hits = 0;
  let crits = 0;
  for (const entry of log) {
    if (entry.kind !== "player_attack") continue;
    const match = entry.text.match(/(\d+)\s*피해/);
    const damage = match ? Number(match[1]) : 0;
    if (!Number.isFinite(damage) || damage <= 0) continue;
    hits += 1;
    if (isCriticalHitLog(entry.text)) crits += 1;
  }
  const damageRatioDrain = Math.floor(
    (Math.max(0, args.damageDealt) / bossMaxHp) *
      bossMaxMp *
      COOP_BOSS_MP_DAMAGE_RATIO,
  );
  return Math.max(
    0,
    Math.min(
      bossMaxMp,
      damageRatioDrain +
        hits * COOP_BOSS_MP_ATTACK_DRAIN +
        crits * COOP_BOSS_MP_CRIT_DRAIN,
    ),
  );
}
// 보스 베이스 — 옛 dungeonBosses.ts(#622 파일럿) 승계 + 협동 레이드 킷(#715).
// phaseTrigger(시뮬 내부 HP 비율 트리거)는 폐기 — 시뮬이 전역 잔여 HP 에서 시작하므로
// 발악은 CoopBossKind.enrageStages(전역 비율)로 coopBossForBattle 이 미리 구워 넣는다.
// 2026-08-10 후속 조정 — 6종의 기본 ATK를 약 10%, 물리 DEF를 약 3% 상향.
// 공유 HP·마법 DEF·기믹 피해·발악 수치는 유지한다.

const MOUNTAIN_CHIEF_BASE: Monster = {
  name: "산군",
  tags: ["humanoid"],
  image: "/images/monster/v2/sangoon.webp",
  hp: 620,
  // 새 DEF 점감식 재보정값에 후속 공격·방어 상향을 반영.
  atk: 30.8,
  def: 18.54,
  magicDef: 20,
  // spd ↑(2026-06-26) — 협동 보스는 effectiveMonsterSpd(10+raw×6)로 매핑돼 필드 1~9 밴드에선
  //   엔드 플레이어(spd 200~300) 대비 반격이 너무 굼떴다. 레이드 보스라 밴드 밖으로 올림(유효 ~95).
  spd: 15,
  accuracy: 3,
  evasionPct: 5,
  exp: 90,
  skill: {
    kind: "heavy_blow",
    name: "분쇄 강타",
    everyPhases: 3,
    multiplier: 2.2,
  },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.3,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_mountain",
  // v2 시그니처 액티브(MP 게이트) — 포효로 자기 공격력을 끌어올린다. 정해진 MP·전투 내 재생 없음
  //   → MP 소진(≈3회) 후엔 평타·기존 강타만. (scaleMonsterForFloor 가 ...monster 로 보존.)
  v2Skills: { learned: ["mob_savage_roar"], equipped: ["mob_savage_roar"] },
  v2MaxMp: 75,
};

const MOUNTAIN_CHIEF_HARD_BASE: Monster = {
  ...MOUNTAIN_CHIEF_BASE,
  name: "흉포한 산군",
  hp: 860,
  // 깊이 68의 soften 없는 공격 배율(×109.84)을 직접 상쇄한 재보정값에 후속 상향을 반영.
  atk: 5.962,
  def: 28.84,
  magicDef: 36,
  spd: 16,
  // floorAccuracy(+164.76) 적용 뒤 실전 명중 104.76. LUK 회피 투자를 대응축으로 남긴다.
  accuracy: -60,
  evasionPct: 12,
  armorVulnerable: 0.35,
  playerDefVulnerable: 0.35,
  dropQualityBias: 4,
  v2MaxMp: 95,
};

const ABYSSAL_TYRANT_BASE: Monster = {
  name: "심연어룡",
  tags: ["beast"],
  image: "/images/monster/deepseamonster.webp",
  element: "water",
  hp: 840,
  // 깊이 60의 급격한 배율(×82.86)을 상쇄한 재보정값에 후속 상향을 반영.
  // 공격 유형과 정확도는 마방·정신 계보가 대응축이 되도록 유지한다.
  atk: 12.826,
  atkType: "magic",
  def: 16.5,
  magicDef: 32,
  spd: 17,
  accuracy: 10,
  evasionPct: 8,
  exp: 120,
  skill: {
    kind: "pierce",
    name: "심해 돌진",
    armorPierce: 16,
  },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.3,
  dropQualityBias: 4,
  onDefeatTitleId: "v2_boss_lake",
  v2Skills: { learned: ["mob_arcane_nova"], equipped: ["mob_arcane_nova"] },
  v2MaxMp: 120,
};

const CANYON_PREDATOR_BASE: Monster = {
  name: "스콜피온 킹",
  tags: ["beast"],
  image: "/images/monster/v2/scorpionking.webp",
  element: "earth",
  hp: 600,
  // 회피 반응 경감 기준 재보정값에 후속 상향을 반영.
  atk: 29.7,
  def: 13.45,
  spd: 15, // ↑ 레이드 보스 속도(유효 ~101) — MOUNTAIN_CHIEF_BASE 주석 참고.
  exp: 95,
  skill: { kind: "pierce", name: "절벽 발톱", armorPierce: 10 },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.3,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_canyon",
  // v2 시그니처 액티브(MP 게이트) — 강한 물리 단일타. MP 소진(≈3회) 후엔 평타·절벽 발톱만.
  v2Skills: { learned: ["mob_crushing_blow"], equipped: ["mob_crushing_blow"] },
  v2MaxMp: 90,
};

const CANYON_PREDATOR_HARD_BASE: Monster = {
  ...CANYON_PREDATOR_BASE,
  name: "재앙의 스콜피온 킹",
  hp: 900,
  // 기존 HARD보다 지나치게 안전했던 초기 압박을 6T 상위 난도에 맞게 보정.
  atk: 5,
  def: 34,
  magicDef: 32,
  spd: 22,
  accuracy: -125,
  evasionPct: 18,
  skill: { kind: "pierce", name: "왕독의 집게", armorPierce: 10 },
  dropQualityBias: 4,
  v2MaxMp: 120,
};

const LAKE_SOVEREIGN_BASE: Monster = {
  name: "호수의 괴물",
  tags: ["golem"],
  image: "/images/monster/v2/nessi.webp",
  element: "water",
  hp: 680,
  atk: 4.4,
  def: 16.48,
  spd: 12, // ↑ 레이드 보스 속도(유효 ~83·느린 골렘이라 셋 중 최저) — MOUNTAIN_CHIEF_BASE 주석 참고.
  exp: 100,
  // 한기 스택 기믹(옛 월드 보스 「별을 잊은 것」 계열) — 맞을수록 한기가 쌓여 고정
  // 피해 + 회피 감소. "오래 버티는 싸움일수록 아프다" 시간압 — 장기전과 맞물림.
  // ⚠️ 수치 캘리브 다이얼.
  skill: {
    kind: "chill",
    name: "얼어붙는 손길",
    perHit: 2,
    threshold: 2,
    // ATK 최저 보정만으로도 누적 고정 피해가 커지므로 구조는 유지하고 피해만 완화.
    dmgPerStack: 17,
    maxStacks: 10,
    defMitigationFraction: 0.25,
    evasionPenaltyPerStack: 1.5,
  },
  armorVulnerable: 0.3,
  playerDefVulnerable: 0.3,
  dropQualityBias: 3,
  onDefeatTitleId: "v2_boss_lake",
  // v2 시그니처 액티브(MP 게이트) — 비전 폭발(마법 단일타). MP 소진(≈3회) 후엔 평타·한기만.
  v2Skills: { learned: ["mob_arcane_nova"], equipped: ["mob_arcane_nova"] },
  v2MaxMp: 105,
};

const LAKE_SOVEREIGN_HARD_BASE: Monster = {
  ...LAKE_SOVEREIGN_BASE,
  name: "혹한의 호수 괴물",
  hp: 950,
  // 높은 마법 방어·한기 압박에 더해 초기 마법 공격도 6T 상위 난도로 보정.
  atk: 5,
  atkType: "magic",
  def: 36,
  magicDef: 46,
  spd: 20,
  accuracy: -125,
  evasionPct: 12,
  skill: {
    kind: "chill",
    name: "얼어붙는 손길",
    perHit: 2,
    threshold: 2,
    dmgPerStack: 22,
    maxStacks: 10,
    defMitigationFraction: 0.25,
    evasionPenaltyPerStack: 1.5,
  },
  dropQualityBias: 4,
  v2MaxMp: 130,
};

const VOID_PRIEST_BASE: Monster = {
  name: "공허의 대사제",
  tags: ["undead", "spirit"],
  image: "/images/monster/v2/throne-abyss-executor.webp",
  element: "void",
  atkType: "magic",
  hp: 760,
  // 새 회피 반응 경감 기준 재보정값에 후속 상향을 반영.
  atk: 6.05,
  def: 18.55,
  spd: 14,
  critPct: 18,
  critMult: 1.6,
  exp: 120,
  // 저주 레이드 기믹 — 맞으면 저주가 쌓이고, 임계 도달 시 폭발한 뒤 남은 스택이 받는 피해를 키운다.
  // magicDef/critResist/상태방어 장비가 대응축. 35% 이하부터 perHit 2배로 막판 압박을 만든다.
  skill: {
    kind: "curse",
    name: "공허의 저주",
    perHit: 1,
    threshold: 4,
    dmgPerStack: 45,
    maxStacks: 12,
    magicDefMitigationFraction: 0.35,
    damageTakenPctPerStack: 4,
    maxDamageTakenPct: 32,
    deepHpFraction: 0.35,
  },
  armorVulnerable: 0.18,
  playerDefVulnerable: 0.2,
  dropQualityBias: 4,
  onDefeatTitleId: "v2_boss_void_priest",
  bonusAttackChancePct: 50,
  v2Skills: { learned: ["mob_arcane_nova"], equipped: ["mob_arcane_nova"] },
  v2MaxMp: 140,
};

// === 소환 유지시간 — 공유 HP 비례 ====================================
// HP 가 클수록 다 같이 깎을 시간이 필요 — HP COOP_DURATION_HP_PER_HOUR 당 1시간,
// 최소 2시간 ~ 최대 24시간(사용자 결정 2026-06-13). ⚠️ 캘리브 다이얼.
// 현재 사다리: 30k→6h · 80k→16h · 270k 이상→24h(캡).
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

function unexploredPersonalBossKind(id: UnexploredBossId): CoopBossKind {
  const boss = UNEXPLORED_BOSSES[id];
  return {
    id,
    rewardMode: "unexplored_personal",
    visibilityLocked: true,
    summonMaterialId: boss.summonMaterialId,
    name: boss.name,
    desc: `${boss.pools.join(" · ")}의 흔적이 결속되어 나타난 개인 우두머리.`,
    // 일반 소환서 경로에서는 제외되며 실제 소비량은 보스별 소환석 1개다.
    scrollCost: 0,
    sharedMaxHp: boss.sharedMaxHp,
    anchorDepth: boss.anchorDepth,
    base: boss.monster,
    uniqueIds: boss.uniqueDrops.map((drop) => drop.equipmentId),
    titleId: boss.titleId,
    enrageStages: [],
    traits: [...boss.traits],
  };
}

// 4단 사다리 — 소환서 10/15/20/30장, 시뮬 스탯은 깊이 12/24/42/60 스케일(상위 보스일수록
// 반격이 아파 약빌드는 비싼 보스에 함부로 못 붙는다). 공유 HP·보상은 ⚠️ 라이브 캘리브.
// 보상 = SP 열매뿐(COOP_SP_FRUIT_CHANCE·티어별 확률 굴림). 골드·유니크·칭호 보상 폐지(2026-06-26).
export const COOP_BOSSES: Record<CoopBossKindId, CoopBossKind> = {
  mountain_chief: {
    id: "mountain_chief",
    rewardMode: "coop",
    visibilityLocked: false,
    name: "산군",
    desc: "산을 틀어쥔 채 군림하는 자. 분노하면 바위도 갈라지는 강타를 휘두른다.",
    scrollCost: 10,
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
    rewardMode: "coop",
    visibilityLocked: false,
    name: "스콜피온 킹",
    desc: "마른 협곡의 모래 밑을 헤엄치는 거대한 전갈. 절벽조차 집게로 꿰뚫는다.",
    scrollCost: 15,
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
  canyon_predator_hard: {
    id: "canyon_predator_hard",
    rewardMode: "coop",
    visibilityLocked: false,
    difficulty: "hard",
    name: "재앙의 스콜피온 킹",
    desc: "왕독과 모래폭풍을 두른 스콜피온 킹. 깊어질수록 더 빠르고 날카롭게 갑각을 꿰뚫는다.",
    scrollCost: 30,
    // 2026-08-20 운영 상위 중앙 피해 약 60만 기준 14회 공격 목표.
    sharedMaxHp: 8_400_000,
    anchorDepth: 78,
    base: CANYON_PREDATOR_HARD_BASE,
    uniqueIds: [],
    titleId: "v2_boss_canyon",
    statusSkill: "mob_venom_bite",
    enrageStages: [
      {
        hpFraction: 0.7,
        note: "재앙의 모래폭풍이 일어난다! (속도·회피·중독 압박 상승)",
        spdMult: 1.12,
        evasionBonus: 6,
        statusSkill: "mob_catastrophe_venom",
      },
      {
        hpFraction: 0.4,
        note: "맹독 갑각이 붕괴하며 집게가 날카로워진다! (공격력·관통 상승)",
        atkMult: 1.25,
        armorPierceBonus: 14,
        statusSkill: "mob_venom_sunder",
      },
    ],
    traits: [
      "왕독의 집게 — 방어 관통과 제한된 MP의 강한 물리 액티브",
      "재앙의 모래폭풍 — HP 70%부터 속도·회피·중독 압박 상승",
      "맹독갑각 붕괴 — HP 40%부터 공격력·관통·방어 약화 강화",
    ],
  },
  lake_sovereign: {
    id: "lake_sovereign",
    rewardMode: "coop",
    visibilityLocked: false,
    name: "호수의 괴물",
    desc: "얼음 호수 가장 깊은 곳에서 깨어난 거대한 존재. 닿는 것마다 얼어붙는다.",
    scrollCost: 20,
    sharedMaxHp: 270_000,
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
  lake_sovereign_hard: {
    id: "lake_sovereign_hard",
    rewardMode: "coop",
    visibilityLocked: false,
    difficulty: "hard",
    name: "혹한의 호수 괴물",
    desc: "호수 밑바닥의 혹한을 깨운 괴물. 얼음 갑주가 두꺼워질수록 한기와 마력이 거세진다.",
    scrollCost: 30,
    // 2026-08-20 운영 상위 중앙 피해 약 60만 기준 14회 공격 목표.
    sharedMaxHp: 8_400_000,
    anchorDepth: 78,
    base: LAKE_SOVEREIGN_HARD_BASE,
    uniqueIds: [],
    titleId: "v2_boss_lake",
    statusSkill: "mob_chilling_touch",
    enrageStages: [
      {
        hpFraction: 0.7,
        note: "빙결 갑주가 호수를 뒤덮는다! (방어력·한기 압박 상승)",
        defBonus: 30,
        statusSkill: "mob_deep_chill",
        chillAmountBonus: 1,
      },
      {
        hpFraction: 0.4,
        note: "혹한의 심장이 폭주한다! (마법 공격·한기 피해 상승)",
        atkMult: 1.25,
        defBonus: 20,
        statusSkill: "mob_glacial_chill",
        chillAmountBonus: 1,
        chillFixedDamageBonus: 8,
      },
    ],
    traits: [
      "얼어붙는 손길 — 한기 누적과 제한된 MP의 강한 마법 액티브",
      "빙결 갑주 — HP 70%부터 물리·마법 방어와 한기 압박 상승",
      "혹한의 심장 — HP 40%부터 마법 공격·한기 누적·고정 피해 상승",
    ],
  },
  void_priest: {
    id: "void_priest",
    rewardMode: "coop",
    visibilityLocked: false,
    name: "공허의 대사제",
    desc: "검은 왕도의 봉인 아래 남은 대사제. 맞설수록 저주가 깊어지고, 남은 저주는 다음 일격을 더 무겁게 만든다.",
    scrollCost: 30,
    sharedMaxHp: 630_000,
    anchorDepth: 60,
    base: VOID_PRIEST_BASE,
    uniqueIds: ["v2_boss_void_bastion", "v2_boss_void_reliquary"],
    titleId: "v2_boss_void_priest",
    enrageStages: [
      {
        hpFraction: 0.75,
        note: "봉인의 문양이 갈라진다 (방어력 상승)",
        defBonus: 8,
      },
      {
        hpFraction: 0.5,
        note: "공허의 저주가 짙어진다! (공격력·방어력 상승)",
        atkMult: 1.2,
        defBonus: 10,
      },
      {
        hpFraction: 0.25,
        note: "대사제가 공허문을 열었다! (공격력·방어력·회피 상승)",
        atkMult: 1.25,
        defBonus: 12,
        evasionBonus: 6,
      },
    ],
    traits: [
      "공허의 저주 — 적중 시 저주 누적, 임계 도달 시 폭발 후 남은 저주는 받는 피해 증가",
      "마법 치명타 — 마법 방어와 치명타 저항으로 대응",
      "발악 — HP 75%·50%·25% 단계로 점점 강해짐(방어력·공격력·회피)",
    ],
  },
  mountain_chief_hard: {
    id: "mountain_chief_hard",
    rewardMode: "coop",
    visibilityLocked: false,
    difficulty: "hard",
    name: "흉포한 산군",
    desc: "피 냄새에 날이 선 산군. 산길을 막고 선 자를 끝까지 물어뜯는다.",
    scrollCost: 30,
    sharedMaxHp: 1_200_000,
    anchorDepth: 68,
    base: MOUNTAIN_CHIEF_HARD_BASE,
    uniqueIds: [],
    titleId: "v2_boss_mountain",
    statusSkill: "mob_rending_claw",
    enrageStages: [],
    conditionalEnrage: {
      hpFraction: 0.5,
      normal: {
        hpFraction: 0.5,
        note: "산군의 포효가 산등성이를 뒤흔든다! (공격력·방어력 상승)",
        atkMult: 1.35,
        defBonus: 20,
      },
      weakened: {
        hpFraction: 0.5,
        note: "벌어진 상처 탓에 산군의 포효가 흐트러졌다. (공격력·방어력 소폭 상승)",
        atkMult: 1.15,
        defBonus: 8,
      },
    },
    traits: ["강한 물리 압박", "출혈", "피와 상처에 민감하게 반응"],
  },
  abyssal_tyrant: {
    id: "abyssal_tyrant",
    rewardMode: "coop",
    visibilityLocked: false,
    difficulty: "hard",
    name: "심연어룡",
    desc: "낚싯줄 아래 어둠을 찢고 올라오는 거대한 어룡. 거품과 해류를 몰아치며 전장을 휘젓는다.",
    scrollCost: 30,
    sharedMaxHp: 1_400_000,
    anchorDepth: 60,
    base: ABYSSAL_TYRANT_BASE,
    uniqueIds: [],
    titleId: "v2_boss_lake",
    enrageStages: [],
    conditionalEnrage: {
      hpFraction: 0.5,
      normal: {
        hpFraction: 0.5,
        note: "심연어룡이 심해의 수압을 통째로 끌어올린다! (공격력·방어력·회피 상승)",
        atkMult: 1.35,
        defBonus: 12,
        evasionBonus: 8,
      },
      weakened: {
        hpFraction: 0.5,
        note: "갈라진 아가미 사이로 심해의 수압이 새어나간다. (공격력·방어력 소폭 상승)",
        atkMult: 1.15,
        defBonus: 8,
      },
    },
    traits: [
      "심해 돌진 — 방어 관통",
      "비전 해일 — 제한된 MP로 강한 마법 피해",
      "낚시 이벤트 — 챔질 성공 시 0.02% 확률로 출현",
      "숨구멍 — HP 50% 돌입 순간 치명타로 압력을 흔들면 수압 발악 약화",
    ],
  },
  tracking_weapon: unexploredPersonalBossKind("tracking_weapon"),
  toxic_blood_lord: unexploredPersonalBossKind("toxic_blood_lord"),
  glacial_colossus: unexploredPersonalBossKind("glacial_colossus"),
  invincible_fortress: unexploredPersonalBossKind("invincible_fortress"),
  skyward_crystal_eye: unexploredPersonalBossKind("skyward_crystal_eye"),
};

export const COOP_BOSS_KIND_IDS = Object.keys(
  COOP_BOSSES,
) as CoopBossKindId[];

export function isStandardCoopBossKindId(
  kindId: CoopBossKindId,
): kindId is StandardCoopBossKindId {
  return COOP_BOSSES[kindId].rewardMode === "coop";
}

export const STANDARD_COOP_BOSS_KIND_IDS: readonly StandardCoopBossKindId[] =
  COOP_BOSS_KIND_IDS.filter(isStandardCoopBossKindId);

export const SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS: readonly StandardCoopBossKindId[] =
  STANDARD_COOP_BOSS_KIND_IDS.filter(
    (kindId): kindId is StandardCoopBossKindId =>
      kindId !== FISHING_COOP_BOSS_KIND_ID,
  );

export function isScrollSummonableCoopBossKind(
  kindId: CoopBossKindId,
): boolean {
  return (
    kindId !== FISHING_COOP_BOSS_KIND_ID &&
    isStandardCoopBossKindId(kindId)
  );
}

export function parseCoopBossKindId(v: unknown): CoopBossKindId | null {
  // own-key 만 인정 — `in` 은 프로토타입 키("toString" 등)도 통과시켜, 손상된 payload 가
  //   COOP_BOSSES["toString"](프로토타입 함수)로 새는 잠복 위험이 있었다(코덱스 지적).
  return typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(COOP_BOSSES, v)
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
  options: { conditionalEnrageWeakened?: boolean; bossMp?: number } = {},
): { monster: Monster; enrageNotes: string[] } {
  // 협동 보스는 sharedMaxHp + anchorDepth 로 난이도를 독립 튜닝 → 솔로 엔드게임 완화(softenEndgame)
  //   는 적용하지 않는다(앵커 24·42 가 완화 임계 위라 보스 atk 가 의도치 않게 약화되는 것 방지).
  const scaled = scaleMonsterForFloor(kind.base, kind.anchorDepth, false);
  const hp = Math.max(1, Math.min(Math.floor(currentHp), kind.sharedMaxHp));
  const frac = hp / kind.sharedMaxHp;
  let atk = scaled.atk;
  let def = scaled.def;
  let magicDef = scaled.magicDef;
  let evasion = scaled.evasionPct ?? 0;
  let spd = scaled.spd;
  let skill = scaled.skill;
  let statusSkill = kind.statusSkill;
  const enrageNotes: string[] = [];
  const applyEnrage = (stage: CoopEnrageStage) => {
    if (frac > stage.hpFraction) return;
    if (stage.atkMult) atk = Math.round(atk * stage.atkMult);
    if (stage.defBonus) {
      def += stage.defBonus;
      if (magicDef != null) magicDef += stage.defBonus;
    }
    if (stage.evasionBonus) evasion += stage.evasionBonus;
    if (stage.spdMult) spd = Math.round(spd * stage.spdMult);
    if (stage.statusSkill) statusSkill = stage.statusSkill;
    if (stage.armorPierceBonus && skill?.kind === "pierce") {
      skill = {
        ...skill,
        armorPierce: skill.armorPierce + stage.armorPierceBonus,
      };
    }
    if (skill?.kind === "chill") {
      if (stage.chillAmountBonus) {
        skill = { ...skill, perHit: skill.perHit + stage.chillAmountBonus };
      }
      if (stage.chillFixedDamageBonus) {
        skill = {
          ...skill,
          dmgPerStack: skill.dmgPerStack + stage.chillFixedDamageBonus,
        };
      }
    }
    enrageNotes.push(stage.note);
  };
  for (const stage of kind.enrageStages) {
    applyEnrage(stage);
  }
  if (kind.conditionalEnrage && frac <= kind.conditionalEnrage.hpFraction) {
    applyEnrage(
      options.conditionalEnrageWeakened
        ? kind.conditionalEnrage.weakened
        : kind.conditionalEnrage.normal,
    );
  }
  const monster: Monster = {
    ...scaled,
    hp,
    atk,
    def,
    spd,
    skill,
    ...(magicDef != null ? { magicDef } : {}),
    ...(evasion > 0 ? { evasionPct: evasion } : {}),
    v2Skills: statusSkill
      ? {
          learned: Array.from(
            new Set([...(scaled.v2Skills?.learned ?? []), statusSkill]),
          ),
          equipped: Array.from(
            new Set([...(scaled.v2Skills?.equipped ?? []), statusSkill]),
          ),
        }
      : scaled.v2Skills,
    v2MaxMp: Math.max(
      0,
      Math.min(
        coopBossMaxMp(kind),
        Math.floor(options.bossMp ?? scaled.v2MaxMp ?? coopBossMaxMp(kind)),
      ),
    ),
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
  acc[b.titleId] ??= b.id;
  return acc;
}, {});
