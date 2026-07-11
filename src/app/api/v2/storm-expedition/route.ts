import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_ROUTES,
  STORM_EXPEDITION_SAVE_KEY,
  STORM_EXPEDITION_STAGE_COUNT,
  STORM_EXPEDITION_UNLOCK_DEPTH,
  parseStormExpeditionState,
  stormExpeditionDateKey,
  stormExpeditionEnemy,
  stormExpeditionRoute,
  stormExpeditionStageReward,
} from "@/adventure/data/v2/stormExpedition";

type CharacterSave = Record<string, unknown> & {
  frontierDepth?: number;
  gold?: number;
};

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [charSave, raw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave<unknown>(db, userId, STORM_EXPEDITION_SAVE_KEY, {}),
  ]);
  return Response.json(statusBody(charSave, raw));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:storm-expedition",
    userLimit: 60,
    ipLimit: 400,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const input = (await req.json().catch(() => null)) as {
    action?: unknown;
    routeId?: unknown;
  } | null;

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const raw = await lockSaveForUpdate<unknown>(tx, userId, STORM_EXPEDITION_SAVE_KEY, {});
    let state = parseStormExpeditionState(raw, stormExpeditionDateKey());
    const frontierDepth = Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2));
    if (frontierDepth < STORM_EXPEDITION_UNLOCK_DEPTH) {
      return response(403, { ...statusBody(charSave, state), error: "locked" });
    }

    if (input?.action === "start") {
      const route = stormExpeditionRoute(input.routeId);
      if (!route) return response(400, { ...statusBody(charSave, state), error: "invalid_route" });
      if (state.active) return response(409, { ...statusBody(charSave, state), error: "already_active" });
      if (state.attemptsUsed >= STORM_EXPEDITION_DAILY_ATTEMPTS) {
        return response(409, { ...statusBody(charSave, state), error: "no_attempts" });
      }
      const prepared = await prepareV2BattleActor({ tx, userId, charSave, deriveSkills: "sanitized" });
      if (!prepared) return response(400, { ok: false, error: "no_character" });
      state = {
        ...state,
        attemptsUsed: state.attemptsUsed + 1,
        active: {
          routeId: route.id,
          stage: 0,
          hp: prepared.player.maxHp,
          mp: prepared.player.player.maxMp ?? 0,
          pendingGold: 0,
        },
      };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, statusBody(charSave, state));
    }

    if (input?.action === "withdraw") {
      if (!state.active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
      if (state.active.stage === 0) {
        return response(409, { ...statusBody(charSave, state), error: "nothing_to_claim" });
      }
      const gainedGold = state.active.pendingGold;
      const nextCharacter = {
        ...charSave,
        gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)) + gainedGold,
      };
      state = { ...state, active: null };
      await upsertSave(tx, userId, "character.v2", nextCharacter);
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, { ...statusBody(nextCharacter, state), gainedGold, withdrew: true });
    }

    if (input?.action !== "advance") {
      return response(400, { ...statusBody(charSave, state), error: "invalid_action" });
    }
    if (!state.active) return response(409, { ...statusBody(charSave, state), error: "no_active" });

    const prepared = await prepareV2BattleActor({ tx, userId, charSave, deriveSkills: "sanitized" });
    if (!prepared) return response(400, { ok: false, error: "no_character" });
    const profile = await readSave<{ name?: string; gender?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const active = state.active;
    const enemy = stormExpeditionEnemy(active.routeId, active.stage);
    const playerName = profile?.name?.trim() || "모험가";
    const startPlayerHp = Math.min(prepared.player.maxHp, active.hp);
    const playerForBattle = {
      ...prepared.player.player,
      hp: startPlayerHp,
      mp: Math.min(prepared.player.player.maxMp ?? 0, active.mp),
    };
    const battle = resolveBattle(playerForBattle, enemy, playerName, {
      pickAction: (battleState) => pickAutoAction(battleState, { rules: [], potions: {} }),
      potions: {},
      v2Skills: prepared.skills,
      maxTurns: 100,
      isBoss: active.stage === STORM_EXPEDITION_STAGE_COUNT - 1,
      openingNote: `${stormExpeditionRoute(active.routeId)?.name ?? "폭풍 부유도"} ${active.stage + 1}구간`,
    });
    const success = battle.outcome === "win";
    const reward = success ? stormExpeditionStageReward(active.stage) : 0;
    const bossClear = success && active.stage === STORM_EXPEDITION_STAGE_COUNT - 1;
    let gainedGold = 0;

    if (!success) {
      state = { ...state, active: null };
    } else if (bossClear) {
      gainedGold = active.pendingGold + reward;
      charSave.gold = Math.max(0, Math.floor(Number(charSave.gold) || 0)) + gainedGold;
      state = { ...state, active: null, clears: state.clears + 1 };
      await upsertSave(tx, userId, "character.v2", charSave);
    } else {
      state = {
        ...state,
        active: {
          ...active,
          stage: active.stage + 1,
          hp: Math.max(0, battle.finalState.playerHp),
          mp: Math.max(0, battle.finalState.playerMp),
          pendingGold: active.pendingGold + reward,
        },
      };
    }
    await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);

    return response(200, {
      ...statusBody(charSave, state),
      success,
      bossClear,
      failed: !success,
      gainedGold,
      stage: active.stage,
      enemyName: enemy.name,
      turns: battle.turns,
      replay: toReplayPayload(battle.finalState, 220),
      startPlayerHp,
      playerName,
      gender: profile?.gender ?? "male1",
    });
  });

  return Response.json(result.body, { status: result.status });
}

function statusBody(charSave: CharacterSave, raw: unknown) {
  const state = parseStormExpeditionState(raw, stormExpeditionDateKey());
  const frontierDepth = Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2));
  return {
    ok: true as const,
    unlocked: frontierDepth >= STORM_EXPEDITION_UNLOCK_DEPTH,
    unlockDepth: STORM_EXPEDITION_UNLOCK_DEPTH,
    frontierDepth,
    attemptsLeft: Math.max(0, STORM_EXPEDITION_DAILY_ATTEMPTS - state.attemptsUsed),
    stageCount: STORM_EXPEDITION_STAGE_COUNT,
    state,
    routes: STORM_EXPEDITION_ROUTES,
    rewards: Array.from({ length: STORM_EXPEDITION_STAGE_COUNT }, (_, stage) =>
      stormExpeditionStageReward(stage),
    ),
    gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)),
  };
}

function response(status: number, body: Record<string, unknown>) {
  return { status, body };
}
