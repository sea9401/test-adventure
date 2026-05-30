import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations, outpostTreasury, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  derivePlayerCombatV2,
  V2_STAT_POINTS_PER_LEVEL,
} from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { monsterGoldReward } from "@/adventure/battle/monsterGold";
import {
  applyExpGain,
  applyNewbieBonus,
  getNewbieDropMultiplier,
  requiredExpToNext,
  XP_RATE_MULT,
} from "@/lib/leveling";

// BattleScene replay UI 의 EXP 바 max — 이미 만렙이면 분모로 쓸 값 없음.
// EXP 바 안 보이게 0 으로 fallback (현재 exp 와 동일 → pct 0).
function requiredExpToNextNullable(level: number): number | null {
  return requiredExpToNext(level);
}
import { MONSTERS } from "@/adventure/data/monsters";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { OUTPOSTS, OUTPOST_NPC_TAX_RATE } from "@/adventure/data/v2/outposts";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import {
  mergeDrops,
  rollDrops,
  type DropResult,
} from "@/adventure/data/v2/dungeonDrops";
import { rollEquipDrop } from "@/adventure/data/v2/dungeonEquipDrops";
import {
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonEnemy, DungeonFloorId } from "@/adventure/data/v2/types";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

// POST /api/v2/dungeon/hunt — 던전 한 번 사냥 intent.
//
// 본문: { floor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
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

const VALID_FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function isValidFloor(n: number): n is DungeonFloorId {
  return (VALID_FLOORS as readonly number[]).includes(n);
}

