// 고탑 서버측 적용 — DB 트랜잭션 안에서 tower.v1 / character.v2 / inventory.v2 잠금 +
// computeTowerOutcome 로 새 상태 산출 → 갱신.
//
// fight_floor 시 서버가 직접 battle simulation 을 돌린다 (anti-cheat). 클라는 의도만
// 보내고, 서버가 derivePlayerCombatFromSaves + resolveBattle 로 outcome 을 결정한다.
//
// 마일스톤 보상은 인벤토리/캐릭터 v2 와의 동시 갱신을 한 트랜잭션 안에서 처리해야
// 분실/이중 수령을 막을 수 있다.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { applyStance, stanceBattleLogText } from "@/adventure/character/stance";
import {
  resolveBattle,
  type BattleState,
} from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import type { Monster } from "@/adventure/data/monsters";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  TOWER_BOSS_INTERVAL,
  TOWER_STORAGE_KEY,
  type TowerState,
} from "@/adventure/tower/types";
import { isBossFloor, scaledStats } from "@/adventure/tower/scaling";
import { currentWeeklyModifier } from "@/adventure/tower/modifiers";
import type { TowerMilestoneReward } from "@/adventure/tower/rewards";
import {
  rollBossClearReward,
  type BossClearReward,
} from "@/adventure/tower/runeDrops";
import {
  TOWER_WEEKLY_STORAGE_KEY,
  updateTowerWeekly,
  type TowerWeekly,
} from "@/adventure/tower/weeklyTypes";
import type { RuneGrade, RuneId } from "@/adventure/data/runes";
import {
  BOSS_SLOTS,
  bossBaseMonster,
  bossDisplayName,
  bossSlotForFloor,
  mobPoolForFloor,
  pickMobFromPool,
} from "@/adventure/tower/floorPools";
import {
  TowerError,
  applyAutoStep,
  computeTowerOutcome,
  todayKey,
  type TowerAction,
  type TowerApplied,
  type TowerComputeResult,
} from "./compute";

type SavedCharacter = { gold?: number; [k: string]: unknown };
type CountMap = Record<string, number>;
type RuneInventoryMap = Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>>;
type SavedInventory = {
  materials?: CountMap;
  runes?: RuneInventoryMap;
  [k: string]: unknown;
};

const EMPTY_STATE: TowerState = {
  progress: { highestFloor: 0, claimedMilestones: [] },
  run: null,
  daily: null,
};

async function readKv<T>(
  tx: DbExecutor,
  userId: string,
  key: string,
  lock: boolean,
): Promise<T | null> {
  const q = tx
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)));
  const rows = lock ? await q.for("update") : await q.limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

export type TowerAutoSummary = {
  /** 자동 시작 시점의 층 (포함). */
  startFloor: number;
  /** 자동 종료 시점의 currentFloor (다음에 싸울 층 / 사망 시 사라진 마지막 시도 층). */
  endFloor: number;
  /** 자동 안에서 클리어된 잡몹층 수. */
  floorsCleared: number;
  /** 자동이 멈춘 사유. */
  reason: "next_is_boss" | "revive_used" | "death";
  /** 자동 안에서 첫 도달로 수령한 마일스톤 누계. */
  milestones: { floor: number; reward: TowerMilestoneReward }[];
};

export type TowerOutcome = {
  tower: TowerState;
  /** 마일스톤 보상으로 갱신된 character.v2 (없으면 미동봉). */
  character?: SavedCharacter;
  /** 마일스톤 보상으로 갱신된 inventory.v2 (없으면 미동봉). */
  inventory?: SavedInventory;
  applied: TowerApplied;
  /** fight_floor / fight_floors_auto 시 동봉 — BattleScene 이 마지막 전투를 그대로 렌더. */
  battle?: {
    finalState: BattleState;
    enemyName: string;
    isBoss: boolean;
  };
  /** fight_floors_auto 시에만 동봉 — 묶음 진행 요약. */
  auto?: TowerAutoSummary;
};

/** 클라/route 가 사용하는 의도형 액션. outcome 은 서버가 결정. */
export type TowerRequestAction =
  | { kind: "start"; startFloor?: number }
  | { kind: "fight_floor" }
  | { kind: "fight_floors_auto" }
  | { kind: "forfeit" };

