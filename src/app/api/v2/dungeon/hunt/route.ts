import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations, outpostTreasury, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { monsterGoldReward } from "@/adventure/v2/combat/monsterGold";
import {
  applyExpGain,
  applyNewbieExpBonusByBattles,
  requiredExpToNext,
  XP_RATE_MULT,
} from "@/lib/leveling";

// BattleScene replay UI 의 EXP 바 max — 이미 만렙이면 분모로 쓸 값 없음.
// EXP 바 안 보이게 0 으로 fallback (현재 exp 와 동일 → pct 0).
function requiredExpToNextNullable(level: number): number | null {
  return requiredExpToNext(level);
}
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "@/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
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
import { rollUniqueDrop } from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  TREASURE_FRAGMENTS_KEY,
  HUNT_FRAGMENT_DROP_CHANCE,
  addFragments,
  parseTreasureFragments,
  rollFragmentDrop,
} from "@/adventure/v2/treasureFragments";
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
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonEnemy, DungeonFloorId } from "@/adventure/data/v2/types";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { insertFeedEntry } from "@/lib/server/serverFeed";

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

// 단일 무한 프론티어 — 깊이(depth) 1→∞. 조기 검증은 정수·≥1 만, 실제 게이트(최고도달+1)는
// character.v2 lock 후. 드랍 풀은 깊이를 DungeonFloorId(1~8)로 클램프해 조회(8 이상=8 풀).
const DROP_FLOOR_CAP = 8 as DungeonFloorId;

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

  let body: {
    floor?: unknown; // = 프론티어 깊이(depth). 클라 호환 위해 키 이름 유지.
    outpostId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // floor = 깊이(무한). 정수·≥1 만 조기 검증 — 최고도달+1 게이트는 save lock 후(아래).
  if (
    typeof body.floor !== "number" ||
    !Number.isInteger(body.floor) ||
    body.floor < 1
  ) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const depth = body.floor;
  const dropFloor = Math.min(depth, DROP_FLOOR_CAP) as DungeonFloorId;

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

    // equipment.v2 조기 잠금 (드랍/굴림 한 번에 기록). lock 순서 char→equipment.
    const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned: ownedEquip, equipped: equippedEquip } =
      parseEquipmentSave(equipmentSave);

    // 프론티어 깊이 게이트(수동 푸시) — 깊이 1~최고도달+1 만. 도달은 character.v2.frontierDepth.
    // 들판·깊은 산(1·2)은 기본 해금(min 2). 잠긴 깊이는 stamina 소모 전 거부.
    const frontierDepth = Math.max(
      2,
      Math.floor(Number(charSave.frontierDepth) || 2),
    );
    if (depth > frontierDepth + 1) {
      return {
        ok: false as const,
        status: 403,
        body: {
          ok: false as const,
          error: "depth_locked" as const,
          maxDepth: frontierDepth,
        },
      };
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

    const enemy = pickRandomEnemy(enemiesForDepth(depth));
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
    const baseMonster = V2_MONSTERS[enemy.key];
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
    // spread 로 새 객체를 만들어 V2_MONSTERS 카탈로그 원본을 mutate 하지 않는다.
    // image: v2 전용 초상화 우선, 없으면 카탈로그 몬스터 이미지 폴백.
    const enemyName = enemy.name;
    // PR-1/5b 속성 상성 — 양방향 데미지 ±%.
    //   캐릭 속성(playerElement) = 방어(피격) 속성 + 스킬 기본 속성.
    //   평타/공격 속성(basicAttackElement) = 무기 속성 ?? 캐릭 속성 (PR-5b 무기 속성 우선).
    //   atk 엔 basicAttackElement 를 baked, 스킬은 combatShared 가 스킬속성으로 재정규화.
    const playerElement = parseV2Element(
      (charSave as { element?: unknown }).element,
    );
    const basicAttackElement: V2Element =
      player.weaponElement !== "neutral" ? player.weaponElement : playerElement;
    const monsterElement: V2Element = enemy.element ?? "neutral";
    const playerElemMult = elementDamageMult(basicAttackElement, monsterElement); // 내 평타
    const monsterElemMult = elementDamageMult(monsterElement, playerElement); // 적 공격(내 방어속성 대상)
    const playerElemMatchup = elementMatchup(basicAttackElement, monsterElement);
    const scaledEnemy = scaleMonsterForFloor(baseMonster, depth);
    const enemyMonster = {
      ...scaledEnemy,
      atk: Math.max(1, Math.round(scaledEnemy.atk * monsterElemMult)),
      name: enemyName,
      image: enemy.image ?? baseMonster.image,
      element: monsterElement, // PR-5b — 스킬 cast 상성 계산용.
      // PR-9 — 사냥터 몹 상태이상. v2 전용(라이브 Monster 무수정, 이 enemyMonster 로컬 객체만).
      // 엔진 적 페이즈가 enemy.v2Skills 를 cast → DoT/디버프 플레이어 적용. mpCost 0 라 자원 무관.
      ...(enemy.statusSkill
        ? {
            v2Skills: {
              learned: [enemy.statusSkill],
              equipped: [enemy.statusSkill],
            },
          }
        : {}),
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
    const playerForBattle = {
      ...player.player,
      hp: regenResult.hp,
      // MP 실자원화 — 보존된 MP 로 전투 시작(derive 가 character.v2.mp 시드). 전투 후 mpCharges 가
      // 부족분을 채우므로 충전약이 남는 한 사실상 풀로 시작하고, 떨어지면 줄어 마법 위력이 빠진다.
      mp: player.player.mp,
      atk: Math.max(1, Math.round(player.player.atk * playerElemMult)),
      magicAtk: Math.max(
        0,
        Math.round((player.player.magicAtk ?? 0) * playerElemMult),
      ),
      // PR-5b — 평타 속성(baked) + 캐릭 속성(스킬 기본·피격 방어). combatShared 가 스킬 보정에 사용.
      attackElement: basicAttackElement,
      characterElement: playerElement,
    };

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
    // 신참 보너스 판정용 누적 전투 전적 — adventure-log.v2 의 monster kills 합 + 패배수.
    // v2 는 재전직이 레벨을 1 로 리셋하므로 레벨이 아닌 전적으로 신참을 가린다(베테랑이
    // 재전직할 때마다 보너스가 잘못 되살아나는 것 방지). read-only 스냅샷(게이트용)이라
    // 비잠금 — 권위적 kill 증가는 아래 lock 구간(adventure-log.v2)에서 한다.
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
    // EXP = monster.exp → 신참 보너스(전적 ≤ 3만 ×2, EXP 전용) → 전역 배율(staging 기본
    // 2.2/IS_STAGING, 라이브 1.0). 라이브 battleClaim 과 같은 순서(newbie 먼저, 그 다음 배율).
    const baseExp = won
      ? applyNewbieExpBonusByBattles(enemyMonster.exp, battleCount).gained
      : 0;
    const expGained = Math.round(baseExp * XP_RATE_MULT);
    const goldGross = won ? monsterGoldReward(enemyMonster) : 0;
    // 신참 드롭 보너스 폐지 — 신참 혜택은 EXP 전용(사용자 결정). 드롭은 항상 ×1.
    const drops: DropResult = won ? rollDrops(dropFloor, Math.random, 1) : {};
    const nextMaterials = mergeDrops(charSave.materials, drops);

    // 장비 드랍 — 승리 시 1회 굴림. 이미 보유한 id 는 후보 제외 (장비 unique).
    // 풀이 마르거나 굴림 실패면 null. equipment.v2 는 조기 lock 한 걸 한 번에 기록.
    let droppedEquipment: V2EquipmentId | null = null;
    let droppedUnique: V2EquipmentId | null = null;
    let nextOwned: V2EquipInstance[] = ownedEquip;
    if (won) {
      // 드랍 후보 제외는 보유 "id" 기준(이미 보유한 종류는 다시 안 떨어짐) — 개체 모델이라도
      // 드랍은 종류당 1개 유지(중복 농사 방지). 개체별 굴림의 다양성은 제작 쪽에서.
      const ownedSet = new Set<V2EquipmentId>(ownedEquip.map((i) => i.id));
      droppedEquipment = rollEquipDrop(dropFloor, ownedSet, Math.random, 1);
      if (droppedEquipment !== null) {
        // 드랍 = 새 개체 + 새 굴림(±편차).
        nextOwned = [
          ...nextOwned,
          {
            iid: genEquipIid(),
            id: droppedEquipment,
            roll: rollItemStats(V2_EQUIPMENT[droppedEquipment], Math.random),
          },
        ];
        ownedSet.add(droppedEquipment);
      }
      // 유니크 — 정규 드랍과 독립한 별도 초저확률 롤(드랍 전용). 보유분 제외, 둘 다 떨어질 수도.
      // 신참 배율(Lv<30 ×2) 미적용 — 유니크 chase 희귀도는 레벨 무관 균일.
      droppedUnique = rollUniqueDrop(dropFloor, ownedSet, Math.random, 1);
      if (droppedUnique !== null) {
        nextOwned = [
          ...nextOwned,
          {
            iid: genEquipIid(),
            id: droppedUnique,
            roll: rollItemStats(V2_EQUIPMENT[droppedUnique], Math.random),
          },
        ];
      }
    }
    // equipment.v2 한 번에 기록 — owned(+드랍 개체). 굴림은 개체에 포함.
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: equippedEquip,
    });

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
    // MP 실자원화 — 전투 후 잔여 MP 를 mpCharges 로 충당(HP 와 대칭). 충전약이 남아 있으면
    // 사실상 매 전투 풀충전처럼 보이고, 떨어지면 MP 가 줄어 마법 위력이 빠진다.
    const maxMp = player.player.maxMp ?? 0;
    let afterMp = Math.max(0, Math.min(maxMp, battleResult.finalState.playerMp));

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
    // MP 부족분 만큼 mpCharges 차감.
    if (afterMp < maxMp && mpCharges > 0) {
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
      // 프론티어 수동 푸시 — 최고도달+1 깊이를 이기면 해금(+1). 패배·기존깊이면 유지(min 2 정규화).
      frontierDepth: won && depth > frontierDepth ? depth : frontierDepth,
      // outpost 사냥 → 트래킹 업데이트. 미점령 거점 또는 outpostId 없는 hunt 면 기존값 유지.
      ...(nextLastHunted ? { lastHuntedOutpost: nextLastHunted } : {}),
    };
    await upsertSave(tx, userId, "character.v2", next);

    // 전투수 랭킹용 — 승리 시 adventure-log.v2 의 monster kill 카운터 누적(서버 권위).
    // /api/rankings 가 monsters[*].kills 를 SUM 해 battleCount 를 낸다. v2 클라는 이 키를
    // 안 건드려(hook 없음) 서버 단독 소유 → sync clobber 없음. v1 battleClaim 과 동일 키·키잉
    // (enemyName). lock 순서: character.v2 다음 → proficiency.v2 앞(일관 순서, 데드락 회피).
    if (won) {
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
      const prevMon = monsters[enemyName];
      monsters[enemyName] = {
        ...prevMon,
        encountered: true,
        kills: (prevMon?.kills ?? 0) + 1,
        firstSeenAt: prevMon?.firstSeenAt ?? now,
        lastKilledAt: now,
      };
      await upsertSave(tx, userId, "adventure-log.v2", { ...logSave, monsters });
    }

    // PR-prof — 승리 시 직업군 숙련도 적립 + 레벨업 시 랜덤 스탯 성장(앵커 가중, cap 까지).
    // 옛 수동 분배(training.v2 포인트) 폐기. lock 순서: character.v2 다음에 proficiency.v2.
    let proficiencyGained = 0; // 전투 결과 표시용.
    const statGains: Partial<Record<V2StatKey, number>> = {}; // 레벨업 랜덤 성장으로 오른 1차 스탯 — 결과 카드 표시용.
    if (won || expResult.levelsGained > 0) {
      const playerClass = parseV2Class(charSave.class);
      const group = tier1ClassOf(playerClass);
      const profSave = await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      );
      let prof = parseProficiencyForChar(profSave, charSave);
      // 적립 — 승리 + 직업 보유 시.
      if (won && group !== "none") {
        prof = addPoints(prof, group, V2_PROFICIENCY_PER_KILL);
        proficiencyGained = V2_PROFICIENCY_PER_KILL;
      }
      // 레벨업 시 — 직군 누적 레벨 적립(floor·전직 게이트 입력) + 랜덤 스탯 성장.
      if (expResult.levelsGained > 0) {
        // 직군 누적 레벨 += 오른 레벨 수(전직 리셋에도 불변, none 은 무변경). floor·전직 게이트 입력.
        prof = addCumLevel(prof, group, expResult.levelsGained);
        // 랜덤 레벨 성장 — 레벨업 수만큼 굴린다(cap 은 prof.caps, 수행 전 기본 60).
        const grownBefore = prof.grown; // rollLevelGrowth 는 비파괴 — 시작 맵 보존 안전.
        let grown = grownBefore;
        for (let i = 0; i < expResult.levelsGained; i++) {
          grown = rollLevelGrowth(grown, playerClass, prof, Math.random);
        }
        prof = setGrown(prof, grown);
        // grown 1포인트 = 해당 스탯 +1. 레벨업 전후 delta 가 곧 오른 스탯.
        for (const k of V2_STAT_KEYS) {
          const d = (grown[k] ?? 0) - (grownBefore[k] ?? 0);
          if (d > 0) statGains[k] = d;
        }
      }
      await upsertSave(tx, userId, "proficiency.v2", prof);
    }

    // 보물 탐사 — 사냥 승리 시 낮은 확률로 지도 조각 드랍(트리클). 굴림은 100% 서버.
    // 드랍 났을 때만 키를 잠근다 — 락 순서상 가장 마지막. 조각 소비(발굴)는 PR-3.
    const fragmentDrop = won
      ? rollFragmentDrop(Math.random, HUNT_FRAGMENT_DROP_CHANCE)
      : 0;
    let fragmentsTotal = 0;
    if (fragmentDrop > 0) {
      const frags = parseTreasureFragments(
        await lockSaveForUpdate(tx, userId, TREASURE_FRAGMENTS_KEY, {}),
      );
      const nextFrags = addFragments(frags, fragmentDrop);
      await upsertSave(tx, userId, TREASURE_FRAGMENTS_KEY, nextFrags);
      fragmentsTotal = nextFrags.fragments;
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
          floor: depth, // 깊이(클라 호환 키)
          maxDepth: won && depth > frontierDepth ? depth : frontierDepth, // 최고 도달(수동 푸시)
          enemyName,
          won,
          expGained,
          proficiencyGained, // 직업군 숙련도 획득 (승리·직업 보유 시 +2).
          goldGained: goldNet, // 사냥자 실 수령 (세금 차감 후)
          goldGross,
          goldTaxed,
          levelsGained: expResult.levelsGained,
          statGains, // 레벨업 랜덤 성장으로 오른 1차 스탯 ({} = 레벨업 없음).
          turns: battleResult.turns,
          hpBefore: regenResult.hp,
          hpAfter: afterHp,
          maxHp: player.maxHp,
          // PR-1 속성 상성 — 결과 카드에 "유리/불리" 표기.
          playerElement,
          monsterElement,
          elementMatchup: playerElemMatchup,
          // 충전식 회복약 잔량 — HP/MP 모두 전투 후 부족분 자동 소모 반영.
          hpCharges,
          mpCharges,
          drops,
          droppedEquipment,
          // 보물 탐사 — 이번 사냥 지도 조각 드랍 수 + 누적(0 = 안 떨어짐).
          fragmentDrop,
          fragmentsTotal,
          droppedUnique,
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

  // 전체 소식 — 유니크 장비 드랍 broadcast. tx 커밋 후 side-effect 로 호출(중첩 트랜잭션
  // 회피 — guild-lodge 데드락 교훈). insertFeedEntry 가 opt-out/디바운스/실패삼킴을 자체
  // 처리하므로 응답엔 영향 없음. droppedUnique 는 승리 성공 응답 body 에만 존재.
  const droppedUniqueId = (
    result.body as { result?: { droppedUnique?: V2EquipmentId | null } }
  ).result?.droppedUnique;
  if (droppedUniqueId) {
    await insertFeedEntry(userId, "unique_drop", { itemId: droppedUniqueId });
  }

  return Response.json(result.body, { status: result.status });
}
