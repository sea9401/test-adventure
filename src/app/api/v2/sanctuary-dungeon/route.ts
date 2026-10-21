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
import { parseEmblemState, rollEmblemDrops, type Emblem } from "@/adventure/data/v2/emblems";
import {
  SANCTUARY_SAVE_KEY, SANCTUARY_DAILY_ATTEMPTS, SANCTUARY_NAME,
  canEnterSanctuary, parseSanctuaryState, createSanctuaryActive,
  advanceSanctuary, sanctuaryNode, sanctuaryChoices, sanctuaryEnemy, type SanctuaryState,
  parseSanctuaryAutoPreferences, pickSanctuaryAutoChoice, type SanctuaryAutoRun,
  parseSanctuaryDifficulty, type SanctuaryDifficulty,
} from "@/adventure/data/v2/sanctuaryDungeon";
import type { StormExpeditionActive, StormExpeditionChoiceKind, StormExpeditionEncounterKind } from "@/adventure/data/v2/stormExpedition";

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
    type Prepared = NonNullable<Awaited<ReturnType<typeof prepareV2BattleActor>>>;
    const prepare = () => prepareV2BattleActor({ tx, userId, charSave: character, deriveSkills: "sanitized" });
    const startRun = (prepared: Prepared, difficulty: SanctuaryDifficulty) => {
      state = { ...state, attemptsUsed: state.attemptsUsed + 1, active: createSanctuaryActive(prepared.player.player.maxHp, prepared.player.player.maxMp ?? 0), difficulty, pendingEmblems: [] };
    };
    // 난이도를 보내지 않은 구형 요청은 노말로 본다.
    const requestedDifficulty = input.difficulty === undefined ? "normal" : parseSanctuaryDifficulty(input.difficulty);
    const chooseStep = (active: StormExpeditionActive, kind: StormExpeditionChoiceKind, choiceId: string, prepared: Prepared) => {
      const next = applyChoice(active, kind, choiceId, prepared.player.player.maxHp, prepared.player.player.maxMp ?? 0);
      if (!next) return false;
      state = { ...state, active: advanceSanctuary(next) };
      return true;
    };
    const fightStep = async (active: StormExpeditionActive, encounterKind: StormExpeditionEncounterKind, prepared: Prepared, playerName: string) => {
      const node = sanctuaryNode(active);
      const maxHp = prepared.player.player.maxHp;
      const maxMp = stormEffectiveMaxMp(prepared.player.player.maxMp ?? 0, active.boons, null);
      const player = applyBattleBonuses({ ...prepared.player.player, hp: Math.min(maxHp, active.hp), mp: Math.min(maxMp, active.mp), maxHp, maxMp }, active, encounterKind);
      const used = new Set(active.usedRecoverySkillIds);
      const skills = { ...prepared.skills, equipped: prepared.skills.equipped.filter((id) => !used.has(id as LimitedRecoverySkillId)) };
      const difficulty = state.difficulty;
      const enemy = sanctuaryEnemy(active, difficulty);
      const battle = resolveBattle(player, enemy, playerName, {
        pickAction: (battleState) => pickAutoAction(battleState, { rules: [], potions: {} }),
        potions: {}, v2Skills: skills, maxTurns: 100,
        isBoss: encounterKind === "guardian" || encounterKind === "final_boss",
        openingNote: `${SANCTUARY_NAME} · ${node.name}`,
      });
      const success = battle.outcome === "win";
      const finalClear = success && encounterKind === "final_boss";
      const droppedEmblems = success ? rollEmblemDrops(encounterKind, difficulty, randomUUID) : [];
      const pendingEmblems = [...state.pendingEmblems, ...droppedEmblems];
      const lostEmblems = success ? 0 : state.pendingEmblems.length;
      let gainedEmblems: Emblem[] = [];
      if (!success) {
        state = { ...state, active: null, difficulty: "normal", pendingEmblems: [] };
      } else if (finalClear) {
        gainedEmblems = pendingEmblems;
        await claim(gainedEmblems);
        state = { ...state, active: null, difficulty: "normal", pendingEmblems: [], clears: state.clears + 1 };
      } else {
        state = { ...state, pendingEmblems, active: advanceSanctuary({
          ...active, maxHp, maxMp,
          hp: Math.min(maxHp, Math.max(0, battle.finalState.playerHp) + (active.boons.includes("victory_vigor") ? Math.floor(maxHp * 0.08) : 0)),
          mp: Math.max(0, battle.finalState.playerMp), defeatedCount: active.defeatedCount + 1,
          nextBattleEffects: consumeBattleEffects(active.nextBattleEffects, encounterKind),
          usedRecoverySkillIds: [...new Set([...active.usedRecoverySkillIds, ...LIMITED_RECOVERY_SKILL_IDS.filter((id) => (battle.finalState.v2SkillCooldowns[id] ?? 0) > 0)])],
        }) };
      }
      return { success, finalClear, difficulty, droppedEmblems, gainedEmblems, lostEmblems, enemy, battle, player };
    };
    const readPlayerName = async () => {
      const profile = await readSave<{ name?: string; gender?: string }>(tx, userId, "character-profile.v2", {});
      return { playerName: profile.name?.trim() || "모험가", gender: profile.gender ?? "male1" };
    };
    if ((input.action === "start" || input.action === "auto") && !requestedDifficulty) return fail("invalid_difficulty", 400);
    if (input.action === "start") {
      if (state.active) return fail("already_active");
      if (state.attemptsUsed >= SANCTUARY_DAILY_ATTEMPTS) return fail("no_attempts");
      const prepared = await prepare();
      if (!prepared) return fail("no_character", 404);
      startRun(prepared, requestedDifficulty!);
      return save();
    }
    if (input.action === "auto") {
      // 진행 중인 탐험을 먼저 끝내고, 남은 입장을 모두 선호 순서대로 끝까지 진행한다. 중간 귀환은 하지 않는다.
      if (!state.active && state.attemptsUsed >= SANCTUARY_DAILY_ATTEMPTS) return fail("no_attempts");
      const prepared = await prepare();
      if (!prepared) return fail("no_character", 404);
      const { playerName } = await readPlayerName();
      const preferences = parseSanctuaryAutoPreferences(input.preferences ?? state.autoPreferences);
      state = { ...state, autoPreferences: preferences };
      const runs: SanctuaryAutoRun[] = [];
      while (state.active || state.attemptsUsed < SANCTUARY_DAILY_ATTEMPTS) {
        if (!state.active) startRun(prepared, requestedDifficulty!);
        let run: SanctuaryAutoRun | null = null;
        while (!run) {
          const active = state.active!;
          const node = sanctuaryNode(active);
          if (node.kind !== "battle") {
            const choiceId = pickSanctuaryAutoChoice(active, preferences);
            // 제시된 효과 중에서 고르므로 실패할 수 없다. 실패하면 지급분까지 롤백되도록 던진다.
            if (!choiceId || !chooseStep(active, node.kind, choiceId, prepared)) throw new Error("sanctuary_auto_choice_failed");
            continue;
          }
          if (!node.encounterKind) throw new Error("sanctuary_auto_battle_missing");
          const result = await fightStep(active, node.encounterKind, prepared, playerName);
          if (!result.success) run = { difficulty: result.difficulty, cleared: false, endedAt: result.enemy.name, gainedEmblems: [], lostEmblems: result.lostEmblems };
          else if (result.finalClear) run = { difficulty: result.difficulty, cleared: true, endedAt: result.enemy.name, gainedEmblems: result.gainedEmblems, lostEmblems: 0 };
        }
        runs.push(run);
      }
      return save({ auto: { runs } });
    }
    if (!["fight", "choose", "withdraw"].includes(String(input.action))) return fail("invalid_action", 400);
    const active = state.active;
    if (!active) return fail("no_active");
    if (input.action === "withdraw") {
      const gainedEmblems = state.pendingEmblems;
      await claim(gainedEmblems);
      state = { ...state, active: null, difficulty: "normal", pendingEmblems: [] };
      return save({ withdrawn: true, gainedEmblems });
    }
    const node = sanctuaryNode(active);
    if (input.action === "choose") {
      if (node.kind === "battle") return fail("battle_required");
      if (!sanctuaryChoices(active).some((choice) => choice.id === input.choiceId)) return fail("invalid_choice", 400);
      const prepared = await prepare();
      if (!prepared) return fail("no_character", 404);
      if (!chooseStep(active, node.kind, String(input.choiceId), prepared)) return fail("invalid_choice", 400);
      return save({ choiceApplied: true });
    }
    if (node.kind !== "battle" || !node.encounterKind) return fail("choice_required");
    const prepared = await prepare();
    if (!prepared) return fail("no_character", 404);
    const { playerName, gender } = await readPlayerName();
    const { success, finalClear, droppedEmblems, gainedEmblems, enemy, battle, player } = await fightStep(active, node.encounterKind, prepared, playerName);
    return save({ success, finalClear, failed: !success, droppedEmblems, gainedEmblems, enemyName: enemy.name, turns: battle.turns,
      startPlayerHp: player.hp, playerName, gender, replay: toReplayPayload(battle.finalState, { playerCombat: player }) });
  });
}
