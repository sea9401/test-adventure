import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { applyBattleBonuses, applyChoice, consumeBattleEffects, stormEffectiveMaxMp } from "@/lib/server/expeditionEffects";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { LIMITED_RECOVERY_SKILL_IDS, type LimitedRecoverySkillId } from "@/adventure/data/v2/v2Skills";
import { parseEmblemState, rollEmblemDrop, type Emblem } from "@/adventure/data/v2/emblems";
import {
  SANCTUARY_SAVE_KEY, SANCTUARY_DAILY_ATTEMPTS, SANCTUARY_NAME,
  canEnterSanctuary, parseSanctuaryState, createSanctuaryActive,
  advanceSanctuary, sanctuaryNode, sanctuaryChoices, sanctuaryEnemy, type SanctuaryState,
} from "@/adventure/data/v2/sanctuaryDungeon";

type Character = Record<string, unknown> & { level?: number; unexplored?: unknown };
function statusBody(character: Character, raw: unknown) {
  const state = parseSanctuaryState(raw);
  return { ok: true, unlocked: V2_UNEXPLORED && canEnterSanctuary(character), attemptsLeft: SANCTUARY_DAILY_ATTEMPTS - state.attemptsUsed, state };
}
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [character, raw] = await Promise.all([
    readSave<Character | null>(db, userId, "character.v2", null),
    readSave<unknown>(db, userId, SANCTUARY_SAVE_KEY, {}),
  ]);
  if (!character) return Response.json({ ok: false, error: "no_character" }, { status: 404 });
  return Response.json(statusBody(character, raw));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:sanctuary-dungeon", userLimit: 90, ipLimit: 400, windowMs: 60_000 });
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const input = body as Record<string, unknown>;
  return db.transaction(async (tx) => {
    // Serializes with hunts, emblem fusion/equipment changes, and the other dungeon.
    const character = await lockSaveForUpdate<Character | null>(tx, userId, "character.v2", null);
    if (!character) return Response.json({ ok: false, error: "no_character" }, { status: 404 });
    const raw = await lockSaveForUpdate<unknown>(tx, userId, SANCTUARY_SAVE_KEY, {});
    let state: SanctuaryState = parseSanctuaryState(raw);
    const fail = (error: string, status = 409) => Response.json({ ...statusBody(character, state), ok: false, error }, { status });
    if (!V2_UNEXPLORED || !canEnterSanctuary(character)) return fail("locked", 403);
    if (input.expectedRevision !== state.revision) return fail("stale_state");
    const save = async (extra: Record<string, unknown> = {}) => {
      state = { ...state, revision: state.revision + 1 };
      await upsertSave(tx, userId, SANCTUARY_SAVE_KEY, state);
      return Response.json({ ...statusBody(character, state), ...extra });
    };
    const claim = async (emblems: Emblem[]) => {
      if (emblems.length === 0) return;
      const current = parseEmblemState(character.emblems);
      character.emblems = { ...current, owned: [...current.owned, ...emblems], revision: current.revision + 1 };
      await upsertSave(tx, userId, "character.v2", character);
    };
    if (input.action === "start") {
      if (state.active) return fail("already_active");
      if (state.attemptsUsed >= SANCTUARY_DAILY_ATTEMPTS) return fail("no_attempts");
      const prepared = await prepareV2BattleActor({ tx, userId, charSave: character, deriveSkills: "sanitized" });
      if (!prepared) return fail("no_character", 404);
      state = { ...state, attemptsUsed: state.attemptsUsed + 1, active: createSanctuaryActive(prepared.player.player.maxHp, prepared.player.player.maxMp ?? 0), pendingEmblems: [] };
      return save();
    }
    if (!["fight", "choose", "withdraw"].includes(String(input.action))) return fail("invalid_action", 400);
    const active = state.active;
    if (!active) return fail("no_active");
    if (input.action === "withdraw") {
      const gainedEmblems = state.pendingEmblems;
      await claim(gainedEmblems);
      state = { ...state, active: null, pendingEmblems: [] };
      return save({ withdrawn: true, gainedEmblems });
    }
    const node = sanctuaryNode(active);
    if (input.action === "choose") {
      if (node.kind === "battle") return fail("battle_required");
      if (!sanctuaryChoices(active).some((choice) => choice.id === input.choiceId)) return fail("invalid_choice", 400);
      const prepared = await prepareV2BattleActor({ tx, userId, charSave: character, deriveSkills: "sanitized" });
      if (!prepared) return fail("no_character", 404);
      const next = applyChoice(active, node.kind, String(input.choiceId), prepared.player.player.maxHp, prepared.player.player.maxMp ?? 0);
      if (!next) return fail("invalid_choice", 400);
      state = { ...state, active: advanceSanctuary(next) };
      return save({ choiceApplied: true });
    }
    if (node.kind !== "battle" || !node.encounterKind) return fail("choice_required");
    const prepared = await prepareV2BattleActor({ tx, userId, charSave: character, deriveSkills: "sanitized" });
    if (!prepared) return fail("no_character", 404);
    const profile = await readSave<{ name?: string; gender?: string }>(tx, userId, "character-profile.v2", {});
    const playerName = profile.name?.trim() || "모험가";
    const maxHp = prepared.player.player.maxHp;
    const maxMp = stormEffectiveMaxMp(prepared.player.player.maxMp ?? 0, active.boons, null);
    const player = applyBattleBonuses({ ...prepared.player.player, hp: Math.min(maxHp, active.hp), mp: Math.min(maxMp, active.mp), maxHp, maxMp }, active, node.encounterKind);
    const used = new Set(active.usedRecoverySkillIds);
    const skills = { ...prepared.skills, equipped: prepared.skills.equipped.filter((id) => !used.has(id as LimitedRecoverySkillId)) };
    const enemy = sanctuaryEnemy(active);
    const battle = resolveBattle(player, enemy, playerName, {
      pickAction: (battleState) => pickAutoAction(battleState, { rules: [], potions: {} }),
      potions: {}, v2Skills: skills, maxTurns: 100,
      isBoss: node.encounterKind === "guardian" || node.encounterKind === "final_boss",
      openingNote: `${SANCTUARY_NAME} · ${node.name}`,
    });
    const success = battle.outcome === "win";
    const finalClear = success && node.encounterKind === "final_boss";
    const droppedEmblem = success ? rollEmblemDrop(node.encounterKind, randomUUID()) : null;
    const pendingEmblems = [...state.pendingEmblems, ...(droppedEmblem ? [droppedEmblem] : [])];
    let gainedEmblems: Emblem[] = [];
    if (!success) {
      state = { ...state, active: null, pendingEmblems: [] };
    } else if (finalClear) {
      gainedEmblems = pendingEmblems;
      await claim(gainedEmblems);
      state = { ...state, active: null, pendingEmblems: [], clears: state.clears + 1 };
    } else {
      state = { ...state, pendingEmblems, active: advanceSanctuary({
        ...active, maxHp, maxMp,
        hp: Math.min(maxHp, Math.max(0, battle.finalState.playerHp) + (active.boons.includes("victory_vigor") ? Math.floor(maxHp * 0.08) : 0)),
        mp: Math.max(0, battle.finalState.playerMp), defeatedCount: active.defeatedCount + 1,
        nextBattleEffects: consumeBattleEffects(active.nextBattleEffects, node.encounterKind),
        usedRecoverySkillIds: [...new Set([...active.usedRecoverySkillIds, ...LIMITED_RECOVERY_SKILL_IDS.filter((id) => (battle.finalState.v2SkillCooldowns[id] ?? 0) > 0)])],
      }) };
    }
    return save({ success, finalClear, failed: !success, droppedEmblem, gainedEmblems, enemyName: enemy.name, turns: battle.turns,
      startPlayerHp: player.hp, playerName, gender: profile.gender ?? "male1", replay: toReplayPayload(battle.finalState, { playerCombat: player }) });
  });
}
