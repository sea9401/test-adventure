import type { Monster } from "@/adventure/data/monsters/types";
import { enemiesForDepth } from "@/adventure/data/v2/dungeon";
import {
  gridDungeonCombatDepth,
  gridDungeonRoomGold,
  isGridDungeonCombatTile,
  rollGridDungeonDrops,
  type GridDungeonResolvedCombat,
  type GridDungeonRouteId,
  type GridDungeonSupporterSnapshot,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import {
  GRID_DUNGEON_PARTY_SCALING,
  makeGridDungeonPartyActor,
  resolveGridDungeonPartyCombat,
} from "@/adventure/data/v2/gridDungeonCombat";
import { gridDungeonSoloCombatLog } from "@/adventure/data/v2/gridDungeonCombatLog";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { smartDefaultPatternFromEquipped } from "@/adventure/data/v2/v2Skills";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { type CharSave } from "./gridDungeonSupport";
import { type DbExecutor } from "./savesKv";
import { prepareV2BattleActor } from "./v2BattlePrep";

export function pickGridDungeonEnemy(routeId: GridDungeonRouteId, tile: GridDungeonTileKind) {
  const depth = gridDungeonCombatDepth(routeId, tile);
  const pool = enemiesForDepth(depth);
  if (pool.length === 0) return null;
  const index = tile === "boss" ? pool.length - 1 : tile === "elite" ? 2 : 0;
  return { depth, enemy: pool[Math.min(index, pool.length - 1)] };
}


export async function resolveGridDungeonCombat({
  tx,
  userId,
  charSave,
  supporters,
  frontlineId,
  tile,
  routeId,
  runHp,
  runMaxHp,
}: {
  tx: DbExecutor;
  userId: string;
  charSave: CharSave;
  supporters: GridDungeonSupporterSnapshot[];
  frontlineId: string;
  tile: GridDungeonTileKind;
  routeId: GridDungeonRouteId;
  runHp: number;
  runMaxHp: number;
}): Promise<GridDungeonResolvedCombat | null> {
  if (!isGridDungeonCombatTile(tile)) return null;
  const picked = pickGridDungeonEnemy(routeId, tile);
  if (!picked) return null;
  const baseMonster = V2_MONSTERS[picked.enemy.key];
  if (!baseMonster) return null;

  const preparedActor = await prepareV2BattleActor({
    tx,
    userId,
    charSave,
    deriveSkills: "sanitized",
  });
  if (!preparedActor) return null;
  const { player, skills: v2Skills } = preparedActor;

  const seededMonsterSkills = [
    picked.enemy.statusSkill,
    picked.enemy.castSkill,
  ].filter((s): s is NonNullable<typeof s> => s != null);
  const scaledEnemy = scaleMonsterForFloor(baseMonster, picked.depth);
  const enemyMonster: Monster = {
    ...scaledEnemy,
    name:
      tile === "boss"
        ? "유적의 파수꾼"
        : tile === "elite"
          ? "정예 수문장"
          : picked.enemy.name,
    image: picked.enemy.image ?? baseMonster.image,
    element: "neutral",
    ...(seededMonsterSkills.length
      ? {
          v2Skills: {
            learned: seededMonsterSkills,
            equipped: seededMonsterSkills,
          },
        }
      : {}),
  };
  const playerMaxHp = Math.max(1, Math.floor(runMaxHp || player.maxHp));
  const playerHpBefore = Math.max(
    1,
    Math.min(playerMaxHp, Math.floor(runHp || playerMaxHp)),
  );
  const playerForBattle = {
    ...player.player,
    hp: playerHpBefore,
    maxHp: playerMaxHp,
    mp: player.player.maxMp ?? player.player.mp,
  };
  const mainPattern =
    v2Skills.pattern && v2Skills.pattern.blocks.length > 0
      ? v2Skills.pattern
      : smartDefaultPatternFromEquipped(v2Skills.equipped);
  const partyResult =
    supporters.length > 0
      ? resolveGridDungeonPartyCombat({
          main: makeGridDungeonPartyActor({
            id: userId,
            name: "나",
            maxHp: playerMaxHp,
            hp: playerHpBefore,
            mp: playerForBattle.mp ?? playerForBattle.maxMp ?? 0,
            maxMp: playerForBattle.maxMp ?? playerForBattle.mp ?? 0,
            atk: Math.max(1, playerForBattle.atk),
            magicAtk: Math.max(0, playerForBattle.magicAtk ?? 0),
            str: Math.max(0, playerForBattle.strStat ?? 0),
            int: Math.max(0, playerForBattle.intStat ?? 0),
            spi: Math.max(0, playerForBattle.spiStat ?? 0),
            def: Math.max(0, playerForBattle.def),
            spd: Math.max(1, playerForBattle.spd),
            healMult: playerForBattle.healMult ?? 1,
            isMain: true,
            skills: v2Skills.equipped,
            pattern: mainPattern,
          }),
          supporters,
          enemy: enemyMonster,
          frontlineId,
          scaling: GRID_DUNGEON_PARTY_SCALING[tile] ?? {
            hpPerSupporter: 0.45,
            atkPerSupporter: 0.16,
          },
        })
      : null;
  const soloResult = partyResult
    ? null
    : resolveBattle(playerForBattle, enemyMonster, "모험가", {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      depth: picked.depth,
      isBoss: tile === "boss",
    });
  const won = partyResult
    ? partyResult.outcome === "win"
    : soloResult?.outcome === "win";
  const rewardGold = won ? gridDungeonRoomGold(routeId, tile) : 0;
  const drops = won ? rollGridDungeonDrops(tile, Math.random, routeId) : {};
  const playerHpAfter = partyResult
    ? partyResult.playerHpAfter
    : (soloResult?.finalState.playerHp ?? 0);
  const enemyHpAfter = partyResult
    ? partyResult.enemyHp
    : (soloResult?.finalState.enemyHp ?? 0);
  const enemyMaxHp = partyResult ? partyResult.enemyMaxHp : enemyMonster.hp;
  const combatLog = partyResult
    ? partyResult.log
    : gridDungeonSoloCombatLog(soloResult?.finalState.log ?? [], 4);
  const hpLost = won
    ? Math.max(0, playerHpBefore - playerHpAfter)
    : playerHpBefore;
  const enemyName = enemyMonster.name;
  const message = won
    ? tile === "boss"
      ? `${enemyName}을(를) 쓰러뜨렸습니다. 출구가 열렸습니다.`
      : `${enemyName}을(를) 쓰러뜨렸습니다.`
    : `${enemyName}과의 전투에서 밀려 탐험을 이어갈 수 없습니다.`;

  return {
    outcome: won ? "win" : "lose",
    hpLost,
    rewardGold,
    drops,
    message,
    summary: {
      enemyName,
      outcome: won ? "win" : "lose",
      turns: partyResult?.turns ?? soloResult?.turns ?? 0,
      hpLost,
      playerHpBefore,
      playerHpAfter: Math.max(0, playerHpAfter),
      playerMaxHp,
      enemyHp: Math.max(0, enemyHpAfter),
      enemyMaxHp: Math.max(1, enemyMaxHp),
      rewardGold,
      ...(partyResult ? { party: partyResult.party } : {}),
      log: combatLog,
    },
  };
}
