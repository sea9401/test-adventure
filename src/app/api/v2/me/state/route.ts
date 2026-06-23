import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  guilds,
  guildMembers,
  outpostOccupations,
  outpostTreasury,
  savesKv,
  tileSettlements,
  users,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { reconcileV2EquippedSkills } from "@/lib/server/v2Skills";
import { ensureV2Character } from "@/lib/server/v2Character";
import {
  parseV2SkillsState,
  V2_SKILLS,
  v2SkillLearnCost,
  spCostOf,
} from "@/adventure/data/v2/v2Skills";
import {
  parseV2Class,
  tier1ClassOf,
  nextAdvanceTier,
  tierCodexMin,
  elementalSkillsForClass,
  V2_CLASS_DEFS,
  jobDisplayName,
} from "@/adventure/data/v2/classes";
import {
  V2_CORE_LOOP_V2,
  V2_FREEFORM_TILES,
  HUNT_COOLDOWN_MODE,
  V2_LEVEL_CAP,
  HUNT_COOLDOWN_MS,
  OFFLINE_MAX_MS,
  calcSpBudget,
  combatCooldownRemainingMs,
  offlineBattlesAccrued,
  offlineFarmDepth,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  parseProficiencyForChar,
  groupCumLevel,
  groupUsable,
  cultivationCount,
  cultivationCost,
  totalCapGains,
  capGain,
  effectiveStatCap,
  advanceCumLevelReq,
  V2_ADVANCE_MIN_LEVEL,
} from "@/adventure/data/v2/proficiency";
import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_STAT_KEYS, V2_STAT_LABELS } from "@/adventure/data/v2/v2StatKeys";
import {
  V2_JOB_LIST,
  V2_JOB_CATALOG,
  isJobUnlocked,
  jobIdFromLegacy,
  jobUnlockConditionText,
  cumLevelForJob,
  CATALOG_USES_QUEST_CONDITION,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import { loadCompletedQuestIds } from "@/lib/server/v2QuestContext";
import { parseV2Element } from "@/adventure/data/v2/elements";
import { derivePowerScore } from "@/adventure/data/v2/power";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  codexRequirement,
} from "@/adventure/data/v2/codex";
import { FISH_TOTAL } from "@/adventure/data/v2/fish";
import {
  discoveredFishIds,
  parseFishCodex,
} from "@/adventure/v2/fishingCodex";
import { ANTIQUE_TOTAL } from "@/adventure/data/v2/antique";
import {
  discoveredAntiqueIds,
  parseTreasureCodex,
} from "@/adventure/v2/treasureCodex";
import { parseTreasureFragments } from "@/adventure/v2/treasureFragments";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import {
  isIntruderActive,
  parseLastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { requiredExpToNext } from "@/lib/leveling";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
} from "@/adventure/v2/stamina";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import { resolveOutpostMeta } from "@/adventure/data/v2/tileWarfare";
import { seededDiscovery } from "@/adventure/data/v2/outpostGraph";