/** 트랜잭션 안에서 호출. tower.v1 잠금 + (필요 시) character.v2 / inventory.v2 갱신. */
export async function applyTowerAction(
  tx: DbExecutor,
  userId: string,
  action: TowerRequestAction,
): Promise<TowerOutcome> {
  if (action.kind === "fight_floors_auto") {
    return applyTowerAutoProgress(tx, userId);
  }

  const state =
    (await readKv<TowerState>(tx, userId, TOWER_STORAGE_KEY, true)) ?? EMPTY_STATE;

  // fight_floor 는 서버가 직접 전투를 돌려 outcome 을 결정.
  let battle: TowerOutcome["battle"];
  let computeAction: TowerAction;
  if (action.kind === "fight_floor") {
    if (!state.run) throw new TowerError("no_active_run");
    const floor = state.run.currentFloor;
    const derived = await derivePlayerCombatFromSaves(userId, tx);
    if (!derived) throw new TowerError("character_not_found");
    // 고탑은 특수 콘텐츠 → 선택한 전술 적용(전 층).
    const player = applyStance(derived.player, derived.selectedStance);
    // 클라 ready 화면과 동일한 적과 싸우도록 upcomingEnemy 가 있으면 사용.
    // 옛 런(upcomingEnemy 없음) 은 즉시 픽 — 그 한 번은 mismatch 가능.
    const enemy = buildFloorEnemy(floor, state.run.upcomingEnemy);
    const resolution = resolveBattle(player, enemy, "player", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      isBoss: isBossFloor(floor),
      openingNote: stanceBattleLogText(derived.selectedStance) ?? undefined,
    });
    battle = {
      finalState: resolution.finalState,
      enemyName: enemy.name,
      isBoss: isBossFloor(floor),
    };
    computeAction = {
      kind: "fight_floor",
      outcome: resolution.outcome === "win" ? "win" : "lose",
    };
  } else {
    computeAction = action;
  }

  const computed: TowerComputeResult = computeTowerOutcome(
    { state, today: todayKey() },
    computeAction,
  );

  // 보스층 클리어 시 매번 굴리는 룬·토큰 드롭. 마일스톤과 무관하게 매 클리어 적용.
  // computeAction 이 fight_floor 이고 win 인 케이스에만 — 그 외엔 빈 보상.
  let bossDrops: { floor: number; reward: BossClearReward } | undefined;
  if (
    computeAction.kind === "fight_floor" &&
    computeAction.outcome === "win" &&
    isBossFloor(state.run!.currentFloor)
  ) {
    const clearedFloor = state.run!.currentFloor;
    bossDrops = { floor: clearedFloor, reward: rollBossClearReward(clearedFloor) };
  }

  // 새로 진입한 currentFloor 에 대한 upcomingEnemy 채우기 — start / fight_floor(win)
  // 모두 새 층 진입이므로 클라 ready 화면용 픽이 필요. forfeit/lose 는 run=null 이라 no-op.
  const result: TowerComputeResult = {
    ...computed,
    state: withUpcomingEnemy(computed.state),
  };

  await upsertSave(tx, userId, TOWER_STORAGE_KEY, result.state);

  // 주간 최고층 갱신 — fight_floor 승리 시점에 lazy reset 포함. start/forfeit 무관.
  if (
    computeAction.kind === "fight_floor" &&
    computeAction.outcome === "win"
  ) {
    const clearedFloor = state.run!.currentFloor;
    const prev =
      (await readKv<TowerWeekly>(tx, userId, TOWER_WEEKLY_STORAGE_KEY, true)) ??
      null;
    const nextWeekly = updateTowerWeekly(prev, clearedFloor);
    if (nextWeekly) {
      await upsertSave(tx, userId, TOWER_WEEKLY_STORAGE_KEY, nextWeekly);
    }
  }

  // 마일스톤 보상 + 보스 드롭 — gold/material/rune 을 한 번에 모아 character/inventory 갱신.
  let character: SavedCharacter | undefined;
  let inventory: SavedInventory | undefined;

  const milestone = result.applied.milestone;
  const totalGold = milestone?.reward.gold ?? 0;
  const totalMaterials: CountMap = {};
  for (const m of milestone?.reward.materials ?? []) {
    totalMaterials[m.id] = (totalMaterials[m.id] ?? 0) + m.count;
  }
  if (bossDrops) {
    if (bossDrops.reward.tokens > 0) {
      totalMaterials["tower_token"] =
        (totalMaterials["tower_token"] ?? 0) + bossDrops.reward.tokens;
    }
  }

  if (totalGold > 0) {
    const cur = (await readKv<SavedCharacter>(tx, userId, "character.v2", true)) ?? {};
    character = { ...cur, gold: (cur.gold ?? 0) + totalGold };
    await upsertSave(tx, userId, "character.v2", character);
  }

  const runeDrops = bossDrops?.reward.runes ?? [];
  if (Object.keys(totalMaterials).length > 0 || runeDrops.length > 0) {
    const cur = (await readKv<SavedInventory>(tx, userId, "inventory.v2", true)) ?? {};
    const materials: CountMap = { ...(cur.materials ?? {}) };
    for (const [id, n] of Object.entries(totalMaterials)) {
      materials[id] = (materials[id] ?? 0) + n;
    }
    const runes: RuneInventoryMap = { ...(cur.runes ?? {}) };
    for (const d of runeDrops) {
      const idMap = { ...(runes[d.id] ?? {}) };
      idMap[d.grade] = (idMap[d.grade] ?? 0) + d.count;
      runes[d.id] = idMap;
    }
    inventory = { ...cur, materials, runes };
    await upsertSave(tx, userId, "inventory.v2", inventory);
  }

  const applied = bossDrops
    ? { ...result.applied, bossDrops }
    : result.applied;

  return { tower: result.state, character, inventory, applied, battle };
}