function pickRandomEnemy(
  enemies: readonly DungeonEnemy[],
): DungeonEnemy | null {
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
    // v2 의 lock 순서 통일: outpost FOR UPDATE → getGuildId → character.v2.
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
    // 무소속이면 null — same-guild 세금면제 분기에서 false 로 통과.
    const viewerGuildId = await getGuildId(tx, userId);

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
    // 미점령(NPC 운영) 거점이면 OUTPOST_NPC_TAX_RATE 만큼 거점 금고에 누적.
    let taxOwnerId: string | null = null;
    let taxRate = 0;
    let npcTaxOutpostId: string | null = null;
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
    } else if (outpostId && (!occRow || !occRow.occupiedByUserId)) {
      // 미점령 거점 사냥 — NPC 가 OUTPOST_NPC_TAX_RATE 만큼 징수, 거점 금고에 누적.
      npcTaxOutpostId = outpostId;
      taxRate = OUTPOST_NPC_TAX_RATE;
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

    const player = await derivePlayerCombatV2(userId, tx);
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

    const enemy = pickRandomEnemy(floorData.enemies);
    if (!enemy) {
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
    const baseMonster = MONSTERS[enemy.key];
    if (!baseMonster) {
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
    // 구역 multiplier 적용 (hp/atk/def/exp). 표시 이름·초상화는 사냥터 고유 값으로 덮어쓴다 —
    // spread 로 새 객체를 만들어 라이브 MONSTERS 원본을 mutate 하지 않는다.
    // image: v2 전용 초상화 우선, 없으면 라이브 몬스터 이미지 폴백.
    const enemyName = enemy.name;
    const enemyMonster = {
      ...scaleMonsterForFloor(baseMonster, floor),
      name: enemyName,
      image: enemy.image ?? baseMonster.image,
    };

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

    // 체력 부족(최대치 5% 미만) 상태에선 사냥 불가 — 스태미나 미소모 + hpRegenSince 미리셋으로
    // 회복 대기. 0 에서 시간 재생이 0→1 을 금방 넘겨 doomed 전투가 새던 문제를 안정적으로 차단.
    // 시간 경과(또는 치료소)로 회복되면 다시 사냥 가능. 일괄사냥의 death-stop 가드와 같은 의도.
    if (!canHuntWithHp(regenResult.hp, player.maxHp)) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "hp_zero" as const,
          stamina: applyRegen(stamina, now),
        },
      };
    }

    // PR-4b — 플레이어의 v2 스킬 (learned/equipped) 을 lock 해서 read. cast hook 이 사용.
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const v2Skills = parseV2SkillsState(skillsRaw);

    const battleResult = resolveBattle(
      playerForBattle,
      enemyMonster,
      playerName,
      {
        pickAction: (state) =>
          pickAutoAction(state, { rules: [], potions: {} }),
        potions: {},
        v2Skills,
      },
    );

    const won = battleResult.outcome === "win";
    const curLevel = Math.max(1, charSave.level ?? 1);
    // EXP = monster.exp → 신참 보너스(Lv30 미만 ×2, 라이브와 동일) → 전역 배율(staging 기본
    // 2.2/IS_STAGING, 라이브 1.0, NEXT_PUBLIC_XP_RATE_MULT override). 라이브 battleClaim 과 같은
    // 순서(newbie 먼저, 그 다음 배율). levelBand 는 여전히 v2 미적용 — 별개 다이얼.
    const baseExp = won ? applyNewbieBonus(enemyMonster.exp, curLevel).gained : 0;
    const expGained = Math.round(baseExp * XP_RATE_MULT);
    const goldGross = won ? monsterGoldReward(enemyMonster) : 0;
    // 신참 드롭 보너스 — Lv30 미만 드롭률 ×2 (라이브와 동일).
    const newbieDropMult = getNewbieDropMultiplier(curLevel);
    const drops: DropResult = won
      ? rollDrops(floor, Math.random, newbieDropMult)
      : {};
    const nextMaterials = mergeDrops(charSave.materials, drops);

    // 장비 드랍 — 승리 시 1회 굴림. equipment.v2 save 도 lock 해서 누적.
    // 이미 보유한 id 는 후보 제외 (장비 unique). 풀이 마르거나 굴림 실패면 null.
    let droppedEquipment: V2EquipmentId | null = null;
    if (won) {
      const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned } = parseEquipmentSave(equipmentSave);
      const ownedSet = new Set<V2EquipmentId>(owned);
      droppedEquipment = rollEquipDrop(floor, ownedSet, Math.random, newbieDropMult);
      if (droppedEquipment !== null) {
        const nextOwned = [...owned, droppedEquipment];
        await upsertSave(tx, userId, "equipment.v2", {
          ...equipmentSave,
          owned: nextOwned,
        });
      }
    }

    // 세금 계산 — 위에서 결정한 taxOwnerId/npcTaxOutpostId/taxRate 사용.
    // outpost FOR UPDATE 로 정책/세율 스냅샷 — 점령자가 hunt 도중 정책을 바꿔도
    // 이 hunt 는 진입 시점 값으로 처리, 다음 hunt 부터 변경 반영.
    let goldTaxed = 0;
    if ((taxOwnerId || npcTaxOutpostId) && taxRate > 0 && won && goldGross > 0) {
      goldTaxed = Math.max(1, Math.floor(goldGross * taxRate));
      if (goldTaxed > goldGross) goldTaxed = goldGross;
    }
    const goldNet = goldGross - goldTaxed;

    const curExp = Math.max(0, charSave.exp ?? 0);
    const expResult = applyExpGain(curLevel, curExp, expGained);

    const newGold = Math.max(0, (charSave.gold ?? 0) + goldNet);

    // 사냥 후 hp/mp — finalState 시작. 충전식 모델 (1g=1충전, 1000 cap):
    // inventory.v2.{hpCharges, mpCharges} 보유량 만큼 부족분 자동 회복. 옛 POTIONS
    // 카탈로그 (heal_s/m/l 등) 폐기 후 단순 카운터.
    let afterHp = Math.max(0, battleResult.finalState.playerHp);
    let afterMp = Math.max(0, battleResult.finalState.playerMp);

    const invSave = await lockSaveForUpdate<{
      hpCharges?: number;
      mpCharges?: number;
      [k: string]: unknown;
    }>(tx, userId, "inventory.v2", {});
    let hpCharges = Math.max(0, invSave.hpCharges ?? 0);
    let mpCharges = Math.max(0, invSave.mpCharges ?? 0);

    // HP 부족분 만큼 hpCharges 차감.
    if (afterHp > 0 && afterHp < player.maxHp && hpCharges > 0) {
      const need = player.maxHp - afterHp;
      const restore = Math.min(need, hpCharges);
      afterHp += restore;
      hpCharges -= restore;
    }
    // MP — INT 캐릭만.
    const maxMp = player.player.maxMp ?? 0;
    if (maxMp > 0 && afterMp < maxMp && mpCharges > 0) {
      const need = maxMp - afterMp;
      const restore = Math.min(need, mpCharges);
      afterMp += restore;
      mpCharges -= restore;
    }
    await upsertSave(tx, userId, "inventory.v2", {
      ...invSave,
      hpCharges,
      mpCharges,
    });

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
      mp: afterMp,
      hpRegenSince: now,
      level: expResult.level,
      exp: expResult.exp,
      gold: newGold,
      materials: nextMaterials,
      // outpost 사냥 → 트래킹 업데이트. 미점령 거점 또는 outpostId 없는 hunt 면 기존값 유지.
      ...(nextLastHunted ? { lastHuntedOutpost: nextLastHunted } : {}),
    };
    await upsertSave(tx, userId, "character.v2", next);

    // 레벨업 시 단련 포인트 +levelsGained × V2_STAT_POINTS_PER_LEVEL (PR-S1: ×5).
    // GrowthShrine 에서 분배. lock 순서 character.v2 다음에 training.v2 (다른 키).
    if (expResult.levelsGained > 0) {
      const trainingSave = await lockSaveForUpdate<{
        points?: number;
        [k: string]: unknown;
      }>(tx, userId, "training.v2", {});
      const curPoints = Math.max(0, trainingSave.points ?? 0);
      await upsertSave(tx, userId, "training.v2", {
        ...trainingSave,
        points:
          curPoints + expResult.levelsGained * V2_STAT_POINTS_PER_LEVEL,
      });
    }

    // 세금 transfer — 위에서 정렬된 순서로 이미 lock 한 ownerSave 에 gold 추가.
    if (goldTaxed > 0 && taxOwnerId && ownerSave) {
      const ownerNew = {
        ...ownerSave,
        gold: Math.max(0, (ownerSave.gold ?? 0) + goldTaxed),
      };
      await upsertSave(tx, taxOwnerId, "character.v2", ownerNew);
    }
    // NPC 세금 — 미점령 거점 금고에 누적. 추후 점령 전쟁 보상으로 사용.
    if (goldTaxed > 0 && npcTaxOutpostId) {
      await tx
        .insert(outpostTreasury)
        .values({
          outpostId: npcTaxOutpostId,
          gold: goldTaxed,
          updatedAt: new Date(now),
        })
        .onConflictDoUpdate({
          target: outpostTreasury.outpostId,
          set: {
            gold: sql`${outpostTreasury.gold} + ${goldTaxed}`,
            updatedAt: new Date(now),
          },
        });
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
          // 충전식 회복약 잔량 (사냥 후 부족분 자동 소모 반영). 전투 화면 캐릭터 정보에 표기.
          hpCharges,
          mpCharges,
          drops,
          droppedEquipment,
          ejected: ejectedNotice,
          // BattleScene replay 용 — BattleScene 이 실제로 보는 필드만 추출
          // (enemy.{name,hp,image}, playerMaxHp, log). 클라가 buildBattleStateFromReplay
          // 로 BattleState 형태로 재구성. log 는 마지막 200 cap.
          replay: toReplayPayload(battleResult.finalState, 200),
          // replay UI 의 시작 HP — 사전 회복 적용 후 사냥 진입 시점.
          startPlayerHp: regenResult.hp,
          // 이 사냥의 시작 EXP/maxExp — replay UI 의 EXP 바 표시용
          // (사냥 후 변동은 결과 카드로 분리).
          expForBar: curExp,
          maxExpForBar: requiredExpToNextNullable(curLevel) ?? curExp,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
