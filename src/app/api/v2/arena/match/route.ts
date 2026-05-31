import { and, eq, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/battle/engine-pvp";
import { ARENA_STATE_KEY, CHARACTER_STATE_KEY } from "@/lib/storage-keys";
import {
  BOT_LEVEL_BAND,
  MAX_DAILY_MATCHES,
  applyDailyReset,
  applyScoreDelta,
  computeGoldReward,
  computeScoreDelta,
  parseArenaState,
  pushRecentOpponent,
  weightForCandidate,
  weightedPick,
  type ArenaCandidate,
  type ArenaMatchOutcome,
  type ArenaOpponentRef,
} from "@/lib/server/arena";
import { buildBotsAroundLevel, type ArenaBot } from "@/adventure/data/v2/arenaBots";
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
//   2. 일일 리셋 적용 (자정 KST). dailyUsed >= MAX_DAILY_MATCHES → 409.
//   3. 본인 derivePlayerCombatV2.
//   4. 후보 풀 — 본인 제외 character.v2 보유 유저 (snapshot). 각 candidate 의
//      arena-state.v2.score 와 character.v2.level 만 읽음 (derive 안 함, 저렴).
//   5. 후보 0명 → buildBotsAroundLevel 봇 풀로 폴백.
//   6. weightForCandidate 가중 랜덤 추첨.
//   7. 선정된 상대만 derive (real user) 또는 미리 derive 된 봇 사용.
//   8. resolveBattlePvP 단판. 양측 HP = maxHp, 마법 sweep 자동.
//   9. outcome → 점수 변동(0 미만 클램프), 골드 보상.
//  10. arena-state.v2(score/dailyUsed/recentOpponents) + character.v2(gold) 저장.
//
// PR-8a 범위 — UI 결과 카드 표시만. replay 페이로드/매치 히스토리 X (PR-8b/8c).

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

    const parsedArena = parseArenaState(rawArena, now);
    const { state: arenaResetApplied } = applyDailyReset(parsedArena, now);

    // 3. 일일 카운터 검사.
    if (arenaResetApplied.dailyUsed >= MAX_DAILY_MATCHES) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "daily_exhausted" as const,
          dailyResetAt: arenaResetApplied.dailyResetAt,
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
    const myScore = arenaResetApplied.score;

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
        const parsed = parseArenaState(r.value, now);
        // 후보의 dailyReset 은 매칭에 무관 — score 만 사용.
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

    // 7. 봇 풀 — 실유저 0명일 때만.
    let botPool: ArenaBot[] = [];
    if (realCandidates.length === 0) {
      botPool = buildBotsAroundLevel(myLevel, BOT_LEVEL_BAND);
    }

    // 8. 가중 추첨 — 실유저 우선, 봇은 폴백.
    const allCandidates: Array<{ kind: "user" | "bot"; cand: CandidateInternal; bot?: ArenaBot }> =
      realCandidates.length > 0
        ? realCandidates.map((c) => ({ kind: "user" as const, cand: c }))
        : botPool.map((b) => ({
            kind: "bot" as const,
            cand: { botId: b.id, name: b.name, level: b.level, score: b.score },
            bot: b,
          }));

    const weighted = allCandidates.map((entry) => ({
      item: entry,
      weight: weightForCandidate(
        myScore,
        myLevel,
        entry.cand,
        arenaResetApplied.recentOpponents,
      ),
    }));
    const picked = weightedPick(weighted, Math.random);
    if (!picked) {
      // 봇 폴백조차 0 (이론상 불가 — buildBotsAroundLevel 은 ≥ 1 보장).
      return {
        status: 500,
        body: { ok: false as const, error: "no_opponent" as const },
      };
    }

    // 9. 상대 PlayerCombat 준비.
    let oppPlayer: import("@/adventure/battle/engine").PlayerCombat;
    let oppName: string;
    let oppLevel: number;
    let oppScore: number;
    let oppRef: ArenaOpponentRef;
    let oppElement: V2Element = "neutral";
    let oppWeaponElement: V2Element = "neutral"; // PR-5b — 상대 무기 속성(평타).
    if (picked.kind === "user") {
      const opponentCombat = await derivePlayerCombatV2(picked.cand.userId!, tx);
      if (!opponentCombat) {
        // 후보 derive 실패 — 봇 폴백 한 번 시도. 못 만들면 500.
        // 단순화: 이번 호출은 실패로 반환 — 클라가 재시도하면 다음 풀에서 다시 추첨.
        return {
          status: 500,
          body: { ok: false as const, error: "opponent_derive_failed" as const },
        };
      }
      // 상대 이름 조회.
      const oppProfileRow = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, picked.cand.userId!),
            eq(savesKv.key, PROFILE_KEY),
          ),
        )
        .limit(1);
      oppName = nameOf(oppProfileRow[0]?.value, "모험가");
      oppPlayer = { ...opponentCombat.player, hp: opponentCombat.maxHp };
      oppLevel = picked.cand.level;
      oppScore = picked.cand.score;
      oppRef = { userId: picked.cand.userId, at: now.toISOString() };
      oppElement = elementByUser.get(picked.cand.userId!) ?? "neutral";
      oppWeaponElement = opponentCombat.weaponElement;
    } else {
      const bot = picked.bot!;
      oppName = bot.name;
      oppPlayer = {
        ...bot.combat.player,
        hp: bot.combat.maxHp,
      };
      oppLevel = bot.level;
      oppScore = bot.score;
      oppRef = { botId: bot.id, at: now.toISOString() };
      oppElement = bot.element;
      oppWeaponElement = bot.combat.weaponElement;
    }

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
      p: import("@/adventure/battle/engine").PlayerCombat,
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
    // 상대가 봇이면 빈 배열 (사용자 결정 — PR-5+ 에서 봇 적형 확장 검토).
    const mySkillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const mySkills = parseV2SkillsState(mySkillsRaw);
    let oppSkills = emptyV2SkillsState();
    if (picked.cand && picked.cand.userId) {
      const oppSkillsRow = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, picked.cand.userId),
            eq(savesKv.key, "skills.v2"),
          ),
        )
        .limit(1);
      oppSkills = parseV2SkillsState(oppSkillsRow[0]?.value);
    }

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

    // 12. 상태 저장.
    const nextArena = {
      ...arenaResetApplied,
      score: newScore,
      dailyUsed: arenaResetApplied.dailyUsed + 1,
      recentOpponents: pushRecentOpponent(arenaResetApplied.recentOpponents, oppRef),
    };
    await upsertSave(tx, userId, ARENA_STATE_KEY, nextArena);

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
          isBot: picked.kind === "bot",
          element: oppElement,
        },
        dailyRemaining: Math.max(
          0,
          MAX_DAILY_MATCHES - nextArena.dailyUsed,
        ),
        dailyResetAt: nextArena.dailyResetAt,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
