import { applyBattleBonuses, consumeBattleEffects, advanceAfterBattle, applyChoice, applyRiskDecision, stormEffectiveMaxMp, isAcceptedRisk, applyRiskToEnemy } from "@/lib/server/expeditionEffects";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbTransactionExecutor,
} from "@/lib/server/savesKv";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  V2_EQUIPMENT,
  isUnique,
  parseEquipmentSave,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import {
  STORM_EXPEDITION_ALTAR_CHOICES,
  STORM_EXPEDITION_CAMP_CHOICES,
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_FINAL_PREP_CHOICES,
  STORM_EXPEDITION_NODE_COUNT,
  STORM_EXPEDITION_ROUTES,
  STORM_EXPEDITION_RISK_CURSES,
  STORM_EXPEDITION_RISK_EVENTS,
  STORM_EXPEDITION_SAVE_KEY,
  STORM_EXPEDITION_SUPPLY_CHOICES,
  STORM_EXPEDITION_UNLOCK_DEPTH,
  createStormAltarOffers,
  createStormRiskEvent,
  parseStormExpeditionState,
  reconcileStormExpeditionSpFruitProgress,
  stormExpeditionBattleReward,
  stormExpeditionDateKey,
  stormExpeditionEnemy,
  stormExpeditionNode,
  stormExpeditionRoute,
  type StormExpeditionActive,
  type StormExpeditionRiskEventOffer,
} from "@/adventure/data/v2/stormExpedition";
import {
  STORM_EXPEDITION_ENTRANCE_NODE_IDS,
  STORM_EXPEDITION_MAP_NODES,
  stormExpeditionAvailableNextNodeIds,
  stormExpeditionMapNode,
  stormExpeditionRouteNodeId,
  type StormExpeditionMapNodeId,
} from "@/adventure/data/v2/stormExpeditionMap";
import {
  STORM_EXPEDITION_LOOT,
  STORM_EXPEDITION_UNIQUE_LOOT,
  STORM_EXPEDITION_SP_FRUIT_CAP,
  STORM_EXPEDITION_SP_FRUIT_CHANCE,
  STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID,
  STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS,
  mergeStormExpeditionMaterials,
  rollStormExpeditionLoot,
  rollStormExpeditionSpFruit,
  rollStormExpeditionUniqueLoot,
} from "@/adventure/data/v2/stormExpeditionRewards";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { parseSpFruitUsed } from "@/adventure/data/v2/spFruit";
import {
  LIMITED_RECOVERY_SKILL_IDS,
  type LimitedRecoverySkillId,
} from "@/adventure/data/v2/v2Skills";

type CharacterSave = Record<string, unknown> & {
  frontierDepth?: number;
  gold?: number;
  materials?: Record<string, number>;
  spFruitUsed?: unknown;
};

