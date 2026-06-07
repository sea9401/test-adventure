import { and, eq, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { toPvpReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  ARENA_STATE_KEY,
  ARENA_HISTORY_KEY,
  CHARACTER_STATE_KEY,
} from "@/lib/storage-keys";
import {
  ARENA_MATCH_COOLDOWN_MS,
  arenaCooldownRemainingMs,
  applyScoreDelta,
  computeGoldReward,
  computeScoreDelta,
  parseArenaHistory,
  parseArenaState,
  pushArenaHistory,
  pushRecentOpponent,
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
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/arena/match — 아레나 1:1 매치 한 판 실행.
//
// 서버 권위:
//   1. 본인 character.v2 + arena-state.v2 lock (read-modify-write 안전).
//   2. 재도전 쿨타임 검사. lastMatchAt + ARENA_MATCH_COOLDOWN_MS 전이면 429 (cooldown).
//   3. 본인 derivePlayerCombatV2.
//   4. 후보 풀 — 본인 제외 character.v2 보유 유저 (snapshot). 각 candidate 의
//      arena-state.v2.score 와 character.v2.level 만 읽음 (derive 안 함, 저렴).
//   5. 유저 전용 — 후보 0명이면 no_opponent 반환(봇 폴백 폐지, 매치 미소모).
//   6. weightForCandidate 가중 랜덤 추첨.
//   7. 선정된 상대만 derive (real user snapshot).
//   8. resolveBattlePvP 단판. 양측 HP = maxHp, 마법 sweep 자동.
//   9. outcome → 점수 변동(0 미만 클램프), 골드 보상.
//  10. arena-state.v2(score/lastMatchAt/recentOpponents) + character.v2(gold) 저장.
//  11. 전투 로그(나=p1 관점 ReplayPayload) + 전투 기록(arena-history.v2, 최근순 ≤ MAX, 다시보기).

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
// 전투 로그 다시보기 — 저장/표시 로그 길이 상한(PvP 100턴 ≈ 300+ 엔트리 → cap 으로 바운드,
// 초과 시 clampReplayLog 가 "앞선 턴 생략" 안내 + 뒷부분만). 기록 MAX(10)판 × 이 cap 이 세이브 크기.
const ARENA_REPLAY_LOG_CAP = 150;

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
    // 1. 본인 character.v2 + arena-state.v2 lock — 같은 유저라 데드락 안전.
    //    arena 키부터 잠그면 character 와 다른 곳에서의 lock 순서와 충돌 없음
    //    (현 코드에 arena lock 다른 경로 없음).
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      CHARACTER_STATE_KEY,
      {},
    );
    const rawArena = await lockSaveForUpdate<unknown>(
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

    // 4. 본인 derive.
    const viewerCombat = await derivePlayerCombatV2(userId, tx);
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
    const viewerElement = parseV2Element(
      (charSave as { element?: unknown }).element,
    );

    // 6a. 점수 (arena-state.v2) 일괄 조회. 미존재면 0.
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
      score: scoreByUser.get(r.userId) ?? 0,
    }));

    // 7. 유저 전용 매칭 — 실유저만 상대(봇 폴백 폐지). 상대할 다른 모험가가 없으면 매치 불가.
    //    상태 변경(매치 카운트 차감) 전이라 매치를 소모하지 않는다. 클라가 친화적 안내 표시.
    if (realCandidates.length === 0) {
      return {
        status: 200,
        body: { ok: false as const, error: "no_opponent" as const },
      };
    }

    // 8. 가중 추첨 — 실유저 풀에서 점수/레벨 근접 + recentOpponents 페널티 가중.
    const weighted = realCandidates.map((cand) => ({
      item: cand,
      weight: weightForCandidate(
        myScore,
        myLevel,
        cand,
        parsedArena.recentOpponents,
      ),
    }));
    const picked = weightedPick(weighted, Math.random);
    if (!picked) {
      // realCandidates ≥ 1 이면 weightForCandidate 가 floor(>0)라 항상 추첨됨 — 방어적.
      return {
        status: 200,
        body: { ok: false as const, error: "no_opponent" as const },
      };
    }

    // 9. 상대 PlayerCombat 준비 (실유저 snapshot — 봇 없음).
    const oppUserId = picked.userId!;
    const opponentCombat = await derivePlayerCombatV2(oppUserId, tx);
    if (!opponentCombat) {
      // 후보 derive 실패(상대 캐릭 손상 등) — 이번 호출은 실패 반환, 클라 재시도 시 재추첨.
      return {
        status: 500,
        body: { ok: false as const, error: "opponent_derive_failed" as const },
      };
    }
    // 상대 이름 조회.
    const oppProfileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, oppUserId), eq(savesKv.key, PROFILE_KEY)))
      .limit(1);
    const oppName = nameOf(oppProfileRow[0]?.value, "모험가");
    let oppPlayer: import("@/adventure/v2/combat/engine").PlayerCombat = {
      ...opponentCombat.player,
      hp: opponentCombat.maxHp,
    };
    const oppLevel = picked.level;
    const oppScore = picked.score;
    const oppRef: ArenaOpponentRef = { userId: oppUserId, at: now.toISOString() };
    const oppElement: V2Element = elementByUser.get(oppUserId) ?? "neutral";
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
    const myElemMult = elementDamageMult(viewerAttackElement, oppElement);
    const oppElemMult = elementDamageMult(oppAttackElement, viewerElement);
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

    // PR-4b — 양측 v2 스킬 wiring. 본인은 lock, 상대는 plain read (다른 user row lock = deadlock 위험).
    const mySkillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const mySkills = parseV2SkillsState(mySkillsRaw);
    const oppSkillsRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, oppUserId), eq(savesKv.key, "skills.v2")))
      .limit(1);
    const oppSkills = parseV2SkillsState(oppSkillsRow[0]?.value);

    // 10. 배틀 sim — resolveBattlePvP.
    const battle = resolveBattlePvP(myPlayer, oppPlayer, viewerName, oppName, {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      v2Skills: { p1: mySkills, p2: oppSkills },
    });

    // 11. outcome 변환.
    const outcome: ArenaMatchOutcome =
      battle.outcome === "p1_win"
        ? "win"
        : battle.outcome === "p2_win"
          ? "loss"
          : "draw";

    const scoreDelta = computeScoreDelta(myScore, oppScore, outcome);
    const newScore = applyScoreDelta(myScore, scoreDelta);
    const goldGain = computeGoldReward(myLevel, outcome);

    // 11b. 전투 로그(다시보기) — 나=p1 관점 ReplayPayload + 전투 기록 1판.
    const replay = toPvpReplayPayload(battle.finalState, oppName, ARENA_REPLAY_LOG_CAP);
    const historyEntry: ArenaHistoryEntry = {
      id: `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      at: now.toISOString(),
      outcome,
      opponent: { name: oppName, level: oppLevel, userId: oppUserId },
      scoreBefore: myScore,
      scoreAfter: newScore,
      scoreDelta,
      goldGained: goldGain,
      turns: battle.turns,
      replay,
    };

    // 12. 상태 저장.
    const nextArena = {
      ...parsedArena,
      score: newScore,
      lastMatchAt: now.toISOString(),
      recentOpponents: pushRecentOpponent(parsedArena.recentOpponents, oppRef),
    };
    await upsertSave(tx, userId, ARENA_STATE_KEY, nextArena);

    // 전투 기록 — 최근순 ≤ MAX 저장(리플레이 포함). character.v2 를 먼저 락했으므로 같은 유저
    //   동시 매치는 직렬화 → read-modify-write 안전(lockSaveForUpdate 로 일관 유지).
    const rawHistory = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      ARENA_HISTORY_KEY,
      [],
    );
    const nextHistory = pushArenaHistory(parseArenaHistory(rawHistory), historyEntry);
    await upsertSave(tx, userId, ARENA_HISTORY_KEY, nextHistory);

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
        scoreBefore: myScore,
        scoreAfter: newScore,
        scoreDelta,
        goldGained: goldGain,
        // PR-5 — 속성 상성 (클라가 유리/불리 표기). hunt 결과와 동일 형태.
        playerElement: viewerAttackElement,
        elementMatchup: elementMatchup(viewerAttackElement, oppElement),
        opponent: {
          name: oppName,
          level: oppLevel,
          score: oppScore,
          element: oppElement,
          userId: oppUserId,
        },
        // 전투 로그 다시보기 + 전투 기록 1판(클라가 즉시 replay 표시 + 기록 목록 prepend).
        historyEntry,
        // 재도전 쿨타임(ms) — 클라가 버튼 카운트다운 시작에 사용.
        cooldownMs: ARENA_MATCH_COOLDOWN_MS,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