/**
 * "다음 보스까지 자동" — 잡몹층을 server-side 루프로 연달아 클리어하다가 보스층 직전에서 멈춘다.
 *   - 자동 도중 사망: run.reviveAvailable 이 true 면 1회 부활(run 유지)하고 거기서 멈춰 수동 모드로 복귀.
 *     이미 false 면 일반 사망 처리 (run 종료).
 *   - 자동 도중 보스층 도달: 그 직전 잡몹 승리에서 멈춤 (보스는 수동).
 *   - 마일스톤 보상은 누적해서 한 트랜잭션 안에 character/inventory 에 합산 반영.
 *
 * 시작 층이 이미 보스면 at_boss 에러 — UI 는 그 경우 버튼을 노출하지 않는다.
 */
async function applyTowerAutoProgress(
  tx: DbExecutor,
  userId: string,
): Promise<TowerOutcome> {
  let state =
    (await readKv<TowerState>(tx, userId, TOWER_STORAGE_KEY, true)) ?? EMPTY_STATE;
  if (!state.run) throw new TowerError("no_active_run");
  if (isBossFloor(state.run.currentFloor)) throw new TowerError("at_boss");

  const derived = await derivePlayerCombatFromSaves(userId, tx);
  if (!derived) throw new TowerError("character_not_found");
  // 고탑은 특수 콘텐츠 → 선택한 전술 적용(전 층).
  const player = applyStance(derived.player, derived.selectedStance);

  const startFloor = state.run.currentFloor;
  let lastBattle: TowerOutcome["battle"];
  const milestones: TowerAutoSummary["milestones"] = [];
  let floorsCleared = 0;
  let reason: TowerAutoSummary["reason"] = "death";

  // 안전 한도 — 한 보스 구간(10층)을 넘어 도는 일이 없도록 1.5배 잡음.
  const MAX_ITERATIONS = Math.ceil(TOWER_BOSS_INTERVAL * 1.5);
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    if (!state.run) break;
    const floor = state.run.currentFloor;
    // 첫 iteration 은 클라가 봤던 upcomingEnemy 와 일치시키고, 이후엔 매 iteration
    // 마다 새 currentFloor 라 자연스럽게 random 픽. (computeFightFloor 가 upcomingEnemy
    // 를 비워 다음 iteration 진입 시 없음 상태.)
    const enemy = buildFloorEnemy(floor, state.run.upcomingEnemy);
    const resolution = resolveBattle(player, enemy, "player", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      isBoss: false, // 자동은 잡몹만 — 보스 직전에 break.
    });
    lastBattle = {
      finalState: resolution.finalState,
      enemyName: enemy.name,
      isBoss: false,
    };

    const step = applyAutoStep(
      { state, today: todayKey() },
      resolution.outcome === "win" ? "win" : "lose",
    );
    state = step.state;
    if (resolution.outcome === "win") floorsCleared += 1;
    if (step.milestone) milestones.push(step.milestone);
    if (step.reason) {
      reason = step.reason;
      break;
    }
  }

  // 자동 종료 시점에 state.run 이 살아 있고 잡몹층 위에 있으면 클라 다음 ready 화면용
  // upcomingEnemy 를 채워둔다. (next_is_boss: 보스층이라 미저장 / death: run=null / revive_used:
  // 그 자리 잡몹층에서 멈춤.)
  state = withUpcomingEnemy(state);

  await upsertSave(tx, userId, TOWER_STORAGE_KEY, state);

  // 주간 최고층 갱신 — 자동 진행 동안 가장 높이 클리어한 층 기준.
  // 자동은 잡몹만 — boss floor 가 currentFloor 가 되어 break 한 시점에 (그 직전 잡몹층) 까지 클리어.
  if (floorsCleared > 0) {
    const lastClearedFloor = startFloor + floorsCleared - 1;
    const prev =
      (await readKv<TowerWeekly>(tx, userId, TOWER_WEEKLY_STORAGE_KEY, true)) ??
      null;
    const nextWeekly = updateTowerWeekly(prev, lastClearedFloor);
    if (nextWeekly) {
      await upsertSave(tx, userId, TOWER_WEEKLY_STORAGE_KEY, nextWeekly);
    }
  }

  // 마일스톤 누계를 한 번에 character/inventory 에 반영.
  let character: SavedCharacter | undefined;
  let inventory: SavedInventory | undefined;
  const totalGold = milestones.reduce((s, m) => s + (m.reward.gold ?? 0), 0);
  const totalMaterials: CountMap = {};
  for (const m of milestones) {
    for (const mat of m.reward.materials ?? []) {
      totalMaterials[mat.id] = (totalMaterials[mat.id] ?? 0) + mat.count;
    }
  }
  if (totalGold > 0) {
    const cur = (await readKv<SavedCharacter>(tx, userId, "character.v2", true)) ?? {};
    character = { ...cur, gold: (cur.gold ?? 0) + totalGold };
    await upsertSave(tx, userId, "character.v2", character);
  }
  if (Object.keys(totalMaterials).length > 0) {
    const cur = (await readKv<SavedInventory>(tx, userId, "inventory.v2", true)) ?? {};
    const materials: CountMap = { ...(cur.materials ?? {}) };
    for (const [id, n] of Object.entries(totalMaterials)) {
      materials[id] = (materials[id] ?? 0) + n;
    }
    inventory = { ...cur, materials };
    await upsertSave(tx, userId, "inventory.v2", inventory);
  }

  // 종료 시점의 currentFloor — 살아남았으면 run.currentFloor (다음 싸울 층), 죽었으면 마지막 시도 층.
  const endFloor = state.run?.currentFloor ?? startFloor + floorsCleared;

  return {
    tower: state,
    character,
    inventory,
    applied: {
      kind: "fight_floors_auto",
      currentFloor: state.run?.currentFloor,
      // 마지막 outcome — next_is_boss 면 승리로 끝남, 그 외(revive/death)는 패배로 끝남.
      outcome: reason === "next_is_boss" ? "win" : "lose",
    },
    battle: lastBattle,
    auto: {
      startFloor,
      endFloor,
      floorsCleared,
      reason,
      milestones,
    },
  };
}

