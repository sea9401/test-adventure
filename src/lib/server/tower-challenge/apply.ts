// 고탑 도전 모드 서버측 적용 — tower/apply.ts 의 부분집합.
//
// 일반 탑과 다른 점:
//   - 키: tower-challenge.v1 (별도).
//   - 스케일링: scaledStats 에 TOWER_CHALLENGE_MODIFIER (1.5× HP/ATK/DEF) 주입. 주간 모디파이어 미적용.
//   - 마일스톤/룬·토큰 드롭 없음 — character/inventory 갱신 분기 없음.
//   - F50 보스 클리어 시 tower_challenge_f50 칭호 부여 (adventure-log.v2 merge).
//
// 트랜잭션 / pickAutoAction / derivePlayerCombat / resolveBattle 패턴은 tower/apply.ts 와 동일.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  resolveBattle,
  type BattleState,
} from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import type { Monster } from "@/adventure/data/monsters";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  TOWER_CHALLENGE_STORAGE_KEY,
  TOWER_CHALLENGE_TITLE_FLOOR,
  TOWER_CHALLENGE_TITLE_ID,
  type TowerChallengeState,
} from "@/adventure/tower/challengeTypes";
import { isBossFloor, scaledStats } from "@/adventure/tower/scaling";
import { TOWER_CHALLENGE_MODIFIER } from "@/adventure/tower/challengeScaling";
import {
  BOSS_SLOTS,
  bossBaseMonster,
  bossDisplayName,
  bossSlotForFloor,
  mobPoolForFloor,
  pickMobFromPool,
} from "@/adventure/tower/floorPools";
import {
  TowerChallengeError,
  computeTowerChallengeOutcome,
  isChallengeBossClear,
  todayKey,
  type TowerChallengeAction,
  type TowerChallengeApplied,
  type TowerChallengeComputeResult,
} from "./compute";

const EMPTY_STATE: TowerChallengeState = {
  progress: { highestFloor: 0 },
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

export type TowerChallengeOutcome = {
  challenge: TowerChallengeState;
  applied: TowerChallengeApplied;
  /** fight_floor 시 동봉 — BattleScene 이 마지막 전투를 그대로 렌더. */
  battle?: {
    finalState: BattleState;
    enemyName: string;
    isBoss: boolean;
  };
};

/** 클라/route 가 사용하는 의도형 액션. outcome 은 서버가 결정. */
export type TowerChallengeRequestAction =
  | { kind: "start" }
  | { kind: "fight_floor" }
  | { kind: "forfeit" };

export async function applyTowerChallengeAction(
  tx: DbExecutor,
  userId: string,
  action: TowerChallengeRequestAction,
): Promise<TowerChallengeOutcome> {
  const state =
    (await readKv<TowerChallengeState>(tx, userId, TOWER_CHALLENGE_STORAGE_KEY, true)) ??
    EMPTY_STATE;

  let battle: TowerChallengeOutcome["battle"];
  let computeAction: TowerChallengeAction;
  let clearedFloor = 0;

  if (action.kind === "fight_floor") {
    if (!state.run) throw new TowerChallengeError("no_active_run");
    const floor = state.run.currentFloor;
    clearedFloor = floor;
    const derived = await derivePlayerCombatFromSaves(userId, tx);
    if (!derived) throw new TowerChallengeError("character_not_found");
    const enemy = buildChallengeFloorEnemy(floor, state.run.upcomingEnemy);
    const resolution = resolveBattle(derived.player, enemy, "player", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      isBoss: isBossFloor(floor),
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

  const computed: TowerChallengeComputeResult = computeTowerChallengeOutcome(
    { state, today: todayKey() },
    computeAction,
  );

  // F50 보스 클리어 시 단일 칭호 부여 — adventure-log.v2 merge. idempotent.
  let grantedTitleId: string | undefined;
  if (
    isChallengeBossClear(computed.applied, clearedFloor) &&
    clearedFloor === TOWER_CHALLENGE_TITLE_FLOOR
  ) {
    const granted = await grantTitleIfMissingInTx(
      tx,
      userId,
      TOWER_CHALLENGE_TITLE_ID,
      Date.now(),
    );
    if (granted) grantedTitleId = TOWER_CHALLENGE_TITLE_ID;
  }

  // 새 층의 upcomingEnemy 채우기 — start / fight_floor(win) 후. forfeit/lose 는 run=null.
  const finalState = withUpcomingEnemy(computed.state);
  await upsertSave(tx, userId, TOWER_CHALLENGE_STORAGE_KEY, finalState);

  const applied = grantedTitleId
    ? { ...computed.applied, grantedTitleId }
    : computed.applied;

  return { challenge: finalState, applied, battle };
}

/** 1.5× 도전 스케일링 적용. tower/apply.ts:buildFloorEnemy 의 도전 모드 미러. */
function buildChallengeFloorEnemy(
  floor: number,
  upcoming?: { name: string },
): Monster {
  const modifier = TOWER_CHALLENGE_MODIFIER;
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

function withUpcomingEnemy(state: TowerChallengeState): TowerChallengeState {
  if (!state.run) return state;
  const floor = state.run.currentFloor;
  if (isBossFloor(floor)) {
    if (state.run.upcomingEnemy == null) return state;
    return { ...state, run: { ...state.run, upcomingEnemy: undefined } };
  }
  if (state.run.upcomingEnemy) return state;
  const pool = mobPoolForFloor(floor);
  if (pool.length === 0) return state;
  const name = pickMobFromPool(pool);
  return { ...state, run: { ...state.run, upcomingEnemy: { name } } };
}

export { TowerChallengeError };
