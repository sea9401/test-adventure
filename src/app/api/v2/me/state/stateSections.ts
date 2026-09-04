// /api/v2/me/state 응답 섹션 — 라우트의 인라인 IIFE 들을 추출한 순수 헬퍼(DB 미접촉).
// 각 함수는 "파싱 전 raw save 값"을 받아 섹션 계산 전부를 담당한다(섹션별 재파싱은
// 추출 전 라우트와 동일 동작). DB 를 만지는 섹션(currentOutpost·타일 정착지)은
// stateOutpost.ts, 응답 조립·인증·부수효과(reconcile/칭호 지급)는 route.ts 소관.
import {
  parseV2SkillsState,
  V2_SKILLS,
  v2SkillLearnCost,
  spCostOf,
  orderedLearnedSkills,
} from "@/adventure/data/v2/v2Skills";
import { resolveElementalResonanceLoadout } from "@/adventure/data/v2/elementalResonance";
import {
  isSkillRitualFocusEligible,
  isSkillRitualPowerEligible,
  isSkillRitualEligible,
  skillRitualFocusBonusPct,
  skillRitualLevel,
  skillRitualMode,
  skillRitualPowerBonusPct,
  skillRitualRefund,
} from "@/adventure/data/v2/skillRitual";
import {
  parseV2Class,
  tier1ClassOf,
  nextAdvanceTier,
  tierCodexMin,
  elementalSkillsForClass,
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
} from "@/adventure/data/v2/classes";
import {
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MODE,
  HUNT_COOLDOWN_MS,
  OFFLINE_MAX_MS,
  calcSpBudgetBreakdown,
  combatCooldownRemainingMs,
  offlineBattlesAccrued,
  offlineFarmDepth,
  spMasteryProgressForCumLevel,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  parseSpFruitUsed,
  spCapBonusFromRaw,
} from "@/adventure/data/v2/spFruit";
import {
  parseProficiencyForChar,
  groupCumLevel,
  usablePoints,
  cultivationCount,
  cultivationCost,
  totalCapGains,
  capGain,
  effectiveStatCap,
  effectiveLevelCap,
  refundableCultivationPoints,
  cultivationResetGoldCost,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_STAT_KEYS, V2_STAT_LABELS } from "@/adventure/data/v2/v2StatKeys";