// 층 → 그 층에서 만나는 적 Monster (이름·스탯 모두 결정). 보스층은 보스 슬롯의 베이스 +
// bossMultiplier, 잡몹층은 upcomingEnemy 가 있으면 그걸 사용 (클라 ready 화면과 일치),
// 없으면 풀에서 균등 무작위 선택. 주간 모디파이어가 있으면 스탯 마지막에 곱해진다.
function buildFloorEnemy(
  floor: number,
  upcoming?: { name: string },
): Monster {
  const modifier = currentWeeklyModifier();
  const slot = bossSlotForFloor(floor);
  if (slot) {
    const base = bossBaseMonster(slot);
    const s = scaledStats(base, floor, slot.bossMultiplier, modifier);
    return { ...base, name: bossDisplayName(slot), hp: s.hp, atk: s.atk, def: s.def, spd: s.spd };
  }
  const pool = mobPoolForFloor(floor);
  let baseName: string;
  if (upcoming?.name && MONSTERS[upcoming.name]) {
    baseName = upcoming.name;
  } else if (pool.length === 0) {
    baseName = bossBaseMonster(BOSS_SLOTS[0]).name;
  } else {
    baseName = pickMobFromPool(pool);
  }
  const base = MONSTERS[baseName] ?? MONSTERS[pool[0]] ?? bossBaseMonster(BOSS_SLOTS[0]);
  const s = scaledStats(base, floor, 1, modifier);
  return { ...base, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd };
}

/**
 * state.run 이 활성이고 currentFloor 가 잡몹층인데 upcomingEnemy 가 비어 있으면
 * 풀에서 균등 무작위로 픽해 채운다. 클라 ready 화면이 그걸 그대로 표시 →
 * 다음 fight_floor 가 같은 적과 싸우게 된다 (mismatch 차단).
 *
 * 보스층은 결정적이라 미저장. 풀이 비어 있어도 미저장 (그 경우 buildFloorEnemy 가 폴백).
 */
function withUpcomingEnemy(state: TowerState): TowerState {
  if (!state.run) return state;
  const floor = state.run.currentFloor;
  if (isBossFloor(floor)) {
    // 보스층 — 잔여 값 정리.
    if (state.run.upcomingEnemy == null) return state;
    return { ...state, run: { ...state.run, upcomingEnemy: undefined } };
  }
  if (state.run.upcomingEnemy) return state;
  const pool = mobPoolForFloor(floor);
  if (pool.length === 0) return state;
  const name = pickMobFromPool(pool);
  return { ...state, run: { ...state.run, upcomingEnemy: { name } } };
}

export { TowerError };
