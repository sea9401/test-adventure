import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { monsterGoldReward } from "@/adventure/battle/monsterGold";
import { applyExpGain } from "@/lib/leveling";
import { MONSTERS } from "@/adventure/data/monsters";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import {
  mergeDrops,
  rollDrops,
  type DropResult,
} from "@/adventure/data/v2/dungeonDrops";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";

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
//   - 사망/부활 처리 없음 (사후 시간 회복으로 만피까지)
//   - playerName placeholder "모험가"
//   - drop 은 placeholder 풀 (`dungeonDrops.ts`) — 정식 재료 시스템 통째 교체 예정

const VALID_FLOORS = [1, 2, 3, 4, 5] as const;

function isValidFloor(n: number): n is DungeonFloorId {
  return (VALID_FLOORS as readonly number[]).includes(n);
}

function pickRandomEnemy(enemies: readonly string[]): string | null {
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { floor?: unknown; outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.floor !== "number" || !isValidFloor(body.floor)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const floor = body.floor;
  const floorData = MAIN_DUNGEON.floors.find((f) => f.id === floor);
  if (!floorData) {
    return Response.json({ ok: false, error: "bad_floor" }, { status: 400 });
  }

  // outpostId 는 선택적. 있으면 점령자 lookup + 골드 세금 transfer.
  // 없으면(또는 모르는 id) 세금 없이 사냥자가 100% gold.
  let outpostId: string | null = null;
  if (typeof body.outpostId === "string" && body.outpostId.length > 0) {
    if (OUTPOSTS.some((o) => o.id === body.outpostId)) {
      outpostId = body.outpostId;
    }
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
      lastHuntedOutpost?: unknown;
      ejectedFrom?: unknown;
      [k: string]: unknown;
    };

    // === 1. outpost 점령 조회 (FOR UPDATE) ===
    // v2 의 lock 순서 통일: outpost FOR UPDATE → ensureSoloGuild → character.v2.
    // FOR UPDATE 로 정책 게이트 평가와 세금 결정이 같은 스냅샷을 사용 — 점령자가
    // hunt 도중 정책을 바꿔도 이 hunt 는 진입 시점 정책으로 일관.
    let occRow:
      | {
          occupiedByUserId: string | null;
          occupiedByGuildId: number | null;
          policy: string;
          taxRate: string;
        }
      | null = null;
    if (outpostId) {
      occRow =
        (
          await tx
            .select()
            .from(outpostOccupations)
            .where(eq(outpostOccupations.outpostId, outpostId))
            .for("update")
            .limit(1)
        )[0] ?? null;
    }

    // === 2. 사냥자 길드 확인 (정책 게이트 + 세금 면제 판정용) ===
    const viewerGuildId = await ensureSoloGuild(tx, userId);

    // === 3. 정책 게이트 — 거부 시 즉시 403, stamina 차감/character.v2 lock 전. ===
    if (occRow) {
      const decision = evaluateOutpostEntry({
        policy: occRow.policy,
        occupiedByGuildId: occRow.occupiedByGuildId,
        viewerGuildId,
      });
      if (!decision.allowed) {
        return {
          ok: false as const,
          status: 403,
          body: {
            ok: false as const,
            error: "policy_blocked" as const,
            reason: decision.reason,
          },
        };
      }
    }

    // === 4. 세금 owner 결정 ===
    // 점령자가 본인이 아닌 다른 user 이고, 사냥자가 점령 길드 멤버가 아닐 때만
    // 세금 transfer. 같은 길드면 세금 면제(정책 게이트의 charge="none" 의미).
    // owner row 가 비어 있으면(가입했지만 캐릭 미생성) 고아 지급 위험 → skip.
    let taxOwnerId: string | null = null;
    let taxRate = 0;
    if (
      occRow &&
      occRow.occupiedByUserId &&
      occRow.occupiedByUserId !== userId
    ) {
      const isSameGuild =
        occRow.occupiedByGuildId != null &&
        occRow.occupiedByGuildId === viewerGuildId;
      if (!isSameGuild) {
        const probe = await tx
          .select({ key: savesKv.key })
          .from(savesKv)
          .where(
            and(
              eq(savesKv.userId, occRow.occupiedByUserId),
              eq(savesKv.key, "character.v2"),
            ),
          )
          .limit(1);
        if (probe.length > 0) {
          taxOwnerId = occRow.occupiedByUserId;
          taxRate = Math.max(0, Math.min(1, Number(occRow.taxRate) || 0));
        }
      }
    }

    // === 5. character.v2 lock — deadlock 방지 위해 두 user 모두 잠글 땐 userId 정렬 순서 ===
    let charSave: CharSave;
    let ownerSave: CharSave | null = null;
    if (taxOwnerId) {
      const ids = [userId, taxOwnerId].sort();
      const first = await lockSaveForUpdate<CharSave>(
        tx,
        ids[0],
        "character.v2",
        {},
      );
      const second = await lockSaveForUpdate<CharSave>(
        tx,
        ids[1],
        "character.v2",
        {},
      );
      if (ids[0] === userId) {
        charSave = first;
        ownerSave = second;
      } else {
        charSave = second;
        ownerSave = first;
      }
    } else {
      charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
    }

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
    const expGained = won ? enemyMonster.exp : 0;
    const goldGross = won ? monsterGoldReward(enemyMonster) : 0;
    const drops: DropResult = won ? rollDrops(floor, Math.random) : {};
    const nextMaterials = mergeDrops(charSave.materials, drops);

    // 세금 계산 — 위에서 결정한 taxOwnerId / taxRate 사용.
    // outpost FOR UPDATE 로 정책/세율 스냅샷 — 점령자가 hunt 도중 정책을 바꿔도
    // 이 hunt 는 진입 시점 값으로 처리, 다음 hunt 부터 변경 반영.
    let goldTaxed = 0;
    if (taxOwnerId && taxRate > 0 && won && goldGross > 0) {
      goldTaxed = Math.max(1, Math.floor(goldGross * taxRate));
      if (goldTaxed > goldGross) goldTaxed = goldGross;
    }
    const goldNet = goldGross - goldTaxed;

    const curLevel = Math.max(1, charSave.level ?? 1);
    const curExp = Math.max(0, charSave.exp ?? 0);
    const expResult = applyExpGain(curLevel, curExp, expGained);

    const newGold = Math.max(0, (charSave.gold ?? 0) + goldNet);

    // 사냥 후 hp — finalState.playerHp 그대로 적용 (사망 시 0).
    // 0 이면 다음 사냥 전까지 시간 회복으로 만피까지 채워짐.
    const afterHp = Math.max(0, battleResult.finalState.playerHp);

    // 침입자 트래킹 — 사냥 성공 시 lastHuntedOutpost 갱신 (outpost 사냥에 한해).
    // 패배해도 거점에서 사냥 시도는 한 셈이라 트래킹. 미점령 거점도 트래킹 X 의미 없으므로
    // outpostId 가 있을 때만.
    const nextLastHunted: LastHuntedOutpost | undefined = outpostId
      ? { outpostId, at: now }
      : undefined;

    // ejectedFrom 은 직전 사냥 응답 1회용 — 이 응답에 surface 후 키 자체 제거.
    // (undefined 박는 대신 destructure 로 명시적 제거 — JSON 직렬화 동작 의존 제거)
    const ejectedNotice: EjectedFrom | null = parseEjectedFrom(
      charSave.ejectedFrom,
    );
    const { ejectedFrom: _dropEjected, ...charSaveWithoutEject } = charSave;
    void _dropEjected;

    const next = {
      ...charSaveWithoutEject,
      stamina: afterStamina,
      hp: afterHp,
      hpRegenSince: now,
      level: expResult.level,
      exp: expResult.exp,
      gold: newGold,
      materials: nextMaterials,
      // outpost 사냥 → 트래킹 업데이트. 미점령 거점 또는 outpostId 없는 hunt 면 기존값 유지.
      ...(nextLastHunted ? { lastHuntedOutpost: nextLastHunted } : {}),
    };
    await upsertSave(tx, userId, "character.v2", next);

    // 세금 transfer — 위에서 정렬된 순서로 이미 lock 한 ownerSave 에 gold 추가.
    if (goldTaxed > 0 && taxOwnerId && ownerSave) {
      const ownerNew = {
        ...ownerSave,
        gold: Math.max(0, (ownerSave.gold ?? 0) + goldTaxed),
      };
      await upsertSave(tx, taxOwnerId, "character.v2", ownerNew);
    }

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
          goldGained: goldNet, // 사냥자 실 수령 (세금 차감 후)
          goldGross,
          goldTaxed,
          levelsGained: expResult.levelsGained,
          turns: battleResult.turns,
          hpBefore: regenResult.hp,
          hpAfter: afterHp,
          maxHp: player.maxHp,
          drops,
          ejected: ejectedNotice,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