import { lifeResourceRangesForProficiency } from "@/adventure/data/v2/statGrowth";
import { LIFE_RESOURCE_GROWTH_VERSION } from "@/adventure/data/v2/lifeResourceGrowth";
import {
  V2_JOB_LIST,
  V2_JOB_CATALOG,
  isJobUnlockConditionRevealed,
  isJobUnlocked,
  isRootJobSelectable,
  jobUnlockSpBonus,
  jobIdFromLegacy,
  jobUnlockConditionText,
  cumLevelForJob,
  rejobRequiredLevel,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { powerInputFromPlayer } from "@/lib/server/playerPowerInput";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  codexRequirement,
} from "@/adventure/data/v2/codex";
import { FISH_TOTAL } from "@/adventure/data/v2/fish";
import {
  FISHING_CODEX_SP_MILESTONES,
  caughtFishIds,
  fishCodexSpBonus,
  nextFishCodexMilestone,
  parseFishCodex,
  registeredFishIds,
} from "@/adventure/v2/fishingCodex";
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { COOKING_SECRET_RECIPES } from "@/lib/server/cooking/recipes";
import { parseCookingState } from "@/adventure/v2/cooking/state";
import { codexSpBonusFromRaw } from "@/lib/server/codexSpBonus";
import type { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";
import type { JobSpLoadoutMigration } from "@/lib/server/v2Skills";
import {
  tier7AdvancementStatus,
  type Tier7AdvancementStatus,
} from "@/adventure/data/v2/tier7Advancement";

// 라우트가 cast 해 들고 있는 character.v2 의 느슨한 모양 — 섹션이 읽는 키만 선언.
type StateCharSave = {
  level?: number;
  class?: unknown;
  specChoice?: unknown;
  revisitJobId?: unknown;
  materials?: unknown;
  frontierDepth?: unknown;
  spFruitUsed?: unknown;
  tilePos?: { col?: number; row?: number; at?: number };
  lastBattleAt?: number;
  offlineHuntStartedAt?: number;
  lastHuntDepth?: number;
  [k: string]: unknown;
};

type CombatDerived = ReturnType<typeof derivePlayerCombatV2FromSaves>;

// 전투 횟수(전적) — 정의는 lib/server/battleCount 로 단일화(hunt 신참 게이트·player 프로필과 공용).
export { battleCountOf } from "@/lib/server/battleCount";

// V2CharacterScreen StatsPanel 표시용 전투 스탯 — combat 미생성(캐릭 없음) 시 null.
export function combatStatsSection(
  combat: CombatDerived,
  maxHp: number,
  maxMp: number,
) {
  return combat
    ? {
        atk: combat.player.atk,
        def: combat.player.def,
        spd: combat.player.spd,
        // 마법 공격력 — INT 환산. 0(물리 빌드)이면 StatsPanel 이 숨김.
        magicAtk: combat.player.magicAtk ?? 0,
        // 마법 방어력 — SPI(+INT 약간)+장신구 환산. 마법 데미지를 막는 별개 방어 스탯.
        magicDef: combat.player.magicDef ?? 0,
        // 최종 회복량 배율 — SPI·VIT 파생값과 장비·장착 패시브 회복 옵션을 모두 반영한다.
        healMult: combat.player.healMult ?? 1,
        magicBarrierMax: combat.player.magicBarrierMax ?? 0,
        magicBarrierAbsorbPct: combat.player.magicBarrierAbsorbPct ?? 0,
        magicBarrierEfficiencyPct:
          combat.player.magicBarrierEfficiencyPct ?? 0,
        // 숨은 전투 축 — 회피/명중/치명타/다중공격.
        evasionPct: combat.player.evasionPct,
        // 회피 대결형(Slice 1b) — 캡 없는 raw 회피레이팅.
        evaRating: combat.player.evaRating,
        accuracyPct: combat.player.accuracyPct,
        // 회피 대결형(Slice 2) — 캡 없는 raw 명중레이팅.
        accRating: combat.player.accRating,
        critChancePct: combat.player.critChancePct,
        critMult: combat.player.critMult,
        critResistPct: combat.player.critResistPct,
        skillCritOverflow: combat.player.skillCritOverflow === true,
        skillCritDmgPct: combat.player.skillCritDmgPct,
        equipmentMagicSkillCritDmgPct:
          combat.player.equipmentMagicSkillCritDmgPct,
        // 콘텐츠 파워(docs §8) — 던전 층 권장 파워와 비교용 합성 지표(PR-7).
        power: derivePowerScore(
          powerInputFromPlayer(combat.player, maxHp, maxMp),
        ),
      }
    : null;
}

// 코어루프 직업 트리(전직 UI) — off 면 null. 해금/조건/보너스/스킬수집까지 카탈로그 파생.
export function tier7AdvancementViewForJob(args: {
  jobId: string;
  currentJobId: string;
  level: number;
  proficiency: V2ProficiencyState;
  materials: unknown;
}): Tier7AdvancementStatus | null {
  return tier7AdvancementStatus({
    targetJobId: args.jobId,
    currentJobId: args.currentJobId,
    currentLevel: args.level,
    jobCumLevel: args.proficiency.jobCumLevel ?? {},
    jobHistory: args.proficiency.jobHistory ?? [],
    materials: args.materials,
  });
}

export function jobsV2Section(params: {
  charSave: StateCharSave;
  proficiencyRaw: unknown;
  skillsRaw: unknown;
  jobUnlockCtx: JobUnlockContext | undefined;
}) {
  const { charSave, proficiencyRaw, skillsRaw, jobUnlockCtx } = params;
  if (!V2_CORE_LOOP_V2) return null;
  const cls = parseV2Class(charSave.class);
  const prof = parseProficiencyForChar(proficiencyRaw, charSave);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const level = Math.max(1, charSave.level ?? 1);
  const currentJobId = jobIdFromLegacy(cls, specChoice);
  // 현재 직업 이름은 전체 카탈로그에서 — 필터된 목록에 현재 직업이 없을 수도 있으므로
  //   (예: 미인식 class 'swordsman' → 모험가 폴백). 카탈로그 미존재면 직군 표시명 폴백.
  const currentJobName =
    V2_JOB_CATALOG[currentJobId]?.name ??
    (cls === "none" ? "모험가" : (V2_CLASS_DEFS[cls]?.name ?? "모험가"));
  const currentJobTier = V2_JOB_CATALOG[currentJobId]?.tier ?? 0;
  // 이미 수련했던 직업으로 돌아온 경우에는 놓친 스킬만 익히고 곧바로 다른
  // 직업으로 이동할 수 있다. 같은 직업 재전직은 여전히 원래 레벨 조건을 쓴다.
  const revisitExpedited = charSave.revisitJobId === currentJobId;
  const currentJobLevelCap = rejobRequiredLevel(currentJobId);
  const jobHistory = new Set(prof.jobHistory ?? []);
  // 스킬 수집 완료 판정용 — 학습한 스킬 집합(직업 도감과 동일 기준).
  const learnedSet = new Set(parseV2SkillsState(skillsRaw).learned);
  return {
    currentJobId,
    currentJobName,
    currentJobTier,
    currentJobLevelCap,
    atLevelCap: revisitExpedited || level >= currentJobLevelCap,
    revisitExpedited,
    jobs: V2_JOB_LIST.filter(
      // 루트 직업도 전직 대상에 포함 — 모험가/생존자 킷을 배우려면 되돌아갈 수 있어야 한다.
      (job) => isRootJobSelectable(job),
    ).map((job) => {
      const tier7Advancement = tier7AdvancementViewForJob({
        jobId: job.id,
        currentJobId,
        level,
        proficiency: prof,
        materials: charSave.materials,
      });
      const unlocked = tier7Advancement
        ? tier7Advancement.permanentlyUnlocked ||
          tier7Advancement.nonLevelRequirementsMet
        : isJobUnlocked(job, prof, jobUnlockCtx);
      const cumLevel = cumLevelForJob(prof, job);
      const conditionRevealed = isJobUnlockConditionRevealed(
        job,
        prof,
        currentJobId,
        unlocked,
      );
      const condition = conditionRevealed
        ? jobUnlockConditionText(job)
        : "선행 직업 해금 후 공개";
      // 직업 내장 보너스(플랫 스탯) — "이 직업을 고를 이유"로 전직 화면에 표기.
      const bonus = V2_STAT_KEYS.filter((k) => job.jobBonus[k])
        .map((k) => `${V2_STAT_LABELS[k]} +${job.jobBonus[k]}`)
        .join(" · ");
      // 스킬 수집 완료 — 그 직업의 시그니처 스킬을 전부 배웠는가(직업 도감과 동일).
      const signature = skillsForJob(job.id);
      const signatureSkills = signature.map((skillId) => {
        const skill = V2_SKILLS[skillId];
        return {
          id: skillId,
          name: skill?.name ?? skillId,
          kind: skill?.category === "passive" ? "passive" : "active",
        } as const;
      });
      const skillsCollected =
        signature.length > 0 && signature.every((id) => learnedSet.has(id));
      return {
        id: job.id,
        name: job.name,
        tier: job.tier,
        unlocked,
        condition,
        conditionRevealed,
        cumLevel,
        visited: isRecordedJobVisit({
          jobId: job.id,
          currentJobId,
          jobHistory,
          cumLevel,
        }),
        bonus,
        signatureSkills,
        skillsCollected,
        ...(tier7Advancement ? { tier7Advancement } : {}),
      };
    }),
  };
}

export function isRecordedJobVisit({
  jobId,
  currentJobId,
  jobHistory,
  cumLevel,
}: {
  jobId: string;
  currentJobId: string;
  jobHistory: ReadonlySet<string>;
  cumLevel: number;
}): boolean {
  return jobId === currentJobId || jobHistory.has(jobId) || cumLevel > 0;
}

// 사냥 게이트 — 쿨다운/오프라인 사냥 세션(코어루프 쿨다운 모드 전용, 스태미나 모드면 null).
export function huntGateSections(charSave: StateCharSave, now: number) {
  const cooldownRemaining = combatCooldownRemainingMs(
    Number(charSave.lastBattleAt) || 0,
    now,
  );
  // 쿨다운 객체는 쿨다운 모드만 — 스태미나 모드면 null → 클라 사냥 UI 가 스태미나로 폴백.
  const combatCooldown = HUNT_COOLDOWN_MODE
    ? {
        nextBattleAt: now + cooldownRemaining,
        cooldownMs: HUNT_COOLDOWN_MS,
        serverNow: now,
      }
    : null;
  // 오프라인 사냥 — 명시 세션(offlineHuntStartedAt) 켜진 동안만 누적. 세션 창=시작+2h.
  const offlineStartedAt = Number(charSave.offlineHuntStartedAt) || 0;
  const offlineActive = HUNT_COOLDOWN_MODE && offlineStartedAt > 0;
  const offlineEndsAt = offlineStartedAt + OFFLINE_MAX_MS;
  const offlinePending = !HUNT_COOLDOWN_MODE
    ? null
    : offlineActive
      ? offlineBattlesAccrued(
          Number(charSave.lastBattleAt) || 0,
          Math.min(now, offlineEndsAt),
        )
      : 0;
  const offlineHunt = HUNT_COOLDOWN_MODE
    ? offlineActive
      ? {
          active: true,
          startedAt: offlineStartedAt,
          endsAt: offlineEndsAt,
          serverNow: now,
          // 자동 사냥이 도는 farm 깊이 — 정산 깊이와 동일.
          depth: offlineFarmDepth(
            Number(charSave.lastHuntDepth),
            Number(charSave.frontierDepth) || 2,
          ),
        }
      : { active: false }
    : null;
  return { combatCooldown, offlinePending, offlineHunt };
}

// 학습 가능 스킬 풀 — 현 직업(jobId)의 시그니처 킷 + 학습/장착여부(학습 패널용).
export function elementalSkillsSection(
  charSave: StateCharSave,
  skillsRaw: unknown,
) {
  const cls = parseV2Class(charSave.class);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  // 학습 비용은 스킬 티어/오버라이드 기준(learn-skill 과 동일 산식).
  const skillsState = parseV2SkillsState(skillsRaw);
  const learnedSet = new Set<string>(skillsState.learned);
  const equippedSet = new Set<string>(skillsState.equipped);
  return elementalSkillsForClass(cls, specChoice).map((skillId) => {
    const def = V2_SKILLS[skillId];
    const ritualLevel = skillRitualLevel(skillsState.enhancements, skillId);
    const ritualMode = skillRitualMode(skillsState.enhancements, skillId);
    return {
      skillId,
      name: def.name,
      cost: v2SkillLearnCost(skillId),
      spCost: spCostOf(def),
      learned: learnedSet.has(skillId),
      equipped: equippedSet.has(skillId),
      ritualMode,
      ritualLevel,
      ritualBonusPct:
        ritualMode === "focus"
          ? skillRitualFocusBonusPct(ritualLevel)
          : skillRitualPowerBonusPct(ritualLevel),
      ritualPowerBonusPct:
        ritualMode === "power" ? skillRitualPowerBonusPct(ritualLevel) : 0,
      ritualFocusBonusPct:
        ritualMode === "focus" ? skillRitualFocusBonusPct(ritualLevel) : 0,
      ritualPowerEligible: isSkillRitualPowerEligible(def),
      ritualFocusEligible: isSkillRitualFocusEligible(def),
      ritualEligible: isSkillRitualEligible(def),
      ritualRefund: skillRitualRefund(ritualLevel),
    };
  });
}

// SP 로드아웃(코어루프 전용) — 수동 로드아웃 화면용. 호출자는 flag on 일 때만 응답에 포함.
export function loadoutSection(params: {
  charSave: StateCharSave;
  proficiencyRaw: unknown;
  skillsRaw: unknown;
  fishingCodexRaw: unknown;
  equipmentCodexSpBonus: number;
  jobUnlockCtx?: JobUnlockContext;
  jobSpMigration?: JobSpLoadoutMigration | null;
  now?: number;
}) {
  const {
    charSave,
    proficiencyRaw,
    skillsRaw,
    fishingCodexRaw,
    equipmentCodexSpBonus: equipmentCodexBonus,
    jobUnlockCtx,
    jobSpMigration,
    now = Date.now(),
  } = params;
  const prof = parseProficiencyForChar(proficiencyRaw, charSave);
  const skillsState = parseV2SkillsState(skillsRaw);
  const equippedSet = new Set<string>(skillsState.equipped);
  const resonance = resolveElementalResonanceLoadout({
    learned: skillsState.learned,
    equipped: skillsState.equipped,
  });
  const absorbedSet = new Set(resonance.absorbedSkillIds);
  const collectionBonus = codexSpBonusFromRaw(fishingCodexRaw);
  const spFruitBonus = spCapBonusFromRaw(charSave.spFruitUsed);
  const spBudgetGroups = Object.fromEntries(
    V2_SELECTABLE_CLASSES.map((id) => [
      id,
      prof.groups?.[id] ?? { cumLevel: 0 },
    ]),
  );
  const spBreakdownBase = calcSpBudgetBreakdown(
    spBudgetGroups,
    spFruitBonus,
    collectionBonus.total + equipmentCodexBonus,
    jobUnlockSpBonus(prof, jobUnlockCtx),
  );
  const spBudget = spBreakdownBase.budget;
  const groups = V2_SELECTABLE_CLASSES.map((id) => {
    const g = spBudgetGroups[id];
    const progress = spMasteryProgressForCumLevel(Number(g?.cumLevel) || 0);
    const label = V2_CLASS_DEFS[id].name;
    return {
      id,
      label,
      ...progress,
    };
  });
  const milestoneSp = groups.reduce((sum, g) => sum + g.milestoneSp, 0);
  const masteryBonusSp = groups.reduce((sum, g) => sum + g.masteryBonusSp, 0);
  const spUsed = resonance.spUsed;
  const favoriteSet = new Set<string>(skillsState.favoriteSkills ?? []);
  const library = orderedLearnedSkills(
    skillsState.learned,
    skillsState.skillOrder,
  )
    .filter((id) => V2_SKILLS[id])
    .map((id) => {
      const def = V2_SKILLS[id];
      const equipped = equippedSet.has(id);
      const ritualLevel = skillRitualLevel(skillsState.enhancements, id);
      const ritualMode = skillRitualMode(skillsState.enhancements, id);
      const baseSpCost = spCostOf(def);
      const effectiveSpCost = equipped
        ? resonance.effectiveSpCosts.get(id)
        : undefined;
      const resonanceRole = equipped
        ? resonance.catalystActive && id === "v2c_elementallord_surge"
          ? "catalyst"
          : absorbedSet.has(id)
            ? "material"
            : "inactive"
        : undefined;
      return {
        skillId: id,
        name: def.name,
        spCost: baseSpCost,
        ...(effectiveSpCost !== undefined && effectiveSpCost !== baseSpCost
          ? { effectiveSpCost }
          : {}),
        ...(resonanceRole ? { resonanceRole } : {}),
        category: def.category,
        equipped,
        favorite: favoriteSet.has(id),
        ritualMode,
        ritualLevel,
        ritualBonusPct:
          ritualMode === "focus"
            ? skillRitualFocusBonusPct(ritualLevel)
            : skillRitualPowerBonusPct(ritualLevel),
        ritualPowerBonusPct:
          ritualMode === "power" ? skillRitualPowerBonusPct(ritualLevel) : 0,
        ritualFocusBonusPct:
          ritualMode === "focus" ? skillRitualFocusBonusPct(ritualLevel) : 0,
        ritualPowerEligible: isSkillRitualPowerEligible(def),
        ritualFocusEligible: isSkillRitualFocusEligible(def),
        ritualEligible: isSkillRitualEligible(def),
        ritualRefund: skillRitualRefund(ritualLevel),
      };
    });
  // 장착 순서(우선순위·갬빗 fallback) 보존 — 카탈로그 유효분만.
  const equipped = skillsState.equipped.filter((id) => V2_SKILLS[id]);
  return {
    spBudget,
    spUsed,
    equipped,
    library,
    ...(jobSpMigration
      ? {
          spMigration: {
            graceActive: jobSpMigration.graceActive,
            graceEndsAt: jobSpMigration.graceEndsAt,
            serverNow: now,
            overBudgetBy: Math.max(0, spUsed - spBudget),
            removedSkillIds: jobSpMigration.removedSkillIds,
          },
        }
      : {}),
    spBreakdown: {
      base: spBreakdownBase.base,
      milestoneSp,
      masteryBonusSp,
      jobUnlockSp: spBreakdownBase.jobUnlockSp,
      softCapReduction: spBreakdownBase.softCapReduction,
      spFruitBonus: spBreakdownBase.spFruitBonus,
      equipmentCodexBonus,
      collectionBonusSp: collectionBonus.total,
      collectionBonus: {
        fishSp: collectionBonus.fishSp,
      },
      groups,
    },
  };
}

// SP 열매 사용 현황 — 인벤 소모품 탭이 등급별 "사용 N/캡"·캡 도달 여부를 그린다.
export function spFruitSection(spFruitUsedRaw: unknown) {
  const used = parseSpFruitUsed(spFruitUsedRaw);
  return { used, capBonus: spCapBonusFromRaw(spFruitUsedRaw) };
}

// 모험의 서(재료 도감) 진척 — 3·4차 전직 게이트 + 코덱스 UI 표시용.
export function materialCodexSection(materialsRaw: unknown) {
  const ids = discoveredMaterialIds(materialsRaw);
  return { discovered: ids.length, total: V2_CODEX_TOTAL, discoveredIds: ids };
}

// 어보(낚시 도감) 진척 — V2CodexView 어보 탭 표시용. 종별 개인 최대어 동봉.
export function fishingCodexSection(fishingCodexRaw: unknown) {
  const codex = parseFishCodex(fishingCodexRaw);
  const registeredIds = registeredFishIds(codex);
  const caughtIds = caughtFishIds(codex);
  const best: Record<string, number> = {};
  for (const id of caughtIds) best[id] = codex.fish[id].bestSize;
  return {
    registeredIds,
    caughtIds,
    discoveredIds: registeredIds,
    total: FISH_TOTAL,
    best,
    spBonus: fishCodexSpBonus(codex),
    milestones: [...FISHING_CODEX_SP_MILESTONES],
    nextMilestone: nextFishCodexMilestone(registeredIds.length),
    tierCompletions: codexSpBonusFromRaw(fishingCodexRaw).fishTiers,
  };
}

// 요리 완성 도감 — 첫 완성으로 등록된 요리법만 모험의 서에 전달한다.
export function cookingCodexSection(cookingRaw: unknown) {
  const cooking = parseCookingState(cookingRaw);
  const discovered = new Set(cooking.discoveredRecipeIds);
  return {
    knownRecipes: COOKING_SECRET_RECIPES
      .filter((recipe) => discovered.has(recipe.id))
      .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        imageSrc: recipe.imageSrc,
        description: recipe.description,
        effect: recipe.effect,
      })),
    total: COOKING_PUBLIC_RECIPES.length,
  };
}