// GET /api/v2/me/state — V2GameFlow 의 mount fetch (캐릭+자원+currentOutpost).
//
// 캐릭터(레벨/EXP/HP/스태미너/골드) + 길드(id/name) + 자원풀 한 번에.
// HP·stamina 는 시간 회복 적용한 현재값으로 surface (다음 사냥 진입 시 동기화).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // reconcileV2EquippedSkills 는 idempotent — equipped 만 학습분∩현 체인으로 reconcile
  // (시그니처는 learn-skill 라우트로 숙련도 학습; 자동부여 폐지). learned 불변.
  // 길드는 더 이상 자동 생성 X — null 이면 무소속.
  const guildId = await db.transaction(async (tx) => {
    const gid = await getGuildId(tx, userId);
    await reconcileV2EquippedSkills(tx, userId);
    await ensureV2Character(tx, userId);
    return gid;
  });

  const [
    charRow,
    profileRow,
    guildRow,
    combat,
    resources,
    skillsRow,
    proficiencyRow,
    fishingCodexRow,
    treasureCodexRow,
    treasureFragmentsRow,
    adventureLogRow,
    staminaPotionsRow,
  ] = await Promise.all([
      db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
        .limit(1)
        .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, "character-profile.v2"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    guildId == null
      ? Promise.resolve(undefined)
      : db
          // 길드 이름 + 내 직책 한 번에 — 정착지 관리 탭 게이트(마스터/부마스터)용.
          .select({
            name: guilds.name,
            masterId: guilds.masterId,
            role: guildMembers.role,
          })
          .from(guilds)
          .leftJoin(
            guildMembers,
            and(
              eq(guildMembers.guildId, guilds.id),
              eq(guildMembers.userId, userId),
            ),
          )
          .where(eq(guilds.id, guildId))
          .limit(1)
          .then((rows) => rows[0]),
    derivePlayerCombatV2(userId),
    guildId == null
      ? Promise.resolve(null)
      : db.transaction(async (tx) => readGuildResources(tx, guildId)),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "proficiency.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "fishing-codex.v1")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "treasure-codex.v1")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "treasure-fragments.v1")),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, STAMINA_POTIONS_KEY)),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  // 전투 횟수(전적) — adventure-log.v2 의 monster kills 합 + 패배수 (랭킹 battleCount 와 동일 정의).
  const logVal = (adventureLogRow?.value ?? null) as {
    monsters?: Record<string, { kills?: number }>;
    battleLosses?: number;
  } | null;
  const battleCount =
    Object.values(logVal?.monsters ?? {}).reduce(
      (sum, m) => sum + (m?.kills ?? 0),
      0,
    ) + (logVal?.battleLosses ?? 0);

  const charSave = (charRow?.value ?? {}) as {
    level?: number;
    exp?: number;
    hp?: number;
    hpRegenSince?: number;
    stamina?: unknown;
    gold?: number;
    materials?: unknown;
    lastVisitedOutpost?: { outpostId?: string; at?: number };
    discoveredOutpostIds?: string[];
    tilePos?: { col?: number; row?: number; at?: number };
    frontierDepth?: unknown;
    lastHuntedOutpost?: unknown;
    equippedTitleId?: unknown;
  };

  // 칭호 — 보유(adventure-log.v2.titles)·장착(character.v2.equippedTitleId). 모험의 서
  // "칭호" 탭이 소비. 보유 목록만 노출하므로 옛 V1 칭호(v2 에선 미획득)는 포함되지 않는다.
  const ownedTitleIds = ownedTitleIdsOf(adventureLogRow?.value);
  const equippedTitleId =
    typeof charSave.equippedTitleId === "string" &&
    ownedTitleIds.includes(charSave.equippedTitleId)
      ? charSave.equippedTitleId
      : null;

  // V2TopBar 좌측 표시 — character.v2.lastVisitedOutpost.outpostId → OUTPOSTS lookup.
  // null = 아직 거점 방문 안 함 ("이동 중").
  // PR-outpost-info: V2AdventureHome 의 거점 카드용 occupation (보유 길드/세율/정책/다음 공격)
  // 동봉. row 없으면 occupation=null (NPC 운영). 점령 길드 name 별도 select.
  type OccupationInfo = {
    occupiedByUserId: string | null;
    occupiedByGuildId: number | null;
    occupiedByGuildName: string | null;
    occupiedAt: string;
    policy: string;
    taxRate: string;
    nextAttackAt: string;
  };
  type CurrentOutpost = {
    id: string;
    name: string;
    occupation: OccupationInfo | null;
    // 거점 금고 — 점령 길드원이 회수 가능한 누적 세금. 미점령 거점도 누적될 수 있어 별도 노출.
    treasuryGold: number;
  };
  let currentOutpost: CurrentOutpost | null = null;
  const lastVisitId = charSave.lastVisitedOutpost?.outpostId;
  if (typeof lastVisitId === "string") {
    const o = resolveOutpostMeta(lastVisitId);
    if (o) {
      const occRow = (
        await db
          .select()
          .from(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, o.id))
          .limit(1)
      )[0];
      let occupation: OccupationInfo | null = null;
      if (occRow) {
        let occGuildName: string | null = null;
        if (occRow.occupiedByGuildId != null) {
          const g = (
            await db
              .select({ name: guilds.name })
              .from(guilds)
              .where(eq(guilds.id, occRow.occupiedByGuildId))
              .limit(1)
          )[0];
          occGuildName = g?.name ?? null;
        }
        occupation = {
          occupiedByUserId: occRow.occupiedByUserId,
          occupiedByGuildId: occRow.occupiedByGuildId,
          occupiedByGuildName: occGuildName,
          occupiedAt: occRow.occupiedAt.toISOString(),
          policy: occRow.policy,
          taxRate: occRow.taxRate,
          nextAttackAt: occRow.nextAttackAt.toISOString(),
        };
      }
      const treasuryRow = (
        await db
          .select({ gold: outpostTreasury.gold })
          .from(outpostTreasury)
          .where(eq(outpostTreasury.outpostId, o.id))
          .limit(1)
      )[0];
      currentOutpost = {
        id: o.id,
        name: o.name,
        occupation,
        treasuryGold: Math.max(0, treasuryRow?.gold ?? 0),
      };
    }
  }
  const profile = (profileRow?.value ?? null) as {
    name?: string;
    gender?: string;
  } | null;
  const name = profile?.name?.trim() || "모험가";
  const gender =
    typeof profile?.gender === "string" && profile.gender.length > 0
      ? profile.gender
      : "male1";
  const guildName = guildRow?.name ?? null;
  const maxHp = combat?.maxHp ?? 100;
  const maxMp = combat?.player.maxMp ?? 0;

  const now = Date.now();
  // per-user 스태미나 최대치 — 기본 + 한계의 비약(비밀 상점) 보너스.
  const staminaMax =
    MAX_STAMINA +
    staminaCapBonusOf((charSave as { staminaCapBonus?: unknown }).staminaCapBonus);
  const stamina = applyRegen(
    parseStaminaFromSave(charSave.stamina, now),
    now,
    staminaMax,
  );

  const hpStored = Math.max(0, charSave.hp ?? maxHp);
  const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
  const hpRegen = applyHpRegen(hpStored, maxHp, hpRegenSince, now);

  const level = Math.max(1, charSave.level ?? 1);
  const exp = Math.max(0, charSave.exp ?? 0);
  const expToNext = requiredExpToNext(level);

  // V2CharacterScreen 의 StatsPanel 표시용. combat 미생성(캐릭 없음) 시 null.
  const stats = combat
    ? {
        base: combat.baseAllocatedStats,
        total: combat.totalStats,
      }
    : null;
  const combatStats = combat
    ? {
        atk: combat.player.atk,
        def: combat.player.def,
        spd: combat.player.spd,
        // 마법 공격력 — INT 환산. 0(물리 빌드)이면 StatsPanel 이 숨김.
        magicAtk: combat.player.magicAtk ?? 0,
        // 마법 방어력 — SPI(+INT 약간)+장신구 환산. 마법 데미지를 막는 별개 방어 스탯.
        magicDef: combat.player.magicDef ?? 0,
        // 숨은 전투 축 — 전투엔 반영되나 그동안 내 정보에 미표시. 회피/명중/치명타/다중공격.
        evasionPct: combat.player.evasionPct,
        // 회피 대결형(Slice 1b) — 캡 없는 raw 회피레이팅. UI 가 현재 깊이 몹명중과 대결해 실제 PvE dodge% 표시.
        evaRating: combat.player.evaRating,
        accuracyPct: combat.player.accuracyPct,
        // 회피 대결형(Slice 2) — 캡 없는 raw 명중레이팅. "명중" 표시에 사용(accuracyPct 캡 35 대신).
        accRating: combat.player.accRating,
        critChancePct: combat.player.critChancePct,
        critMult: combat.player.critMult,
        extraAttackChancePct: combat.player.extraAttackChancePct,
        // 콘텐츠 파워(docs §8) — 던전 층 권장 파워와 비교용 합성 지표(PR-7).
        power: derivePowerScore({
          atk: combat.player.atk,
          magicAtk: combat.player.magicAtk ?? 0,
          def: combat.player.def,
          spd: combat.player.spd,
          maxHp,
          maxMp,
        }),
      }
    : null;

  // 회원 탈퇴 확인용 권위 닉네임(users.gameName). v2 는 이 컬럼을 안 채워 보통 null →
  // DeleteAccountModal 이 "탈퇴" 폴백을 쓰고 /api/account/delete 도 같은 폴백을 기대 → 일치.
  const [userRow] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // 침입 상태 — 다른 길드 점령 거점에서 사냥한 TTL 내 기록(intruderTracking 과 동일 판정).
  // OutpostView 가 "이 거점에 침입 중 (토벌 가능)" 배너에 사용. 없으면 null.
  const lastHunted = parseLastHuntedOutpost(charSave.lastHuntedOutpost);
  const intrusion =
    lastHunted && isIntruderActive(lastHunted, lastHunted.outpostId, now)
      ? { outpostId: lastHunted.outpostId, at: lastHunted.at }
      : null;

  // 코어루프 직업 스탯게이트 — flag on 일 때만. 효과 스탯(combat.totalStats)으로 해금된
  const cls = parseV2Class((charSave as { class?: unknown }).class);
  // 직업 시스템 v2(cumLevel 해금) — 카탈로그 기반 전직 목록(전직 UI). 코어루프 on 일 때만.
  //   해금(cumLevel 조건 충족)된 직업만 내려보낸다 — 잠긴 직업은 숨김(클라가 그대로 한 목록 렌더).
  // questCompleted 조건을 쓰는 직업이 있을 때만 가이드 퀘스트 완료셋 로드(현 카탈로그=무쿼리).
  const jobUnlockCtx: JobUnlockContext | undefined =
    V2_CORE_LOOP_V2 && CATALOG_USES_QUEST_CONDITION
      ? { completedQuestIds: await loadCompletedQuestIds(db, userId) }
      : undefined;
  const jobsV2 =
    V2_CORE_LOOP_V2
      ? (() => {
          const prof = parseProficiencyForChar(proficiencyRow?.value, charSave);
          const specChoice =
            typeof (charSave as { specChoice?: unknown }).specChoice === "string"
              ? ((charSave as { specChoice?: string }).specChoice ?? null)
              : null;
          const level = Math.max(1, (charSave as { level?: number }).level ?? 1);
          const currentJobId = jobIdFromLegacy(cls, specChoice);
          // 현재 직업 이름은 전체 카탈로그에서 — 필터된 목록에 현재 직업이 없을 수도 있으므로
          //   (예: 미인식 class 'swordsman' → 모험가 폴백). 카탈로그 미존재면 직군 표시명 폴백.
          const currentJobName =
            V2_JOB_CATALOG[currentJobId]?.name ??
            (cls === "none" ? "모험가" : (V2_CLASS_DEFS[cls]?.name ?? "모험가"));
          // 스킬 수집 완료 판정용 — 학습한 스킬 집합(직업 도감과 동일 기준).
          const learnedSet = new Set(parseV2SkillsState(skillsRow?.value).learned);
          return {
            currentJobId,
            currentJobName,
            atLevelCap: level >= V2_LEVEL_CAP,
            jobs: V2_JOB_LIST.filter(
              (job) => job.tier > 0 && isJobUnlocked(job, prof, jobUnlockCtx),
            ).map((job) => {
              // 해금 조건(공유용 — 직업 도감과 동일 헬퍼).
              const condition = jobUnlockConditionText(job);
              // 직업 내장 보너스(현재 직업에 있을 때 적용되는 플랫 스탯) — "이 직업을 고를 이유"로
              //   전직 화면에 표기. 패시브 스킬(휴대용)과 별개.
              const bonus = V2_STAT_KEYS.filter((k) => job.jobBonus[k])
                .map((k) => `${V2_STAT_LABELS[k]} +${job.jobBonus[k]}`)
                .join(" · ");
              // 스킬 수집 완료 — 그 직업의 시그니처 스킬(액티브+패시브)을 전부 배웠는가(직업 도감과 동일).
              const signature = skillsForJob(job.id);
              const skillsCollected =
                signature.length > 0 &&
                signature.every((id) => learnedSet.has(id));
              return {
                id: job.id,
                name: job.name,
                tier: job.tier,
                condition,
                // 그 직업에 쌓은 누적 레벨(직업별/직군 — 전직 화면 표기, 해금 진행 가늠).
                cumLevel: cumLevelForJob(prof, job),
                bonus,
                skillsCollected,
              };
            }),
          };
        })()
      : null;
  // flag off 면 null — 클라는 기존 class→이름 매핑 폴백. flag on 일 때만 모험가-인지 라벨.
  // 직업 표시명 — 캐릭터 카드/전투 부제가 쓴다(jobDisplayName: 직업 시스템이면 견습 병사·방패병
  //   등, 아니면 옛 직군명). core-loop off 면 null(레거시 화면이 자체 처리).
  const classDisplaySpec =
    typeof (charSave as { specChoice?: unknown }).specChoice === "string"
      ? ((charSave as { specChoice?: string }).specChoice ?? null)
      : null;
  const classDisplayName = V2_CORE_LOOP_V2
    ? jobDisplayName(cls, classDisplaySpec)
    : null;
  // 코어루프 전투 쿨다운 — 다음 전투 가능 시각(사냥·토벌 공통). off 면 null(스태미나 게이트).
  //   쿨다운 중이면 nextBattleAt=now+남은ms, 즉시 가능(미전투/경과/미래-손상)이면 now.
  //   클라는 serverNow >= nextBattleAt 로 판정. 라우트 게이트와 동일 helper 라 표시-실제 일치.
  const cooldownRemaining = combatCooldownRemainingMs(
    Number((charSave as { lastBattleAt?: number }).lastBattleAt) || 0,
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
  // 코어루프 오프라인 사냥 — 명시 세션(offlineHuntStartedAt) 켜진 동안만 누적. 세션 창=시작+2h.
  //   offlinePending = 세션 창 안에서 lastBattleAt 이후 누적 판수(>0 이면 클라가 offline-settle).
  //   offlineHunt = 세션 상태(시작/끝 시각) — 클라 "오프라인 사냥 중·정지" 버튼/카운트다운용.
  const offlineStartedAt =
    Number((charSave as { offlineHuntStartedAt?: number }).offlineHuntStartedAt) ||
    0;
  const offlineActive = HUNT_COOLDOWN_MODE && offlineStartedAt > 0;
  const offlineEndsAt = offlineStartedAt + OFFLINE_MAX_MS;
  const offlinePending =
    !HUNT_COOLDOWN_MODE
      ? null
      : offlineActive
        ? offlineBattlesAccrued(
            Number((charSave as { lastBattleAt?: number }).lastBattleAt) || 0,
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
          // 자동 사냥이 도는 farm 깊이 — "자동 사냥 중 사냥터 바로 입장" 목적지(정산 깊이와 동일).
          depth: offlineFarmDepth(
            Number((charSave as { lastHuntDepth?: number }).lastHuntDepth),
            Number(charSave.frontierDepth) || 2,
          ),
        }
      : { active: false }
    : null;

  // 자유 타일 지도 개척 정착지 — flag on 일 때만 전부 조회(보드 ≤81칸·작음). off=빈 배열.
  //   정착지의 "길드 귀속"은 저장하지 않고 소유자(userId)→현재 길드(guild_members) 조인으로
  //   읽을 때 파생한다 → 소유자가 길드를 옮기면 자동으로 따라간다(스키마/마이그 불요).
  const freeformTileSettlements = V2_FREEFORM_TILES
    ? await (async () => {
        const rows = await db.select().from(tileSettlements);
        if (rows.length === 0) return [];
        // 소유자 → 현재 길드 일괄 조회(N+1 회피).
        const ownerIds = [...new Set(rows.map((r) => r.userId))];
        const memberRows = await db
          .select({
            userId: guildMembers.userId,
            guildId: guildMembers.guildId,
          })
          .from(guildMembers)
          .where(inArray(guildMembers.userId, ownerIds));
        const guildIdByUser = new Map(
          memberRows.map((m) => [m.userId, m.guildId]),
        );
        // 길드 id → 이름/색 일괄 조회(지도 길드색·길드홈 표시용).
        const gIds = [...new Set(memberRows.map((m) => m.guildId))];
        const guildNameById = new Map<number, string>();
        const guildColorById = new Map<number, string>();
        if (gIds.length > 0) {
          const gs = await db
            .select({ id: guilds.id, name: guilds.name, color: guilds.color })
            .from(guilds)
            .where(inArray(guilds.id, gIds));
          for (const g of gs) {
            guildNameById.set(g.id, g.name);
            if (g.color != null) guildColorById.set(g.id, g.color);
          }
        }
        return rows.map((r) => {
          const gid = guildIdByUser.get(r.userId) ?? null;
          return {
            col: r.col,
            row: r.row,
            userId: r.userId,
            tier: r.tier,
            name: r.name,
            guildId: gid,
            guildName: gid != null ? (guildNameById.get(gid) ?? null) : null,
            guildColor: gid != null ? (guildColorById.get(gid) ?? null) : null,
          };
        });
      })()
    : [];

  return Response.json({
    ok: true,
    accountName: userRow?.gameName?.trim() || null,
    intrusion,
    // 직업 시스템 v2(cumLevel 점진 공개 전직 목록) — 코어루프 off 면 null.
    jobsV2,
    // 코어루프 활성(은행/골드 모델·직업 시스템 등) — 사냥 throttle 과 독립. 클라는 이 값으로
    //   coreLoopOn 을 판정(combatCooldown 유무로 추론 금지 — 스태미나 모드면 쿨다운이 null 이라).
    coreLoopOn: V2_CORE_LOOP_V2,
    // 사냥이 스태미나 모드인가(코어루프 on + 스태미나 다이얼) — 클라가 스태미나 바/UI 표시 판정.
    huntStaminaMode: V2_CORE_LOOP_V2 && !HUNT_COOLDOWN_MODE,
    // 전투 쿨다운(사냥·토벌 게이트) — 쿨다운 모드만 객체, 스태미나 모드/off 면 null(스태미나 판정).
    combatCooldown,
    // 코어루프 오프라인 정산 대기 판수 — flag off 면 null.
    offlinePending,
    // 코어루프 오프라인 사냥 세션 상태(시작/끝 시각) — flag off 면 null.
    offlineHunt,
    character: {
      name,
      gender,
      level,
      exp,
      expToNext,
      hp: hpRegen.hp,
      maxHp,
      // v2 마법 풀 — derive 가 character.v2.mp 시드, 미지정이면 maxMp 풀충. INT 0 이면 둘 다 0.
      mp: combat?.player.mp ?? maxMp,
      maxMp,
      stamina: {
        current: stamina.current,
        max: staminaMax,
        lastUpdatedAt: stamina.lastUpdatedAt,
      },
      // 보유 스태미나 포션 수(퀘 마일스톤 보상·보관형 소비템) — StaminaBar 사용 버튼용.
      staminaPotions: staminaPotionCount(staminaPotionsRow?.value),
      gold: Math.max(0, charSave.gold ?? 0),
      // 은행 — 입금된 골드(토벌 압류에서 안전). 보유 골드(gold)와 별개.
      bankedGold: Math.max(0, (charSave as { bankedGold?: number }).bankedGold ?? 0),
      // 코어루프 위험 골드 — 마지막 패배 이후 번 골드(패배 시 절반 압류 대상). off 면 null.
      atRiskGold: V2_CORE_LOOP_V2
        ? Math.max(0, Number((charSave as { atRiskGold?: number }).atRiskGold) || 0)
        : null,
      // PR-1 전투 재설계 — 직업·속성 (캐릭터 화면 헤더 + 피커).
      class: cls,
      // 코어루프 on 이면 무직→"모험가" 표기. off 면 기존 직군명.
      classDisplayName,
      // 코어루프 직업 트리 — 현재 계파(재전직 화면 "현재" 표시용). off 면 null.
      spec: V2_CORE_LOOP_V2
        ? (typeof (charSave as { specChoice?: unknown }).specChoice === "string"
            ? ((charSave as { specChoice?: string }).specChoice ?? null)
            : null)
        : null,
      element: parseV2Element((charSave as { element?: unknown }).element),
    },
    stats,
    combat: combatStats,
    // 누적 전투 횟수(전적) — 내 정보 기본 정보 카드 표기용.
    battleCount,
    // 길드 — id/name + 내 직책(role)·마스터 여부. 정착지 관리 탭(마스터/부마스터)·기타 권한 UI 용.
    guild:
      guildId == null
        ? null
        : {
            id: guildId,
            name: guildName ?? "—",
            role: guildRow?.role ?? null,
            isMaster: guildRow?.masterId === userId,
          },
    resources,
    currentOutpost,
    // 자유 타일 지도(V2_FREEFORM_TILES) 마커 좌표. 없으면 null → 클라가 현재 거점 칸에서 파생.
    tilePos:
      charSave.tilePos &&
      typeof charSave.tilePos.col === "number" &&
      typeof charSave.tilePos.row === "number"
        ? { col: charSave.tilePos.col, row: charSave.tilePos.row }
        : null,
    // 자유 타일 지도 개척 정착지(Phase 3) — flag on 일 때만 조회(off=빈 배열·prod 무비용).
    tileSettlements: freeformTileSettlements,
    // 발견(안개) — 방문/인접으로 공개된 거점 id 목록. 없으면(신규) 시작 거점+인접 시드.
    discoveredOutpostIds:
      charSave.discoveredOutpostIds && charSave.discoveredOutpostIds.length > 0
        ? charSave.discoveredOutpostIds
        : seededDiscovery(),
    skills: parseV2SkillsState(skillsRow?.value),
    // P4 — 시그니처 직업 패시브 은퇴(전문화 패시브로 대체). 호환 위해 빈 배열 유지(P5 에서 전문화 UI 대체).
    signatures: [] as never[],
    // 학습 가능 스킬 풀 — 현 직업(jobId)의 시그니처 킷 + 학습/장착여부(학습 패널용).
    elementalSkills: (() => {
      const cls = parseV2Class((charSave as { class?: unknown }).class);
      const rawSpec = (charSave as { specChoice?: unknown }).specChoice;
      const specChoice = typeof rawSpec === "string" ? rawSpec : null;
      const prof = parseProficiencyForChar(proficiencyRow?.value, charSave);
      const group = tier1ClassOf(cls);
      const tier = prof.groups[group]?.tier ?? 1;
      // 학습 비용은 모든 스킬 고정 단가 1500(learn-skill 과 동일 산식).
      const skillsState = parseV2SkillsState(skillsRow?.value);
      const learnedSet = new Set<string>(skillsState.learned);
      const equippedSet = new Set<string>(skillsState.equipped);
      return elementalSkillsForClass(cls, specChoice, tier).map((skillId) => {
        const def = V2_SKILLS[skillId];
        return {
          skillId,
          name: def.name,
          cost: v2SkillLearnCost(skillId),
          learned: learnedSet.has(skillId),
          equipped: equippedSet.has(skillId),
        };
      });
    })(),
    // SP 로드아웃(코어루프 전용) — 수동 로드아웃 화면용. flag off 면 키 없음(응답 byte-identical).
    //   library = 배운 스킬 전부(타직업 수집분 포함) + spCost·장착여부. equipped 는
    //   reconcile 가 이미 sanitize 한 저장값.
    ...(V2_CORE_LOOP_V2
      ? {
          loadout: (() => {
            const prof = parseProficiencyForChar(proficiencyRow?.value, charSave);
            const skillsState = parseV2SkillsState(skillsRow?.value);
            const equippedSet = new Set<string>(skillsState.equipped);
            const spBudget = calcSpBudget(prof.groups);
            let spUsed = 0;
            const library = skillsState.learned
              .filter((id) => V2_SKILLS[id])
              .map((id) => {
                const def = V2_SKILLS[id];
                const equipped = equippedSet.has(id);
                if (equipped) spUsed += spCostOf(def);
                return {
                  skillId: id,
                  name: def.name,
                  spCost: spCostOf(def),
                  equipped,
                };
              });
            // 장착 순서(우선순위·갬빗 fallback) 보존 — 카탈로그 유효분만. POST /me/loadout 시 재전송용.
            const equipped = skillsState.equipped.filter((id) => V2_SKILLS[id]);
            return { spBudget, spUsed, equipped, library };
          })(),
        }
      : {}),
    // 모험의 서(재료 도감) 진척 — 3·4차 전직 게이트 + 코덱스 UI 표시용.
    codex: (() => {
      const ids = discoveredMaterialIds(charSave.materials);
      return { discovered: ids.length, total: V2_CODEX_TOTAL, discoveredIds: ids };
    })(),
    // 어보(낚시 도감) 진척 — V2CodexView 어보 탭 표시용. 종별 개인 최대어 동봉.
    fishingCodex: (() => {
      const codex = parseFishCodex(fishingCodexRow?.value);
      const ids = discoveredFishIds(codex);
      const best: Record<string, number> = {};
      for (const id of ids) best[id] = codex.fish[id].bestSize;
      return { discoveredIds: ids, total: FISH_TOTAL, best };
    })(),
    // 유물 도감 진척 — V2CodexView 유물 탭 표시용. 종별 개인 최고 보존상태 동봉.
    treasureCodex: (() => {
      const codex = parseTreasureCodex(treasureCodexRow?.value);
      const ids = discoveredAntiqueIds(codex);
      const best: Record<string, number> = {};
      for (const id of ids) best[id] = codex.antiques[id].bestCondition;
      return { discoveredIds: ids, total: ANTIQUE_TOTAL, best };
    })(),
    // 지도 조각 보유 수 — 발굴 감정소 진입 표시용.
    treasureFragments: parseTreasureFragments(treasureFragmentsRow?.value).fragments,
    // 칭호 — 모험의 서 "칭호" 탭이 보유 목록 표시 + 장착 토글에 사용. 채팅/접속자엔
    //   resolveActor 가 같은 보유 검증으로 노출(미보유 변조 차단).
    titles: { ownedTitleIds, equippedTitleId },
    // 프론티어 최고 도달 깊이 (기본 2 = 들판 초반 해금, 깊이 3까지). MAX 캡으로 정규화
    //   (레거시 무한기 >42 저장값도 현재 콘텐츠 끝으로 표시 — 클라가 캡 밖 깊이를 들고 다니지 않게).
    frontierDepth: Math.min(
      MAX_FRONTIER_DEPTH,
      Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2)),
    ),
    // 직업 숙련도(직업 마스터리) — 총/직업 + 현 직업군 사용가능. 수행·전직·표시용.
    proficiency: (() => {
      const prof = parseProficiencyForChar(proficiencyRow?.value, charSave);
      const group = tier1ClassOf(
        parseV2Class((charSave as { class?: unknown }).class),
      );
      // caps 는 유효 cap(= floor + 헤드룸 + 수행이득)으로 노출 — UI "한계" 표시용.
      const floors = computeStatFloors(prof);
      const effectiveCaps: Partial<Record<string, number>> = {};
      for (const k of V2_STAT_KEYS) {
        effectiveCaps[k] = effectiveStatCap(floors[k] ?? 0, capGain(prof, k));
      }
      return {
        groups: prof.groups,
        caps: effectiveCaps,
        current: {
          group,
          // 직군 누적 레벨 — 전직 게이트·floor 입력. UI 전직 진척 표시용.
          cumLevel: groupCumLevel(prof, group),
          // 숙달 포인트 잔액(사용가능). 옛 earned/usable 통합.
          points: groupUsable(prof, group),
          cultivations: cultivationCount(prof, group),
          nextCost: cultivationCost(totalCapGains(prof)),
          // 현 직업군 다음 차수 전직 가능 여부 — 신전 직업 그리드의 "전직 가능" 표시용.
          // 게이트 3종(Lv50·직군 누적레벨·3·4차 도감)을 advance-class 와 동일 기준으로 산출.
          advance: (() => {
            const cur = parseV2Class((charSave as { class?: unknown }).class);
            if (cur === "none") return null;
            // P4 — 전직 = class 불변, proficiency.tier +1. 다음 차수(2/3/4), 정점이면 null.
            const curTier = prof.groups[group]?.tier ?? 1;
            const nextTier = nextAdvanceTier(curTier);
            if (!nextTier) return null;
            const haveLevel = Math.max(
              1,
              (charSave as { level?: number }).level ?? 1,
            );
            const reqCum = advanceCumLevelReq(nextTier);
            const haveCum = groupCumLevel(prof, group);
            const reqCodex = codexRequirement(tierCodexMin(nextTier));
            const haveCodex = discoveredMaterialIds(
              (charSave as { materials?: unknown }).materials,
            ).length;
            return {
              nextClass: cur,
              nextName: V2_CLASS_DEFS[cur].name,
              nextTier,
              reqLevel: V2_ADVANCE_MIN_LEVEL,
              haveLevel,
              reqCum,
              haveCum,
              reqCodex,
              haveCodex,
              canAdvance:
                haveLevel >= V2_ADVANCE_MIN_LEVEL &&
                haveCum >= reqCum &&
                haveCodex >= reqCodex,
            };
          })(),
        },
      };
    })(),
  });
}
