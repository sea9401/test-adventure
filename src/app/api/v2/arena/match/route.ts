import { and, eq, ne, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, pvpRatings } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  derivePlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import {
  codexSpBonusFromRaw,
  readCodexSpBonus,
} from "@/lib/server/codexSpBonus";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import {
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  buildBotsAroundLevel,
  type ArenaBot,
} from "@/adventure/data/v2/arenaBots";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import {
  toPvpReplayPayload,
  toPvpReplayPayloadForSide,
} from "@/adventure/data/v2/replayPayload";
import {
  ARENA_STATE_KEY,
  ARENA_HISTORY_KEY,
  ARENA_LOADOUTS_KEY,
  CHARACTER_STATE_KEY,
} from "@/lib/storage-keys";
import {
  loadoutEquipmentForApply,
  loadoutSkillsForApply,
  parseActiveArenaLoadout,
  type ArenaLoadout,
} from "@/adventure/data/v2/arenaLoadout";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  ARENA_INITIAL_RATING,
  ARENA_MATCH_COOLDOWN_MS,
  arenaCooldownRemainingMs,
  computeGoldReward,
  defaultArenaState,
  oppositeArenaOutcome,
  parseArenaHistory,
  parseArenaState,
  pushArenaHistory,
  pushRecentOpponent,
  settleArenaElo,
  weightForCandidate,
  weightedPick,
  type ArenaCandidate,
  type ArenaHistoryEntry,
  type ArenaMatchOutcome,
  type ArenaOpponentRef,
} from "@/lib/server/arena";
import {
  elementDamageMult,
  elementMatchup,
  parseV2Element,
  V2_ELEMENT_ADV_PCT_PVP,
  V2_ELEMENT_DIS_PCT_PVP,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/arena/match — 아레나 1:1 매치 한 판 실행.
//
// 서버 권위:
//   1. 본인 character.v2 + arena-state.v2 lock (read-modify-write 안전).
//   2. 재도전 쿨타임 검사. lastMatchAt + ARENA_MATCH_COOLDOWN_MS 전이면 429 (cooldown).
//   3. 본인 derivePlayerCombatV2.
//   4. 후보 풀 — 본인 제외 character.v2 보유 유저 (snapshot). 각 candidate 의
//      Elo score(미존재면 1000) 와 character.v2.level 만 읽음 (derive 안 함, 저렴).
//   5. 실유저 우선 매칭 — 후보가 없거나 상대 derive 실패 시 비랭크 봇으로 폴백.
//   6. weightForCandidate 가중 랜덤 추첨.
//   7. 선정된 상대만 derive (real user snapshot) 또는 봇 snapshot 사용.
//   8. resolveBattlePvP 단판. 양측 HP = maxHp, 마법 sweep 자동.
//   9. outcome → 실유저전은 양쪽 Elo 정산(K=32), 봇전은 비랭크.
//  10. 공격자/방어자 arena-state.v2(score/recentOpponents) + 공격자 gold 저장.
//  11. 양쪽 전투 로그(각자 관점 ReplayPayload) + 전투 기록(arena-history.v2, 최근순 ≤ MAX).

type CharSaveShape = {
  level?: number;
  gold?: number;
  [k: string]: unknown;
};

type ProfileShape = {
  name?: string;
};

type CandidateInternal = ArenaCandidate;

const PROFILE_KEY = "character-profile.v2";
const ARENA_BOT_LEVEL_BAND = 5;
// 전투 로그 다시보기 — 저장/표시 로그 길이 상한(PvP 100턴 ≈ 300+ 엔트리 → cap 으로 바운드,
// 초과 시 clampReplayLog 가 "앞선 턴 생략" 안내 + 뒷부분만). 기록 MAX(10)판 × 이 cap 이 세이브 크기.
const ARENA_REPLAY_LOG_CAP = 150;

type BotPick = {
  candidate: CandidateInternal;
  bot: ArenaBot;
};

function equipmentSaveForArena(
  equipmentRaw: unknown,
  loadout: ArenaLoadout | null,
): unknown {
  if (!loadout) return equipmentRaw;
  const { owned } = parseEquipmentSave(equipmentRaw);
  const ownedIids = new Set(owned.map((item) => item.iid));
  return {
    owned,
    equipped: loadoutEquipmentForApply(loadout, ownedIids),
  };
}

function skillsStateForArena(
  skillsRaw: unknown,
  loadout: ArenaLoadout | null,
): V2SkillsState {
  const skills = parseV2SkillsState(skillsRaw);
  if (!loadout) return skills;
  return {
    ...skills,
    equipped: loadoutSkillsForApply(loadout, skills.learned),
    pattern: loadout.pattern ?? undefined,
  };
}

function nameOf(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const v = value as ProfileShape;
  return typeof v.name === "string" && v.name.trim().length > 0
    ? v.name.trim()
    : fallback;
}

function levelOf(value: unknown): number {
  if (!value || typeof value !== "object") return 1;
  const v = value as CharSaveShape;
  return Math.max(
    1,
    typeof v.level === "number" && Number.isFinite(v.level)
      ? Math.floor(v.level)
      : 1,
  );
}

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // 1. 본인 character.v2 lock — 같은 유저의 동시 매치 요청을 직렬화한다.
    //    arena-state 는 상대가 확정된 뒤 양쪽 userId 정렬 순서로 잠근다. 그래야 A→B 와
    //    B→A 동시 매치에서 서로 반대 순서로 arena row 를 잡는 데드락을 피할 수 있다.
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      CHARACTER_STATE_KEY,
      {},
    );
    const rawArena = await readSave<unknown>(
      tx,
      userId,
      ARENA_STATE_KEY,
      null,
    );

    // 2. 본인 character 없으면 아레나 진입 불가 (캐릭 미생성).
    if (!charSave || typeof charSave !== "object" || charSave.level === undefined) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    const parsedArena = parseArenaState(rawArena);

    // 3. 재도전 쿨타임 검사 — 일일 제한 폐지, 매치 간 ARENA_MATCH_COOLDOWN_MS 쿨타임.
    const cooldownMs = arenaCooldownRemainingMs(parsedArena, now);
    if (cooldownMs > 0) {
      return {
        status: 429,
        body: {
          ok: false as const,
          error: "cooldown" as const,
          cooldownMs,
        },
      };
    }

    const viewerArenaLoadout = parseActiveArenaLoadout(
      await readSave(tx, userId, ARENA_LOADOUTS_KEY, []),
    );
    const myEquipmentRaw = await readSave<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const mySkillsBaseRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const myProfRaw = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    let mySkills = skillsStateForArena(mySkillsBaseRaw, viewerArenaLoadout);
    if (V2_CORE_LOOP_V2) {
      mySkills = sanitizeCombatLoadout(
        mySkills,
        charSave,
        myProfRaw,
        (await readCodexSpBonus(tx, userId)).total,
      );
    }

    // 4. 본인 derive. 아레나 템플릿이 있으면 장비/스킬/패턴은 템플릿을 사용하고, 직업/스탯/레벨은 현재값.
    const viewerCombat = await derivePlayerCombatV2(userId, tx, {
      character: charSave,
      equipmentSave: equipmentSaveForArena(myEquipmentRaw, viewerArenaLoadout),
      proficiencyRaw: myProfRaw,
      skillsRaw: mySkills,
    });
    if (!viewerCombat) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }
    const myLevel = levelOf(charSave);
    const myScore = parsedArena.score;

    // 5. 본인 프로필 이름 — 전투 로그·결과 카드용.
    const viewerProfileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, PROFILE_KEY)))
      .limit(1);
    const viewerName = nameOf(viewerProfileRow[0]?.value, "모험가");

    // 6. 후보 풀 — 본인 제외 character.v2 보유 유저들 (snapshot).
    const candidateChars = await tx
      .select({ userId: savesKv.userId, value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.key, CHARACTER_STATE_KEY),
          ne(savesKv.userId, userId),
        ),
      );
    const candidateIds = candidateChars.map((r) => r.userId);
    // PR-5 — 상대(실유저) 속성 맵. character.v2.value 에서 element 추출 (상성 적용용).
    const elementByUser = new Map<string, V2Element>(
      candidateChars.map((r) => [
        r.userId,
        parseV2Element((r.value as { element?: unknown }).element),
      ]),
    );
    // 본인 속성.
    const viewerElement =
      viewerArenaLoadout?.element ??
      parseV2Element((charSave as { element?: unknown }).element);

    // 6a. Elo 점수 (arena-state.v2) 일괄 조회. 미존재면 초기 레이팅.
    const scoreByUser = new Map<string, number>();
    if (candidateIds.length > 0) {
      const arenaRows = await tx
        .select({ userId: savesKv.userId, value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.key, ARENA_STATE_KEY),
            inArray(savesKv.userId, candidateIds),
          ),
        );
      for (const r of arenaRows) {
        const parsed = parseArenaState(r.value);
        // 후보는 score 만 사용(쿨타임/매칭 무관).
        scoreByUser.set(r.userId, parsed.score);
      }
    }

    // 6b. 이름 (character-profile.v2) — 추첨 후 한 명만 사용하므로 일괄 조회는
    //    선택지. 추첨 직후 단건 조회로 충분 — 풀 크면 일괄 조회가 더 무거움.

    const realCandidates: CandidateInternal[] = candidateChars.map((r) => ({
      userId: r.userId,
      name: "모험가", // 추첨 후 갱신
      level: levelOf(r.value),
      score: scoreByUser.get(r.userId) ?? ARENA_INITIAL_RATING,
    }));

    const pickBot = (): BotPick | null => {
      const bots = buildBotsAroundLevel(myLevel, ARENA_BOT_LEVEL_BAND);
      const weightedBots = bots.map((bot) => {
        const candidate: CandidateInternal = {
          botId: bot.id,
          name: bot.name,
          level: bot.level,
          score: bot.score,
        };
        return {
          item: { candidate, bot },
          weight: weightForCandidate(
            myScore,
            myLevel,
            candidate,
            parsedArena.recentOpponents,
          ),
        };
      });
      return weightedPick(weightedBots, Math.random);
    };

    // 7. 가중 추첨 — 실유저 풀을 우선한다. 후보가 없으면 비랭크 봇 폴백으로 새 서버/저인구
    //    상황에서도 아레나가 실제로 진행된다. 봇도 recentOpponents 페널티를 받아 같은 봇 반복을 줄인다.
    const weighted = realCandidates.map((cand) => ({
      item: cand,
      weight: weightForCandidate(
        myScore,
        myLevel,
        cand,
        parsedArena.recentOpponents,
      ),
    }));
    let picked = weightedPick(weighted, Math.random);
    let pickedBot: ArenaBot | null = null;
    if (!picked) {
      const botPick = pickBot();
      picked = botPick?.candidate ?? null;
      pickedBot = botPick?.bot ?? null;
    }
    if (!picked) {
      // buildBotsAroundLevel 은 항상 후보를 만들지만, 방어적으로 no_opponent 유지.
      return {
        status: 200,
        body: { ok: false as const, error: "no_opponent" as const },
      };
    }

    // 8. 상대 PlayerCombat 준비. 실유저 derive 실패(상대 세이브 손상 등)도 봇으로 폴백해
    //    호출자 입장에서는 아레나가 끊기지 않게 한다.
    const pickedUserId = picked.userId;
    let opponentCombat = pickedBot != null ? pickedBot.combat : null;
    let oppSkills: V2SkillsState = emptyV2SkillsState();
    let oppLoadoutElement: V2Element | undefined;
    if (!opponentCombat && pickedUserId) {
      const oppRows = await tx
        .select({ key: savesKv.key, value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, pickedUserId),
            inArray(savesKv.key, [
              CHARACTER_STATE_KEY,
              "equipment.v2",
              "skills.v2",
              "proficiency.v2",
              "fishing-codex.v1",
              "treasure-codex.v1",
              ARENA_LOADOUTS_KEY,
            ]),
          ),
        );
      const oppRow = (k: string) => oppRows.find((r) => r.key === k)?.value;
      const oppLoadout = parseActiveArenaLoadout(oppRow(ARENA_LOADOUTS_KEY));
      const oppCharSave =
        (oppRow(CHARACTER_STATE_KEY) as SavedCharacterV2 | undefined) ??
        (candidateChars.find((r) => r.userId === pickedUserId)?.value as
          | SavedCharacterV2
          | undefined);
      oppLoadoutElement = oppLoadout?.element;
      oppSkills = skillsStateForArena(oppRow("skills.v2"), oppLoadout);
      if (V2_CORE_LOOP_V2) {
        oppSkills = sanitizeCombatLoadout(
          oppSkills,
          oppCharSave ?? {},
          oppRow("proficiency.v2"),
          codexSpBonusFromRaw(
            oppRow("fishing-codex.v1"),
            oppRow("treasure-codex.v1"),
          ).total,
        );
      }
      opponentCombat = await derivePlayerCombatV2(pickedUserId, tx, {
        character: oppCharSave,
        equipmentSave: equipmentSaveForArena(oppRow("equipment.v2"), oppLoadout),
        proficiencyRaw: oppRow("proficiency.v2"),
        skillsRaw: oppSkills,
      });
    }
    if (!opponentCombat) {
      const botPick = pickBot();
      picked = botPick?.candidate ?? null;
      pickedBot = botPick?.bot ?? null;
      opponentCombat = botPick?.bot.combat ?? null;
      oppSkills = emptyV2SkillsState();
      oppLoadoutElement = undefined;
    }
    if (!picked || !opponentCombat) {
      return {
        status: 200,
        body: { ok: false as const, error: "no_opponent" as const },
      };
    }

    const oppUserId = picked.userId;
    const oppBotId = picked.botId;
    // 상대 이름 조회. 봇은 템플릿 이름 그대로 사용한다.
    const oppName = oppUserId
      ? nameOf(
          (
            await tx
              .select({ value: savesKv.value })
              .from(savesKv)
              .where(and(eq(savesKv.userId, oppUserId), eq(savesKv.key, PROFILE_KEY)))
              .limit(1)
          )[0]?.value,
          "모험가",
        )
      : picked.name;
    let oppPlayer: import("@/adventure/v2/combat/engine").PlayerCombat = {
      ...opponentCombat.player,
      hp: opponentCombat.maxHp,
    };
    const oppLevel = picked.level;
    const oppScore = picked.score;
    const oppRef: ArenaOpponentRef = oppUserId
      ? { userId: oppUserId, at: now.toISOString() }
      : { botId: oppBotId, at: now.toISOString() };
    const oppElement: V2Element =
      pickedBot?.element ??
      oppLoadoutElement ??
      (oppUserId ? elementByUser.get(oppUserId) : undefined) ??
      "neutral";
    const oppWeaponElement: V2Element = opponentCombat.weaponElement; // PR-5b — 상대 무기 속성(평타).

    // 본인 HP 도 풀충전 — 단판 모델.
    // PR-5/5b — 속성 상성. 평타 속성 = 무기 ?? 캐릭(공격), 방어 = 캐릭. atk 에 평타속성 baked +
    // attackElement/characterElement 실어 combatShared 가 스킬 속성 보정에 사용(hunt 와 동일).
    const viewerAttackElement: V2Element =
      viewerCombat.weaponElement !== "neutral"
        ? viewerCombat.weaponElement
        : viewerElement;
    const oppAttackElement: V2Element =
      oppWeaponElement !== "neutral" ? oppWeaponElement : oppElement;
    const withElemMult = (
      p: import("@/adventure/v2/combat/engine").PlayerCombat,
      mult: number,
      attackElement: V2Element,
      characterElement: V2Element,
    ) => ({
      ...p,
      atk: Math.max(1, Math.round(p.atk * mult)),
      magicAtk: Math.max(0, Math.round((p.magicAtk ?? 0) * mult)),
      attackElement,
      characterElement,
    });
    // PvP 는 별도 계수(±15, 양방향) — PvE 약점찌르기(25/0)와 분리(속성이 장비/스탯 압도 방지).
    const myElemMult = elementDamageMult(
      viewerAttackElement,
      oppElement,
      V2_ELEMENT_ADV_PCT_PVP,
      V2_ELEMENT_DIS_PCT_PVP,
    );
    const oppElemMult = elementDamageMult(
      oppAttackElement,
      viewerElement,
      V2_ELEMENT_ADV_PCT_PVP,
      V2_ELEMENT_DIS_PCT_PVP,
    );
    const myPlayer = withElemMult(
      { ...viewerCombat.player, hp: viewerCombat.maxHp },
      myElemMult,
      viewerAttackElement,
      viewerElement,
    );
    oppPlayer = withElemMult(
      oppPlayer,
      oppElemMult,
      oppAttackElement,
      oppElement,
    );

    // 10. 배틀 sim — resolveBattlePvP.
    const battle = resolveBattlePvP(myPlayer, oppPlayer, viewerName, oppName, {
      ...autoDuelContext(),
      v2Skills: { p1: mySkills, p2: oppSkills },
    });

    // 11. outcome 변환.
    const outcome: ArenaMatchOutcome =
      battle.outcome === "p1_win"
        ? "win"
        : battle.outcome === "p2_win"
          ? "loss"
          : "draw";

    const ranked = oppUserId != null;
    const ensureSaveRowsForSettlement = async (
      ids: string[],
      key: string,
      value: unknown,
    ) => {
      const uniqueIds = [...new Set(ids)].sort();
      if (uniqueIds.length === 0) return uniqueIds;
      const insertedAt = new Date();
      await tx
        .insert(savesKv)
        .values(
          uniqueIds.map((id) => ({
            userId: id,
            key,
            value,
            version: 1,
            updatedAt: insertedAt,
          })),
        )
        .onConflictDoNothing({ target: [savesKv.userId, savesKv.key] });
      return uniqueIds;
    };
    const lockArenaStatesForSettlement = async (ids: string[]) => {
      const out = new Map<string, ReturnType<typeof parseArenaState>>();
      const lockIds = await ensureSaveRowsForSettlement(
        ids,
        ARENA_STATE_KEY,
        defaultArenaState(),
      );
      for (const id of lockIds) {
        out.set(
          id,
          parseArenaState(
            await lockSaveForUpdate<unknown>(tx, id, ARENA_STATE_KEY, null),
          ),
        );
      }
      return out;
    };
    const lockArenaHistoriesForSettlement = async (ids: string[]) => {
      const out = new Map<string, ArenaHistoryEntry[]>();
      const lockIds = await ensureSaveRowsForSettlement(
        ids,
        ARENA_HISTORY_KEY,
        [],
      );
      for (const id of lockIds) {
        out.set(
          id,
          parseArenaHistory(
            await lockSaveForUpdate<unknown>(tx, id, ARENA_HISTORY_KEY, []),
          ),
        );
      }
      return out;
    };

    const settlementUserIds =
      ranked && oppUserId ? [userId, oppUserId] : [userId];
    const lockedArenaStates =
      await lockArenaStatesForSettlement(settlementUserIds);
    const attackerArena =
      lockedArenaStates.get(userId) ?? parseArenaState(parsedArena);
    const defenderArena =
      ranked && oppUserId
        ? (lockedArenaStates?.get(oppUserId) ?? defaultArenaState())
        : null;
    const elo = defenderArena
      ? settleArenaElo(attackerArena.score, defenderArena.score, outcome)
      : {
          attackerScoreBefore: attackerArena.score,
          attackerScoreAfter: attackerArena.score,
          attackerDelta: 0,
          defenderScoreBefore: oppScore,
          defenderScoreAfter: oppScore,
          defenderDelta: 0,
        };
    const scoreDelta = elo.attackerDelta;
    const newScore = elo.attackerScoreAfter;
    const goldGain = computeGoldReward(myLevel, outcome);

    // 11b. 전투 로그(다시보기) — 나=p1 관점 ReplayPayload + 전투 기록 1판.
    const replay = toPvpReplayPayload(battle.finalState, oppName, ARENA_REPLAY_LOG_CAP);
    const historyEntry: ArenaHistoryEntry = {
      id: `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      at: now.toISOString(),
      outcome,
      opponent: { name: oppName, level: oppLevel, userId: oppUserId, botId: oppBotId },
      scoreBefore: elo.attackerScoreBefore,
      scoreAfter: newScore,
      scoreDelta,
      goldGained: goldGain,
      turns: battle.turns,
      replay,
    };
    const defenderHistoryEntry: ArenaHistoryEntry | null =
      ranked && oppUserId && defenderArena
        ? {
            id: `${now.getTime().toString(36)}-${Math.floor(
              Math.random() * 1e6,
            ).toString(36)}`,
            at: now.toISOString(),
            outcome: oppositeArenaOutcome(outcome),
            opponent: { name: viewerName, level: myLevel, userId },
            scoreBefore: elo.defenderScoreBefore,
            scoreAfter: elo.defenderScoreAfter,
            scoreDelta: elo.defenderDelta,
            goldGained: 0,
            turns: battle.turns,
            replay: toPvpReplayPayloadForSide(
              battle.finalState,
              "p2",
              viewerName,
              ARENA_REPLAY_LOG_CAP,
            ),
          }
        : null;

    // 12. 상태 저장.
    const nextArena = {
      ...attackerArena,
      score: newScore,
      lastMatchAt: now.toISOString(),
      recentOpponents: pushRecentOpponent(attackerArena.recentOpponents, oppRef),
    };
    await upsertSave(tx, userId, ARENA_STATE_KEY, nextArena);
    if (ranked && oppUserId && defenderArena) {
      await upsertSave(tx, oppUserId, ARENA_STATE_KEY, {
        ...defenderArena,
        score: elo.defenderScoreAfter,
        recentOpponents: pushRecentOpponent(defenderArena.recentOpponents, {
          userId,
          at: now.toISOString(),
        }),
      });
    }

    // 전투 기록 — 최근순 ≤ MAX 저장(리플레이 포함). character.v2 를 먼저 락했으므로 같은 유저
    //   동시 매치는 직렬화 → read-modify-write 안전(lockSaveForUpdate 로 일관 유지).
    const lockedHistories = await lockArenaHistoriesForSettlement(
      ranked && oppUserId ? [userId, oppUserId] : [userId],
    );
    const nextHistory = pushArenaHistory(
      lockedHistories.get(userId) ?? [],
      historyEntry,
    );
    await upsertSave(tx, userId, ARENA_HISTORY_KEY, nextHistory);
    if (defenderHistoryEntry && oppUserId) {
      await upsertSave(
        tx,
        oppUserId,
        ARENA_HISTORY_KEY,
        pushArenaHistory(
          lockedHistories.get(oppUserId) ?? [],
          defenderHistoryEntry,
        ),
      );
    }

    const nextChar = {
      ...charSave,
      gold: Math.max(0, (charSave.gold ?? 0) + goldGain),
    };
    await upsertSave(tx, userId, CHARACTER_STATE_KEY, nextChar);

    return {
      status: 200,
      body: {
        ok: true as const,
        outcome,
        turns: battle.turns,
        scoreBefore: elo.attackerScoreBefore,
        scoreAfter: newScore,
        scoreDelta,
        goldGained: goldGain,
        // PR-5 — 속성 상성 (클라가 유리/불리 표기). hunt 결과와 동일 형태.
        playerElement: viewerAttackElement,
        elementMatchup: elementMatchup(viewerAttackElement, oppElement),
        opponent: {
          name: oppName,
          level: oppLevel,
          score: elo.defenderScoreBefore,
          element: oppElement,
          userId: oppUserId,
          botId: oppBotId,
        },
        ranked,
        opponentScoreBefore: elo.defenderScoreBefore,
        opponentScoreAfter: elo.defenderScoreAfter,
        opponentScoreDelta: elo.defenderDelta,
        // 전투 로그 다시보기 + 전투 기록 1판(클라가 즉시 replay 표시 + 기록 목록 prepend).
        historyEntry,
        // 재도전 쿨타임(ms) — 클라가 버튼 카운트다운 시작에 사용.
        cooldownMs: ARENA_MATCH_COOLDOWN_MS,
      },
    };
  });

  // 주간 시즌 순위 적립 — 매치 tx 밖 best-effort(실패해도 매치엔 영향 없음). 이번 주 시즌
  //   pvp_ratings 에 양쪽 점수 변동/전적을 누적해 주간 순위를 만든다(매주 새 seasonId = 리셋).
  //   기존 pvp 시즌 보상 인프라(pvp-season-rewards 크론·티어·우편·투기장 코인)를 그대로 활용 —
  //   v2 아레나가 점수를 arena-state 에만 쓰던 탓에 비어 있던 pvp_ratings 를 채워 부활시킨다.
  //   ⚠️ tx 안에 두면 적립 실패 시 매치가 통째 롤백되므로(PG: tx 내 에러=전체 abort) 밖에서 처리.
  if (result.body.ok && result.body.ranked && result.body.opponent.userId) {
    try {
      const { scoreDelta, outcome, opponentScoreDelta } = result.body;
      const defenderUserId = result.body.opponent.userId;
      const defenderOutcome = oppositeArenaOutcome(outcome);
      // 정산 시각은 fresh now — 매치가 주 경계(일 15:00 UTC)를 넘나들어도 적립 시점의
      //   "현재(열린) 시즌" 에 정확히 귀속(닫힌/보상완료 시즌에 쓰지 않음).
      const settleNow = new Date();
      const season = await getOrCreateCurrentSeason(settleNow);
      const ratingRows = [
        { userId, delta: scoreDelta, outcome },
        {
          userId: defenderUserId,
          delta: opponentScoreDelta,
          outcome: defenderOutcome,
        },
      ];
      await db.transaction(async (tx) => {
        for (const row of ratingRows) {
          const w = row.outcome === "win" ? 1 : 0;
          const l = row.outcome === "loss" ? 1 : 0;
          const d = row.outcome === "draw" ? 1 : 0;
          await tx
            .insert(pvpRatings)
            .values({
              userId: row.userId,
              seasonId: season.id,
              rating: ARENA_INITIAL_RATING + row.delta,
              wins: w,
              losses: l,
              draws: d,
            })
            .onConflictDoUpdate({
              target: [pvpRatings.userId, pvpRatings.seasonId],
              set: {
                rating: sql`${pvpRatings.rating} + ${row.delta}`,
                wins: sql`${pvpRatings.wins} + ${w}`,
                losses: sql`${pvpRatings.losses} + ${l}`,
                draws: sql`${pvpRatings.draws} + ${d}`,
                updatedAt: settleNow,
              },
            });
        }
      });
    } catch (e) {
      console.error("[arena] 주간 시즌 레이팅 적립 실패", e);
    }
  }

  return Response.json(result.body, { status: result.status });
}
