import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { monsterGoldReward } from "@/adventure/battle/monsterGold";
import { applyExpGain } from "@/lib/leveling";
import { MONSTERS } from "@/adventure/data/monsters";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";

// POST /api/v2/dungeon/hunt — 던전 한 번 사냥 intent.
//
// 본문: { floor: 1 | 2 | 3 | 4 | 5 }
// 서버 권위:
//   1. character.v2 잠금 + stamina 회복 + HUNT_COST 차감.
//   2. derive PlayerCombat (장비/스킬/룬/부여/파라곤 반영).
//   3. floor 의 enemies 에서 균등 random pick.
//   4. resolveBattle 단판 sim.
//   5. 승리 시 monster.exp 만큼 exp gain — applyExpGain 으로 level up 처리.
//   6. 패배 시 보상 0. hp 처리는 다음 PR (지금은 character.hp 변경 안 함).
//   7. character.v2 save.
//
// 단순화 (다음 PR 에서 발전):
//   - gold 보상 0 (monsterGold 통합 후속)
//   - 사망/부활 처리 없음 (hp 변경 안 함)
//   - drop / material 적용 없음
//   - playerName placeholder "모험가"

const VALID_FLOORS = [1, 2, 3, 4, 5] as const;

function pickRandomEnemy(enemies: readonly string[]): string | null {
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
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
  if (
    typeof body.floor !== "number" ||
    !(VALID_FLOORS as readonly number[]).includes(body.floor)
  ) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const floor = body.floor;
  const floorData = MAIN_DUNGEON.floors.find((f) => f.id === floor);
  if (!floorData) {
    return Response.json({ ok: false, error: "bad_floor" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      stamina?: unknown;
      hp?: number;
      hpRegenSince?: number;
      level?: number;
      exp?: number;
      gold?: number;
      [k: string]: unknown;
    }>(tx, userId, "character.v2", {});

    const now = Date.now();
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const afterStamina = tryConsume(stamina, HUNT_COST, now);
    if (!afterStamina) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    const player = await derivePlayerCombatFromSaves(userId, tx);
    if (!player) {
      return {
        ok: false as const,
        status: 400,
        body: {
          ok: false as const,
          error: "no_character" as const,
          stamina: afterStamina,
        },
      };
    }

    const enemyName = pickRandomEnemy(floorData.enemies);
    if (!enemyName) {
      return {
        ok: false as const,
        status: 400,
        body: {
          ok: false as const,
          error: "empty_floor" as const,
          stamina: afterStamina,
        },
      };
    }
    const enemyMonster = MONSTERS[enemyName];
    if (!enemyMonster) {
      return {
        ok: false as const,
        status: 500,
        body: {
          ok: false as const,
          error: "monster_not_found" as const,
          stamina: afterStamina,
        },
      };
    }

    // 전투 로그에 박을 캐릭 이름 — character-profile.v2 의 name. 없으면 "모험가".
    const profileRow = await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
      )
      .limit(1);
    const profile = (profileRow[0]?.value ?? null) as { name?: string } | null;
    const playerName = profile?.name?.trim() || "모험가";

    // 사냥 전 hp 회복 — 마지막 사냥 이후 흐른 시간만큼 충전.
    const hpBefore = parseHpRegenSince(charSave.hpRegenSince, now);
    const regenResult = applyHpRegen(
      Math.max(0, charSave.hp ?? player.maxHp),
      player.maxHp,
      hpBefore,
      now,
    );
    const playerForBattle = { ...player.player, hp: regenResult.hp };

    const battleResult = resolveBattle(
      playerForBattle,
      enemyMonster,
      playerName,
      {
        pickAction: (state) =>
          pickAutoAction(state, { rules: [], potions: {} }),
        potions: {},
      },
    );

    const won = battleResult.outcome === "win";
    // 라이브 BASE_GOLD_RATE 그대로 — paragon/부여 곱은 다음 PR.
    const expGained = won ? enemyMonster.exp : 0;
    const goldGained = won ? monsterGoldReward(enemyMonster) : 0;

    const curLevel = Math.max(1, charSave.level ?? 1);
    const curExp = Math.max(0, charSave.exp ?? 0);
    const expResult = applyExpGain(curLevel, curExp, expGained);

    const newGold = Math.max(0, (charSave.gold ?? 0) + goldGained);

    // 사냥 후 hp — finalState.playerHp 그대로 적용 (사망 시 0).
    // 0 이면 다음 사냥 전까지 시간 회복으로 만피까지 채워짐.
    const afterHp = Math.max(0, battleResult.finalState.playerHp);

    const next = {
      ...charSave,
      stamina: afterStamina,
      hp: afterHp,
      hpRegenSince: now,
      level: expResult.level,
      exp: expResult.exp,
      gold: newGold,
    };
    await upsertSave(tx, userId, "character.v2", next);

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        stamina: afterStamina,
        result: {
          floor,
          enemyName,
          won,
          expGained,
          goldGained,
          levelsGained: expResult.levelsGained,
          turns: battleResult.turns,
          hpBefore: regenResult.hp,
          hpAfter: afterHp,
          maxHp: player.maxHp,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
