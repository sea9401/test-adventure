import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import {
  applyExpGain,
  applyNewbieExpBonusByBattles,
  requiredExpToNext,
  XP_RATE_MULT,
} from "@/lib/leveling";
import {
  getFieldBoss,
  V2_BOSS_STAMINA_COST,
} from "@/adventure/data/v2/dungeonBosses";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  addPoints,
  addCumLevel,
  setGrown,
  emptyProficiency,
  V2_PROFICIENCY_PER_KILL,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { rollLevelGrowth } from "@/adventure/data/v2/statGrowth";
import { V2_STAT_KEYS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
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
import {
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import { mergeDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  genEquipIid,
  type EquipmentSave,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// POST /api/v2/dungeon/boss — 사냥터 필드 보스 도전.
//
// 본문: { floor: 1 | 2 }  — 그 사냥터에 보스(getFieldBoss)가 있어야 함.
// 서버 권위:
//   1. character.v2 잠금 + stamina 회복 + V2_BOSS_STAMINA_COST(20) 차감.
//   2. derive PlayerCombat → resolveBattle 단판 sim (보스 고정 스탯, scaleMonsterForFloor 미적용).
//   3. 승리하면: exp + 보장 재료 + 숙련도/킬로그 (쿨다운 없음 — 매 승리 지급, 무거운 스태미너가
//      도전 빈도를 throttle). 첫 처치면 칭호도(grantTitle 멱등, granted 반환으로 첫 처치 판정).
//
// hunt 와의 차이: 거점/세금 없음, 장비·유니크·조각 드랍 없음, 골드 없음. 일일 게이트/저장 없음.

const VALID_FLOORS = [1, 2] as const;
function isValidFloor(n: number): n is DungeonFloorId {
  return (VALID_FLOORS as readonly number[]).includes(n);
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { floor?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.floor !== "number" || !isValidFloor(body.floor)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const floor = body.floor;
  const boss = getFieldBoss(floor);
  if (!boss) {
    return Response.json({ ok: false, error: "no_boss" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    type CharSave = {
      stamina?: unknown;
      hp?: number;
      hpRegenSince?: number;
      level?: number;
      exp?: number;
      gold?: number;
      materials?: unknown;
      element?: unknown;
      class?: unknown;
      [k: string]: unknown;
    };

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    // equipment.v2 조기 잠금 — 락 순서 hunt 와 일관(character → equipment). 보스 장비 드랍 기록용.
    const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned: ownedEquip, equipped: equippedEquip } =
      parseEquipmentSave(equipmentSave);

    const now = Date.now();
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const afterStamina = tryConsume(stamina, V2_BOSS_STAMINA_COST, now);
    if (!afterStamina) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    const player = await derivePlayerCombatV2(userId, tx);
    if (!player) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "no_character" as const,
          stamina: afterStamina,
        },
      };
    }

    // 속성 상성 — 보스는 무속성(neutral)이라 ±0 이지만 hunt 와 동일 경로로 처리.
    const playerElement = parseV2Element(charSave.element);
    const basicAttackElement: V2Element =
      player.weaponElement !== "neutral" ? player.weaponElement : playerElement;
    const monsterElement: V2Element = boss.monster.element ?? "neutral";
    const playerElemMult = elementDamageMult(basicAttackElement, monsterElement);
    const monsterElemMult = elementDamageMult(monsterElement, playerElement);
    const playerElemMatchup = elementMatchup(basicAttackElement, monsterElement);

    const enemyMonster = {
      ...boss.monster,
      atk: Math.max(1, Math.round(boss.monster.atk * monsterElemMult)),
      name: boss.name,
      image: boss.image ?? boss.monster.image,
      element: monsterElement,
    };

    const profileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const profile = (profileRow[0]?.value ?? null) as { name?: string } | null;
    const playerName = profile?.name?.trim() || "모험가";

    // 사냥 전 hp 회복.
    const hpBefore = parseHpRegenSince(charSave.hpRegenSince, now);
    const regenResult = applyHpRegen(
      Math.max(0, charSave.hp ?? player.maxHp),
      player.maxHp,
      hpBefore,
      now,
    );
    if (!canHuntWithHp(regenResult.hp, player.maxHp)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "hp_zero" as const,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    const playerForBattle = {
      ...player.player,
      hp: regenResult.hp,
      mp: player.player.maxMp ?? 0,
      atk: Math.max(1, Math.round(player.player.atk * playerElemMult)),
      magicAtk: Math.max(
        0,
        Math.round((player.player.magicAtk ?? 0) * playerElemMult),
      ),
      attackElement: basicAttackElement,
      characterElement: playerElement,
    };

    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const v2Skills = parseV2SkillsState(skillsRaw);

    const battleResult = resolveBattle(playerForBattle, enemyMonster, playerName, {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
    });
    const won = battleResult.outcome === "win";

    // 신참 보너스 판정용 누적 전적 (read-only 스냅샷).
    const logRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")),
      )
      .limit(1);
    const logVal = (logRow[0]?.value ?? null) as {
      monsters?: Record<string, { kills?: number }>;
      battleLosses?: number;
    } | null;
    const battleCount =
      Object.values(logVal?.monsters ?? {}).reduce(
        (sum, m) => sum + (m?.kills ?? 0),
        0,
      ) + (logVal?.battleLosses ?? 0);

    // 보상은 승리 시 매번 — 쿨다운 없음(무거운 스태미너 비용이 도전 빈도를 throttle).
    const baseExp = won
      ? applyNewbieExpBonusByBattles(boss.monster.exp, battleCount).gained
      : 0;
    const expGained = Math.round(baseExp * XP_RATE_MULT);
    const drops: DropResult = won ? { ...boss.reward.materials } : {};
    const nextMaterials = mergeDrops(charSave.materials, drops);

    // 보스 전용 완제품 장비 드랍 — 수집형(보유 id 제외 + 각자 chance). 승리 시만.
    // 둘 다 모으면 이후엔 재료만 떨어진다(리롤 그라인드 방지). 드랍 = 새 개체 + 새 굴림.
    const bossEquipDrops: V2EquipmentId[] = [];
    let nextOwned: V2EquipInstance[] = ownedEquip;
    if (won && boss.reward.equipment) {
      const ownedIds = new Set<V2EquipmentId>(ownedEquip.map((i) => i.id));
      for (const e of boss.reward.equipment) {
        if (ownedIds.has(e.id)) continue;
        if (Math.random() >= e.chance) continue;
        nextOwned = [
          ...nextOwned,
          {
            iid: genEquipIid(),
            id: e.id,
            roll: rollItemStats(V2_EQUIPMENT[e.id], Math.random),
          },
        ];
        ownedIds.add(e.id);
        bossEquipDrops.push(e.id);
      }
    }
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: equippedEquip,
    });

    const curLevel = Math.max(1, charSave.level ?? 1);
    const curExp = Math.max(0, charSave.exp ?? 0);
    const expResult = applyExpGain(curLevel, curExp, expGained);

    // 사냥 후 hp + 충전식 회복(hunt 와 동일).
    let afterHp = Math.max(0, battleResult.finalState.playerHp);
    const afterMp = player.player.maxMp ?? 0;
    const invSave = await lockSaveForUpdate<{
      hpCharges?: number;
      mpCharges?: number;
      [k: string]: unknown;
    }>(tx, userId, "inventory.v2", {});
    let hpCharges = Math.max(0, invSave.hpCharges ?? 0);
    if (afterHp > 0 && afterHp < player.maxHp && hpCharges > 0) {
      const need = player.maxHp - afterHp;
      const restore = Math.min(need, hpCharges);
      afterHp += restore;
      hpCharges -= restore;
    }
    await upsertSave(tx, userId, "inventory.v2", { ...invSave, hpCharges });

    const next = {
      ...charSave,
      stamina: afterStamina,
      hp: afterHp,
      mp: afterMp,
      hpRegenSince: now,
      level: expResult.level,
      exp: expResult.exp,
      materials: nextMaterials,
    };
    await upsertSave(tx, userId, "character.v2", next);

    // 승리 시 — 숙련도/킬로그/스탯성장 + 첫 처치 칭호. 쿨다운 없음(스태미너가 throttle)이라
    // 매 승리에 적용. 락 순서는 hunt 와 일관: character.v2 → (skills/inventory) → adventure-log.v2
    // → proficiency.v2. 둘을 뒤집으면 같은 유저가 hunt·boss 동시 실행 시 교착(데드락).
    let proficiencyGained = 0;
    let firstClear = false;
    let titleGranted: string | null = null;
    const statGains: Partial<Record<V2StatKey, number>> = {};
    if (won) {
      // 킬 카운터 — 보스 이름으로 누적 (랭킹 battleCount SUM 대상, 서버 단독 소유).
      const logSave = await lockSaveForUpdate<{
        monsters?: Record<
          string,
          {
            encountered?: boolean;
            kills?: number;
            firstSeenAt?: number;
            lastKilledAt?: number;
          }
        >;
        [k: string]: unknown;
      }>(tx, userId, "adventure-log.v2", {});
      const monsters = { ...(logSave.monsters ?? {}) };
      const prevMon = monsters[boss.name];
      monsters[boss.name] = {
        ...prevMon,
        encountered: true,
        kills: (prevMon?.kills ?? 0) + 1,
        firstSeenAt: prevMon?.firstSeenAt ?? now,
        lastKilledAt: now,
      };
      await upsertSave(tx, userId, "adventure-log.v2", { ...logSave, monsters });

      // 첫 처치 칭호 — grantTitle 멱등. granted=true 면 이번이 첫 처치(별도 저장 불필요).
      // adventure-log.v2 를 재잠금하나 바로 위에서 이미 잡아 no-op(락 순서 유지).
      const granted = await grantTitleIfMissingInTx(
        tx,
        userId,
        boss.firstClear.titleId,
        now,
      );
      if (granted) {
        firstClear = true;
        titleGranted = boss.firstClear.titleId;
      }

      const playerClass = parseV2Class(charSave.class);
      const group = tier1ClassOf(playerClass);
      const profSave = await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      );
      let prof = parseProficiencyForChar(profSave, charSave);
      if (group !== "none") {
        prof = addPoints(prof, group, V2_PROFICIENCY_PER_KILL);
        proficiencyGained = V2_PROFICIENCY_PER_KILL;
      }
      if (expResult.levelsGained > 0) {
        prof = addCumLevel(prof, group, expResult.levelsGained);
        const grownBefore = prof.grown;
        let grown = grownBefore;
        for (let i = 0; i < expResult.levelsGained; i++) {
          grown = rollLevelGrowth(grown, playerClass, prof, Math.random);
        }
        prof = setGrown(prof, grown);
        for (const k of V2_STAT_KEYS) {
          const d = (grown[k] ?? 0) - (grownBefore[k] ?? 0);
          if (d > 0) statGains[k] = d;
        }
      }
      await upsertSave(tx, userId, "proficiency.v2", prof);
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        stamina: afterStamina,
        result: {
          floor,
          enemyName: boss.name,
          won,
          isBoss: true as const,
          firstClear,
          titleGranted,
          expGained,
          proficiencyGained,
          goldGained: 0,
          goldGross: 0,
          goldTaxed: 0,
          levelsGained: expResult.levelsGained,
          statGains,
          turns: battleResult.turns,
          hpBefore: regenResult.hp,
          hpAfter: afterHp,
          maxHp: player.maxHp,
          playerElement,
          monsterElement,
          elementMatchup: playerElemMatchup,
          hpCharges,
          mpCharges: Math.max(0, invSave.mpCharges ?? 0),
          drops,
          bossEquipDrops,
          droppedEquipment: null,
          droppedUnique: null,
          fragmentDrop: 0,
          fragmentsTotal: 0,
          replay: toReplayPayload(battleResult.finalState, 200),
          startPlayerHp: regenResult.hp,
          expForBar: curExp,
          maxExpForBar: requiredExpToNext(curLevel) ?? curExp,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