type PostInput = {
  action?: unknown;
  routeId?: unknown;
  targetNodeId?: unknown;
  mode?: unknown;
  choiceId?: unknown;
  expectedNodeIndex?: unknown;
  expectedCurrentNodeId?: unknown;
  expectedEncounterIndex?: unknown;
  decision?: unknown;
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
    // 일괄 진행은 1회 최대 21개 요청이며 하루 3회를 연달아 실행할 수 있다.
    // 정상 최대치 63회에 중단·재개 여유를 더하되 IP 제한은 그대로 유지한다.
    userLimit: 90,
    ipLimit: 400,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const input = (await req.json().catch(() => null)) as PostInput | null;
  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    // 공용 잠금 순서(character → equipment → expedition)를 유지한다.
    const equipmentSave = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "equipment.v2", {});
    const raw = await lockSaveForUpdate<unknown>(tx, userId, STORM_EXPEDITION_SAVE_KEY, {});
    let state = reconcileStormExpeditionSpFruitProgress(
      parseStormExpeditionState(raw, stormExpeditionDateKey()),
      observedStormExpeditionSpFruitV(charSave),
    );
    let responseCharSave = charSave;
    const frontierDepth = Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2));
    if (frontierDepth < STORM_EXPEDITION_UNLOCK_DEPTH) {
      return response(403, { ...statusBody(charSave, state), error: "locked" });
    }

    if (input?.action === "start") {
      const targetNode = input.targetNodeId === undefined
        ? (() => {
            const legacyRoute = stormExpeditionRoute(input.routeId);
            return legacyRoute ? stormExpeditionMapNode(stormExpeditionRouteNodeId(legacyRoute.id, "outer")) : null;
          })()
        : stormExpeditionMapNode(input.targetNodeId);
      if (!targetNode || !STORM_EXPEDITION_ENTRANCE_NODE_IDS.includes(targetNode.id as typeof STORM_EXPEDITION_ENTRANCE_NODE_IDS[number])) {
        return response(400, { ...statusBody(charSave, state), error: input.targetNodeId === undefined ? "invalid_route" : "invalid_node" });
      }
      const route = stormExpeditionRoute(targetNode.routeId);
      if (!route) return response(400, { ...statusBody(charSave, state), error: "invalid_node" });
      const mode = input.mode === undefined || input.mode === "normal"
        ? "normal"
        : input.mode === "practice"
          ? "practice"
          : null;
      if (!mode) return response(400, { ...statusBody(charSave, state), error: "invalid_mode" });
      if (state.active) return response(409, { ...statusBody(charSave, state), error: "already_active" });
      if (mode === "normal" && state.attemptsUsed >= STORM_EXPEDITION_DAILY_ATTEMPTS) {
        return response(409, { ...statusBody(charSave, state), error: "no_attempts" });
      }
      const prepared = await prepareV2BattleActor({ tx, userId, charSave, equipmentSave, deriveSkills: "sanitized" });
      if (!prepared) return response(400, { ok: false, error: "no_character" });
      const maxHp = prepared.player.player.maxHp;
      const maxMp = prepared.player.player.maxMp ?? 0;
      const riskEvent = createStormRiskEvent();
      state = {
        ...state,
        attemptsUsed: mode === "normal" ? state.attemptsUsed + 1 : state.attemptsUsed,
        active: {
          version: 3,
          mode,
          routeId: route.id,
          currentNodeId: targetNode.id,
          visitedNodeIds: [targetNode.id],
          completedNodeIds: [],
          encounterIndex: 0,
          hp: maxHp,
          mp: maxMp,
          maxHp,
          maxMp,
          defeatedCount: 0,
          pendingGold: 0,
          pendingMaterials: {},
          pendingEquipment: [],
          boons: [],
          nextBattleEffects: [],
          usedRecoverySkillIds: [],
          altarOffers: createStormAltarOffers(Math.random, riskEvent.boonId),
          chosenChoices: {},
          riskEvent,
        },
      };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, statusBody(charSave, state));
    }

    if (input?.action === "move") {
      const active = state.active;
      if (!active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
      if (hasStalePosition(input, active)) return response(409, { ...statusBody(charSave, state), error: "stale_state" });
      const target = stormExpeditionMapNode(input.targetNodeId);
      if (!target) return response(400, { ...statusBody(charSave, state), error: "invalid_node" });
      if (active.visitedNodeIds.includes(target.id)) return response(409, { ...statusBody(charSave, state), error: "node_already_visited" });
      if (!active.completedNodeIds.includes(active.currentNodeId)) return response(409, { ...statusBody(charSave, state), error: "node_not_completed" });
      if (!stormExpeditionNode(active).nextNodeIds.includes(target.id)) return response(409, { ...statusBody(charSave, state), error: "node_not_reachable" });
      const moved: StormExpeditionActive = {
        ...active,
        currentNodeId: target.id,
        visitedNodeIds: [...active.visitedNodeIds, target.id],
        routeId: target.routeId ?? active.routeId,
        encounterIndex: 0,
      };
      state = { ...state, active: moved };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, { ...statusBody(charSave, state), moved: true });
    }

    if (input?.action === "withdraw") {
      const active = state.active;
      if (!active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
      if (hasStalePosition(input, active)) {
        return response(409, { ...statusBody(charSave, state), error: "stale_state" });
      }
      if (active.mode === "practice") {
        state = { ...state, active: null };
        await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
        return response(200, {
          ...statusBody(charSave, state),
          practice: true,
          practiceEnded: true,
          claimedRewards: false,
        });
      }
      if (active.nextBattleEffects.includes("risk_enemy_fury")) {
        return response(409, { ...statusBody(charSave, state), error: "risk_debt_pending" });
      }
      if (active.defeatedCount <= 0) {
        return response(409, { ...statusBody(charSave, state), error: "nothing_to_claim" });
      }
      const claimed = await claimPendingRewards({ tx, userId, charSave, equipmentSave, active });
      state = { ...state, active: null };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, {
        ...statusBody(claimed.character, state),
        ...claimed.result,
        claimedRewards: true,
        withdrew: true,
      });
    }

    if (input?.action === "risk_event") {
      const active = state.active;
      if (!active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
      if (hasStalePosition(input, active)) {
        return response(409, { ...statusBody(charSave, state), error: "stale_state" });
      }
      const decision = input.decision === "accept" ? "accept" : input.decision === "decline" ? "decline" : null;
      if (!decision) return response(400, { ...statusBody(charSave, state), error: "invalid_decision" });
      if (!active.riskEvent || active.riskEvent.status !== "offered" || active.riskEvent.triggerCheckpoint !== currentRiskCheckpoint(active.currentNodeId)) {
        return response(409, { ...statusBody(charSave, state), error: "risk_event_unavailable" });
      }
      const resolved = applyRiskDecision(active, decision);
      state = { ...state, active: resolved };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, {
        ...statusBody(charSave, state),
        riskEventResolved: true,
        riskEventAccepted: decision === "accept",
        riskEventId: active.riskEvent.id,
      });
    }

    if (input?.action === "choose") {
      const active = state.active;
      if (!active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
      if (hasStalePosition(input, active)) {
        return response(409, { ...statusBody(charSave, state), error: "stale_state" });
      }
      if (active.completedNodeIds.includes(active.currentNodeId)) {
        return response(409, { ...statusBody(charSave, state), error: "node_already_completed" });
      }
      const node = stormExpeditionNode(active);
      if (node.kind === "battle") {
        return response(409, { ...statusBody(charSave, state), error: "battle_required" });
      }
      if (active.riskEvent?.status === "offered" && active.riskEvent.triggerCheckpoint === currentRiskCheckpoint(active.currentNodeId)) {
        return response(409, { ...statusBody(charSave, state), error: "risk_event_required" });
      }
      const choiceId = typeof input.choiceId === "string" ? input.choiceId : "";
      const prepared = await prepareV2BattleActor({ tx, userId, charSave, equipmentSave, deriveSkills: "sanitized" });
      if (!prepared) return response(400, { ok: false, error: "no_character" });
      const applied = applyChoice(active, node.kind, choiceId, prepared.player.player.maxHp, prepared.player.player.maxMp ?? 0);
      if (!applied) return response(400, { ...statusBody(charSave, state), error: "invalid_choice" });
      state = { ...state, active: applied };
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);
      return response(200, {
        ...statusBody(charSave, state),
        choiceApplied: true,
        choiceId,
        choiceKind: node.kind,
      });
    }

    // advance는 구형 클라이언트 호환 별칭이다.
    if (input?.action !== "fight" && input?.action !== "advance") {
      return response(400, { ...statusBody(charSave, state), error: "invalid_action" });
    }
    const active = state.active;
    if (!active) return response(409, { ...statusBody(charSave, state), error: "no_active" });
    if (hasStalePosition(input, active)) {
      return response(409, { ...statusBody(charSave, state), error: "stale_state" });
    }
    const node = stormExpeditionNode(active);
    if (active.completedNodeIds.includes(active.currentNodeId)) {
      return response(409, { ...statusBody(charSave, state), error: "node_already_completed" });
    }
    if (node.kind !== "battle" || !node.encounterKind) {
      return response(409, { ...statusBody(charSave, state), error: "choice_required" });
    }

    const prepared = await prepareV2BattleActor({ tx, userId, charSave, equipmentSave, deriveSkills: "sanitized" });
    if (!prepared) return response(400, { ok: false, error: "no_character" });
    const profile = await readSave<{ name?: string; gender?: string } | null>(tx, userId, "character-profile.v2", null);
    const baseMaxHp = prepared.player.player.maxHp;
    const baseMaxMp = prepared.player.player.maxMp ?? 0;
    const effectiveMaxMp = stormEffectiveMaxMp(baseMaxMp, active.boons, active.riskEvent);
    const playerName = profile?.name?.trim() || "모험가";
    const startPlayerHp = Math.min(baseMaxHp, active.hp);
    const playerForBattle = applyBattleBonuses({
      ...prepared.player.player,
      hp: startPlayerHp,
      maxHp: baseMaxHp,
      maxMp: effectiveMaxMp,
      mp: Math.min(effectiveMaxMp, active.mp),
    }, active, node.encounterKind);
    const enemy = applyRiskToEnemy(
      stormExpeditionEnemy(node.routeId ?? active.routeId, node.encounterKind, active.encounterIndex),
      active,
    );
    const isBoss = node.encounterKind === "guardian" || node.encounterKind === "final_boss";
    const usedRecoverySkillIds = new Set(active.usedRecoverySkillIds);
    const expeditionSkills = usedRecoverySkillIds.size > 0
      ? {
          ...prepared.skills,
          equipped: prepared.skills.equipped.filter(
            (skillId) => !usedRecoverySkillIds.has(skillId as LimitedRecoverySkillId),
          ),
        }
      : prepared.skills;
    const battle = resolveBattle(playerForBattle, enemy, playerName, {
      pickAction: (battleState) => pickAutoAction(battleState, { rules: [], potions: {} }),
      potions: {},
      v2Skills: expeditionSkills,
      maxTurns: 100,
      isBoss,
      openingNote: `${stormExpeditionRoute(active.routeId)?.name ?? "원정"} · ${node.name}${(node.encounterCount ?? 1) > 1 ? ` ${active.encounterIndex + 1}전` : ""}`,
    });
    const success = battle.outcome === "win";
    const finalClear = success && node.encounterKind === "final_boss";
    let gainedGold = 0;
    let gainedMaterials: Record<string, number> = {};
    let gainedEquipment: V2EquipInstance[] = [];
    let droppedMaterials: Record<string, number> = {};
    let droppedEquipment: V2EquipInstance | null = null;
    let droppedUniqueEquipment: V2EquipInstance[] = [];
    let spFruitDropped = false;
    const practice = active.mode === "practice";

    if (!success) {
      state = { ...state, active: null };
    } else {
      const rewardMultiplier = isAcceptedRisk(active, "golden_compass") ? 1.35 : 1;
      const reward = practice
        ? 0
        : Math.floor(
            stormExpeditionBattleReward(node.encounterKind, active.encounterIndex) * rewardMultiplier,
          );
      const equipmentChanceMultiplier = isAcceptedRisk(active, "storm_contract") ? 2 : 1;
      const loot = practice
        ? { materials: {}, equipmentId: null }
        : rollStormExpeditionLoot(
            node.routeId ?? active.routeId,
            node.encounterKind,
            Math.random,
            { equipmentChanceMultiplier },
          );
      const uniqueLoot = practice
        ? { uniqueIds: [] }
        : rollStormExpeditionUniqueLoot(
            node.routeId ?? active.routeId,
            node.encounterKind,
            Math.random,
            { uniqueChanceMultiplier: equipmentChanceMultiplier },
          );
      droppedMaterials = loot.materials;
      droppedEquipment = loot.equipmentId ? mintRolledEquipInstance(loot.equipmentId) : null;
      droppedUniqueEquipment = uniqueLoot.uniqueIds.map((id) =>
        mintRolledEquipInstance(id)
      );
      const pendingMaterials = practice
        ? {}
        : mergeStormExpeditionMaterials(active.pendingMaterials, droppedMaterials);
      const pendingEquipment = practice
        ? []
        : [
            ...active.pendingEquipment,
            ...(droppedEquipment ? [droppedEquipment] : []),
            ...droppedUniqueEquipment,
          ];
      const nextEffects = consumeBattleEffects(active.nextBattleEffects, node.encounterKind);
      const nextHpBeforeHeal = Math.max(0, battle.finalState.playerHp);
      const nextHp = active.boons.includes("victory_vigor")
        ? Math.min(baseMaxHp, nextHpBeforeHeal + Math.floor(baseMaxHp * 0.08))
        : nextHpBeforeHeal;
      const usedRecoverySkillIdsAfterBattle = [
        ...usedRecoverySkillIds,
        ...LIMITED_RECOVERY_SKILL_IDS.filter(
          (skillId) =>
            (battle.finalState.v2SkillCooldowns[skillId] ?? 0) > 0,
        ),
      ];
      const advanced = advanceAfterBattle({
        ...active,
        hp: nextHp,
        mp: Math.max(0, battle.finalState.playerMp),
        maxHp: baseMaxHp,
        maxMp: effectiveMaxMp,
        defeatedCount: active.defeatedCount + 1,
        pendingGold: practice ? 0 : active.pendingGold + reward,
        pendingMaterials,
        pendingEquipment,
        nextBattleEffects: nextEffects,
        usedRecoverySkillIds: [...new Set(usedRecoverySkillIdsAfterBattle)],
      }, node.encounterCount ?? 1);

      if (finalClear && practice) {
        state = { ...state, active: null };
      } else if (finalClear) {
        const spFruitRoll = rollStormExpeditionSpFruit({
          pity: state.spFruitPity,
          obtained: state.spFruitObtained,
        });
        spFruitDropped = spFruitRoll.dropped;
        const completed = spFruitDropped
          ? {
              ...advanced,
              pendingMaterials: mergeStormExpeditionMaterials(advanced.pendingMaterials, {
                [STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID]: 1,
              }),
            }
          : advanced;
        const claimed = await claimPendingRewards({ tx, userId, charSave, equipmentSave, active: completed });
        gainedGold = claimed.result.gainedGold;
        gainedMaterials = claimed.result.gainedMaterials;
        gainedEquipment = claimed.result.gainedEquipment;
        responseCharSave = claimed.character;
        state = {
          ...state,
          active: null,
          clears: state.clears + 1,
          spFruitPity: spFruitRoll.next.pity,
          spFruitObtained: spFruitRoll.next.obtained,
        };
      } else {
        state = { ...state, active: advanced };
      }
    }
    await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, state);

    return response(200, {
      ...statusBody(responseCharSave, state),
      practice,
      success,
      bossClear: finalClear,
      finalClear,
      failed: !success,
      practiceCompleted: finalClear && practice,
      gainedGold,
      gainedMaterials,
      gainedEquipment,
      droppedMaterials,
      droppedEquipment,
      droppedUniqueEquipment,
      claimedRewards: finalClear && !practice,
      spFruitDropped,
      currentNodeId: active.currentNodeId,
      encounterIndex: active.encounterIndex,
      encounterKind: node.encounterKind,
      routeId: node.routeId ?? active.routeId,
      enemyName: enemy.name,
      turns: battle.turns,
      replay: toReplayPayload(battle.finalState, {
        playerCombat: playerForBattle,
      }),
      startPlayerHp,
      playerName,
      gender: profile?.gender ?? "male1",
    });
  });

  return Response.json(result.body, { status: result.status });
}