// 프론티어 최고 도달 깊이 — MAX 캡으로 정규화(레거시 >MAX 저장값도 현재 콘텐츠 끝으로 표시).
export function frontierDepthOf(frontierDepthRaw: unknown): number {
  return Math.min(
    MAX_FRONTIER_DEPTH,
    Math.max(2, Math.floor(Number(frontierDepthRaw) || 2)),
  );
}

// 자유 타일 지도 마커 좌표 — 없으면 null → 클라가 현재 거점 칸에서 파생.
export function tilePosOf(tilePos: StateCharSave["tilePos"]) {
  return tilePos &&
    typeof tilePos.col === "number" &&
    typeof tilePos.row === "number"
    ? {
        col: tilePos.col,
        row: tilePos.row,
        ...(typeof tilePos.at === "number" ? { at: tilePos.at } : {}),
      }
    : null;
}

// 직업 숙련도(직업 마스터리) — 총/직업 + 현 직업군 사용가능. 수행·전직·표시용.
export function proficiencySection(
  proficiencyRaw: unknown,
  charSave: StateCharSave,
) {
  const prof = parseProficiencyForChar(proficiencyRaw, charSave);
  const curClass = parseV2Class(charSave.class);
  const group = tier1ClassOf(curClass);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const currentJobId = jobIdFromLegacy(curClass, specChoice);
  const currentJob = V2_JOB_CATALOG[currentJobId];
  // caps 는 절대 한계치(= 기본 60 + 수행 이득)로 노출. 사냥 숙련도로 오르는
  // 저점(floor)은 한계치를 변경하지 않는다.
  const effectiveCaps: Partial<Record<string, number>> = {};
  for (const k of V2_STAT_KEYS) {
    effectiveCaps[k] = effectiveStatCap(capGain(prof, k));
  }
  const resourceGrowthVersion = prof.lifeResourceGrowth?.version;
  const currentResourceRanges = lifeResourceRangesForProficiency(
    prof,
    resourceGrowthVersion ?? LIFE_RESOURCE_GROWTH_VERSION,
  );
  const nextRejobResourceRanges =
    resourceGrowthVersion === 1
      ? lifeResourceRangesForProficiency(prof, LIFE_RESOURCE_GROWTH_VERSION)
      : null;
  return {
    groups: prof.groups,
    caps: effectiveCaps,
    lifeResourceGrowth: {
      mode: prof.lifeResourceGrowth ? ("rolled" as const) : ("legacy" as const),
      currentRanges: currentResourceRanges,
      nextRejobRanges: nextRejobResourceRanges,
      appliesAfterRejob: !prof.lifeResourceGrowth,
    },
    current: {
      group,
      // 직업 숙련도 — tier1 은 직군 숙련도, tier2+ 는 jobCumLevel.
      cumLevel: currentJob
        ? cumLevelForJob(prof, currentJob)
        : groupCumLevel(prof, group),
      // 숙달 포인트 잔액(사용가능). 옛 earned/usable 통합.
      points: usablePoints(prof),
      cultivations: cultivationCount(prof, group),
      capGains: totalCapGains(prof),
      nextCost: cultivationCost(totalCapGains(prof)),
      cultivationPointsSpent: refundableCultivationPoints(prof),
      growthRespecPoints: prof.growthRespecPoints ?? 0,
      cultivationResetCount: prof.cultivationResetCount ?? 0,
      cultivationResetGoldCost: cultivationResetGoldCost(
        prof.cultivationResetCount ?? 0,
      ),
      // 현 직업군 다음 차수 전직 가능 여부 — 코어루프 on 에서는 jobsV2/advance-class 가 권위라 숨긴다.
      advance: (() => {
        if (V2_CORE_LOOP_V2) return null;
        const cur = parseV2Class(charSave.class);
        if (cur === "none") return null;
        // P4 — 전직 = class 불변, proficiency.tier +1. 다음 차수(2/3/4), 정점이면 null.
        const curTier = prof.groups[group]?.tier ?? 1;
        const nextTier = nextAdvanceTier(curTier);
        if (!nextTier) return null;
        const haveLevel = Math.max(1, charSave.level ?? 1);
        const reqCum = 0;
        const haveCum = groupCumLevel(prof, group);
        const reqCodex = codexRequirement(tierCodexMin(nextTier));
        const haveCodex = discoveredMaterialIds(charSave.materials).length;
        return {
          nextClass: cur,
          nextName: V2_CLASS_DEFS[cur].name,
          nextTier,
          reqLevel: effectiveLevelCap(curTier),
          haveLevel,
          reqCum,
          haveCum,
          reqCodex,
          haveCodex,
          canAdvance:
            haveLevel >= effectiveLevelCap(curTier) && haveCodex >= reqCodex,
        };
      })(),
    },
  };
}