function hasStalePosition(input: PostInput, active: StormExpeditionActive): boolean {
  if (typeof input.expectedCurrentNodeId === "string" && input.expectedCurrentNodeId !== active.currentNodeId) return true;
  const expectedNode = Number(input.expectedNodeIndex);
  const expectedEncounter = Number(input.expectedEncounterIndex);
  return (Number.isFinite(expectedNode) && Math.floor(expectedNode) !== active.visitedNodeIds.length - 1)
    || (Number.isFinite(expectedEncounter) && Math.floor(expectedEncounter) !== active.encounterIndex);
}

function currentRiskCheckpoint(nodeId: StormExpeditionMapNodeId): StormExpeditionRiskEventOffer["triggerCheckpoint"] | null {
  if (nodeId === "supply") return "supply";
  if (nodeId === "altar") return "altar";
  if (nodeId.endsWith("_camp")) return "camp";
  return null;
}

async function claimPendingRewards({
  tx,
  userId,
  charSave,
  equipmentSave,
  active,
}: {
  tx: DbTransactionExecutor;
  userId: string;
  charSave: CharacterSave;
  equipmentSave: Record<string, unknown>;
  active: StormExpeditionActive;
}) {
  const parsedEquipment = parseEquipmentSave(equipmentSave);
  const character = {
    ...charSave,
    gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)) + active.pendingGold,
    materials: mergeDrops(charSave.materials, active.pendingMaterials),
  };
  await upsertSave(tx, userId, "character.v2", character);
  const nextOwned = [...parsedEquipment.owned, ...active.pendingEquipment];
  await upsertSave(tx, userId, "equipment.v2", {
    owned: nextOwned,
    equipped: parsedEquipment.equipped,
  });
  const acquiredUniqueIds = active.pendingEquipment
    .map((instance) => instance.id)
    .filter((id) => isUnique(V2_EQUIPMENT[id]));
  if (acquiredUniqueIds.length > 0) {
    await recordUniqueEquipmentAcquisitions({
      executor: tx,
      userId,
      evidence: {
        equipmentOwnedAfter: nextOwned,
        equipmentCodexRaw: await readSave(
          tx,
          userId,
          EQUIPMENT_CODEX_KEY,
          {},
        ),
        acquiredIds: acquiredUniqueIds,
      },
    });
  }
  if (active.pendingEquipment.length > 0) {
    await recordCodexMasteryGameplayBatch(
      tx,
      userId,
      active.pendingEquipment.map((instance) => ({
        category: "equipment" as const,
        entryId: instance.id,
        amount: 1,
        source: "equipment.drop" as const,
      })),
      new Date(),
    );
  }
  return {
    character,
    result: {
      gainedGold: active.pendingGold,
      gainedMaterials: active.pendingMaterials,
      gainedEquipment: active.pendingEquipment,
    },
  };
}

function statusBody(charSave: CharacterSave, raw: unknown) {
  const state = reconcileStormExpeditionSpFruitProgress(
    parseStormExpeditionState(raw, stormExpeditionDateKey()),
    observedStormExpeditionSpFruitV(charSave),
  );
  const frontierDepth = Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2));
  return {
    ok: true as const,
    unlocked: frontierDepth >= STORM_EXPEDITION_UNLOCK_DEPTH,
    unlockDepth: STORM_EXPEDITION_UNLOCK_DEPTH,
    frontierDepth,
    attemptsLeft: Math.max(0, STORM_EXPEDITION_DAILY_ATTEMPTS - state.attemptsUsed),
    nodeCount: STORM_EXPEDITION_NODE_COUNT,
    stageCount: STORM_EXPEDITION_NODE_COUNT,
    state,
    routes: STORM_EXPEDITION_ROUTES,
    nodes: STORM_EXPEDITION_MAP_NODES,
    entranceNodeIds: STORM_EXPEDITION_ENTRANCE_NODE_IDS,
    availableNextNodeIds: state.active ? stormExpeditionAvailableNextNodeIds(state.active) : [],
    choices: {
      supply: STORM_EXPEDITION_SUPPLY_CHOICES,
      camp: STORM_EXPEDITION_CAMP_CHOICES,
      altar: STORM_EXPEDITION_ALTAR_CHOICES,
      final_prep: STORM_EXPEDITION_FINAL_PREP_CHOICES,
    },
    riskEvents: STORM_EXPEDITION_RISK_EVENTS,
    riskCurses: STORM_EXPEDITION_RISK_CURSES,
    lootRules: STORM_EXPEDITION_LOOT,
    uniqueLootRules: STORM_EXPEDITION_UNIQUE_LOOT,
    spFruitReward: {
      materialId: STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID,
      chance: STORM_EXPEDITION_SP_FRUIT_CHANCE,
      pityClears: STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS,
      cap: STORM_EXPEDITION_SP_FRUIT_CAP,
    },
    gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)),
  };
}

function observedStormExpeditionSpFruitV(charSave: CharacterSave): number {
  const held = Math.max(
    0,
    Math.floor(Number(charSave.materials?.[STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID]) || 0),
  );
  const used = parseSpFruitUsed(charSave.spFruitUsed)[5];
  return held + used;
}

function response(status: number, body: Record<string, unknown>) {
  return { status, body };
}
