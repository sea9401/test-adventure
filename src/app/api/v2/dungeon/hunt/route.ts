import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guilds, outpostOccupations, outpostTreasury, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  derivePlayerCombatV2,
  v2LevelGrowthHpMp,
} from "@/lib/server/derivePlayerCombatV2";
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
  tierLevelCap,
  proficiencyPerKillAtDepth,
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
import { rollEnhanceStoneDrops } from "@/adventure/data/v2/v2Enhance";
import {
  mergeDrops,
  rollDrops,
  type DropResult,
} from "@/adventure/data/v2/dungeonDrops";
import { rollEquipDrop } from "@/adventure/data/v2/dungeonEquipDrops";
import {
  rollBandUniqueDrop,
  rollBandCommonDrop,
  rollUniqueDrop,
} from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  getThemeBoss,
  getThemeBossDef,
  themeStartDepth,
  rollBossUniqueDrop,
  BOSS_HUNT_COST,
} from "@/adventure/data/v2/dungeonBosses";
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
import {
  toReplayPayload,
  toReplayPayloadLite,
} from "@/adventure/data/v2/replayPayload";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonEnemy, DungeonFloorId } from "@/adventure/data/v2/types";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  insertFeedEntry,
  resolveUserDisplayName,
} from "@/lib/server/serverFeed";

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

// 일괄(batch) 사냥 — 한 요청에서 서버가 N회 사냥을 한 트랜잭션으로 돌린다(클라 50회 왕복 폐기).
// 클라 전투설정의 최대 횟수와 일치. 본문 count(없으면 1=단판).
const MAX_HUNT_BATCH = 50;

function pickRandomEnemy(
  enemies: readonly DungeonEnemy[],
): DungeonEnemy | null {
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

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

type HuntTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RunOneHuntCtx = {
  tx: HuntTx;
  userId: string;
  depth: number;
  dropFloor: DungeonFloorId;
  isBossHunt: boolean;
  outpostId: string | null;
};

// 한 번의 사냥 — 기존 단판 로직 그대로(트랜잭션 클로저 tx 사용). 일괄 모드는 이 함수를
//   루프로 N회 호출한다. 매 호출이 character.v2/equipment 등을 재-락·재-read 하므로 직전
//   사냥의 레벨/HP/스태미나/드랍이 DB 재read 로 자동 이월된다(수동 스레딩 불필요).
//   forBatch=true 면 replay 를 경량 payload 로(배치 집계는 playerMaxMp 만 읽음 — 무거운 log 회피).
async function runOneHunt(forBatch: boolean, ctx: RunOneHuntCtx) {
  const { tx, userId, depth, dropFloor, isBossHunt, outpostId } = ctx;
  // === 1. outpost 점령 조회 (FOR UPDATE) ===
  // v2 의 lock 순서 통일: outpost FOR UPDATE → getGuildId → character.v2.
  // FOR UPDATE 로 정책 게이트 평가와 세금 결정이 같은 스냅샷을 사용 — 점령자가
  // hunt 도중 정책을 바꿔도 이 hunt 는 진입 시점 정책으로 일관.
  let occRow: {
    occupiedByUserId: string | null;
    occupiedByGuildId: number | null;
    policy: string;
    taxRate: string;
  } | null = null;
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
  // 보스 도전 = 그 테마에 진입 가능(테마 첫 깊이를 사냥할 수 있는) 상태면 허용 — anchorDepth
  //   (밴드 최상단)로 스케일된 보스라 밴드를 끝내기 전엔 어렵지만 "졸업 시험" 도전 자체는 진입
  //   즉시 가능. 일반 사냥 = 깊이 1~최고도달+1 게이트.
  const gateBlocked = isBossHunt
    ? frontierDepth + 1 < themeStartDepth(depth)
    : depth > frontierDepth + 1;
  if (gateBlocked) {
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
  const huntCost = isBossHunt ? BOSS_HUNT_COST : HUNT_COST;
  const afterStamina = tryConsume(stamina, huntCost, now);
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

  // PR-perf — character/equipment 에 더해 skills/proficiency 도 derive 전에 한 번 lock-read 해서
  //   4개 save 를 모두 preload → derive 의 중복 select 자체를 제거(판당 prof 2read→1·skills
  //   2read→1·derive 왕복 0). #571 이 캡 산출 select 를 이미 제거했으니, 남은 prof read 는
  //   derive 의 SELECT 와 권위 쓰기 락 둘 — 이 둘을 upfront 락 하나로 합친다. 같은 락 결과를
  //   아래 cast hook·권위적 proficiency 쓰기에서 재사용(동일 tx 스냅샷·중간 쓰기 없음 →
  //   결과 byte-동일). 레벨 캡은 #571 처럼 derive 가 노출한 player.classTier 를 쓴다.
  //   lock 순서: character→equipment→
  //   skills→proficiency. 모든 라우트가 character.v2 를 가장 먼저 잠그므로 같은 유저 동시 tx 는
  //   character.v2 에서 직렬화 → 이후 같은-유저 키 락 순서는 데드락과 무관(dev/admin grant 도
  //   이미 proficiency→inventory 순이라 이 순서가 외려 더 일관).
  const skillsRaw = await lockSaveForUpdate(
    tx,
    userId,
    "skills.v2",
    emptyV2SkillsState() as unknown as Record<string, unknown>,
  );
  const v2Skills = parseV2SkillsState(skillsRaw);
  const proficiencyRaw = await lockSaveForUpdate<V2ProficiencyState>(
    tx,
    userId,
    "proficiency.v2",
    emptyProficiency(),
  );
  const player = await derivePlayerCombatV2(userId, tx, {
    character: charSave,
    equipmentSave,
    proficiencyRaw,
    skillsRaw,
  });
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

  // PR-1/5b 속성 상성 — 양방향 데미지 ±%.
  //   캐릭 속성(playerElement) = 방어(피격) 속성 + 스킬 기본 속성.
  //   평타/공격 속성(basicAttackElement) = 무기 속성 ?? 캐릭 속성 (PR-5b 무기 속성 우선).
  //   atk 엔 basicAttackElement 를 baked, 스킬은 combatShared 가 스킬속성으로 재정규화.
  const playerElement = parseV2Element(
    (charSave as { element?: unknown }).element,
  );
  const basicAttackElement: V2Element =
    player.weaponElement !== "neutral"
      ? player.weaponElement
      : playerElement;

  // 적 — 보스 도전이면 테마 보스(anchorDepth 로 이미 스케일·이름/이미지/속성/스킬/페이즈 보유),
  //   일반이면 깊이 풀에서 랜덤 픽 후 깊이 스케일(이름·초상화는 사냥터 고유 값으로 덮어씀).
  //   spread 로 새 객체를 만들어 V2_MONSTERS 카탈로그 원본을 mutate 하지 않는다.
  let enemyName: string;
  let monsterElement: V2Element;
  let enemyMonster: import("@/adventure/data/monsters/types").Monster;
  if (isBossHunt) {
    const bossMon = getThemeBoss(depth);
    if (!bossMon) {
      return {
        ok: false as const,
        status: 400,
        body: {
          ok: false as const,
          error: "no_boss" as const,
          stamina: afterStamina,
        },
      };
    }
    enemyMonster = bossMon;
    enemyName = bossMon.name;
    monsterElement = bossMon.element ?? "neutral";
  } else {
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
    enemyName = enemy.name;
    monsterElement = enemy.element ?? "neutral";
    const scaledEnemy = scaleMonsterForFloor(baseMonster, depth);
    enemyMonster = {
      ...scaledEnemy,
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
  }
  const playerElemMult = elementDamageMult(
    basicAttackElement,
    monsterElement,
  ); // 내 평타(약점 찌르기 — 유리 +25%, 불리 페널티 없음)
  // 약점 찌르기 = 공격 전용(2026-06-08): 몹→플레이어 속성 피해는 제거(중립). 페널티/피격↑ 없음.
  const playerElemMatchup = elementMatchup(
    basicAttackElement,
    monsterElement,
  );

  // 전투 로그에 박을 캐릭 이름 — character-profile.v2 의 name. 없으면 "모험가".
  const profile = await readSave<{ name?: string } | null>(
    tx,
    userId,
    "character-profile.v2",
    null,
  );
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

  // v2Skills 는 위(derive 직전)에서 이미 lock-read·parse 했다. cast hook 이 그대로 사용.
  const battleResult = resolveBattle(
    playerForBattle,
    enemyMonster,
    playerName,
    {
      pickAction: (state) =>
        pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      isBoss: isBossHunt, // 보스전 — %HP 효과 감산 + breaker 보너스 활성.
    },
  );

  const won = battleResult.outcome === "win";
  const curLevel = Math.max(1, charSave.level ?? 1);
  // 신참 보너스 판정용 누적 전투 전적 — adventure-log.v2 의 monster kills 합 + 패배수.
  // v2 는 재전직이 레벨을 1 로 리셋하므로 레벨이 아닌 전적으로 신참을 가린다(베테랑이
  // 재전직할 때마다 보너스가 잘못 되살아나는 것 방지). read-only 스냅샷(게이트용)이라
  // 비잠금 — 권위적 kill 증가는 아래 lock 구간(adventure-log.v2)에서 한다.
  const logVal = await readSave<{
    monsters?: Record<string, { kills?: number }>;
    battleLosses?: number;
  } | null>(tx, userId, "adventure-log.v2", null);
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
  // 보스는 재료 드랍 없음(전용 유니크만) — 일반 사냥만 재료 풀 굴림.
  const drops: DropResult =
    won && !isBossHunt ? rollDrops(dropFloor, Math.random, 1) : {};
  // 강화석 — 재료 보류 플래그(V2_MATERIALS_ENABLED)와 무관한 독립 드랍. 전 깊이 공통
  // (초보자도 줍고 거래소에서 환금), 보스전 포함. 다이얼 = v2Enhance ENHANCE_STONE_DROP_PCT.
  if (won) {
    for (const [id, n] of Object.entries(rollEnhanceStoneDrops(Math.random))) {
      drops[id] = (drops[id] ?? 0) + n;
    }
  }
  const nextMaterials = mergeDrops(charSave.materials, drops);

  // 장비 드랍 — 승리 시 1회 굴림. 정규 장비는 중복 드랍 허용(보유분도 새 굴림으로 재드랍 =
  // god-roll 추격). 풀이 마르거나 굴림 실패면 null. equipment.v2 는 조기 lock 한 걸 한 번에 기록.
  let droppedEquipment: V2EquipmentId | null = null;
  let droppedUnique: V2EquipmentId | null = null;
  let nextOwned: V2EquipInstance[] = ownedEquip;
  if (won) {
    // ownedSet 은 rollUniqueDrop 의 유니크 dedup 용(유니크는 종류당 1개). 정규 rollEquipDrop
    // 은 중복 허용이라 ownedSet 무시(보유분도 새 굴림으로 재드랍).
    const ownedSet = new Set<V2EquipmentId>(ownedEquip.map((i) => i.id));
    if (isBossHunt) {
      // 보스 = 전용 유니크 단일 풀만(일반 장비·밴드/레거시 유니크 제외). 중복 드랍 허용(반복 추격).
      droppedUnique = rollBossUniqueDrop(depth, Math.random, 1);
    } else {
      // 정규 장비 드랍: 스타터(1~12)=rollEquipDrop(6%), 프론티어 밴드(13~30)=흔한 밴드 장비
      //   (rollBandCommonDrop, 로컬 깊이 램프 2~4%). rollEquipDrop 이 13+ 에서 null → ?? 로 밴드
      //   흔한 풀이 그 자리(정규 장비 슬롯)를 채운다(깊이 범위 안 겹쳐 rng 한 쪽만 소비).
      droppedEquipment =
        rollEquipDrop(depth, ownedSet, Math.random, 1) ??
        rollBandCommonDrop(depth, Math.random, 1);
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
      // 유니크 — 정규 드랍과 독립한 별도 초저확률 롤(드랍 전용). 정규 장비와 둘 다 떨어질 수도.
      // 신참 배율(Lv<30 ×2) 미적용 — 유니크 chase 희귀도는 레벨 무관 균일.
      // 두 갈래: 레거시 층 풀(rollUniqueDrop, 깊이 1~6 들판 — 보유분 제외 dedup, 종류당 1개) +
      // 심층 밴드 풀(rollBandUniqueDrop, 마른 협곡 13~18 등 — 중복 드랍 허용, 보유분도 재드랍).
      // 깊이 범위가 겹치지 않아 둘 중 하나만 rng 소비 — ?? 합성 안전
      // (밴드 밖이면 bandUniquePoolForDepth=null → rng 미소비, dropFloor 8 풀은 chance 0 → 미소비).
      droppedUnique =
        rollBandUniqueDrop(depth, ownedSet, Math.random, 1) ??
        rollUniqueDrop(dropFloor, ownedSet, Math.random, 1);
    }
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
  if (
    (taxOwnerId || npcTaxOutpostId) &&
    taxRate > 0 &&
    won &&
    goldGross > 0
  ) {
    goldTaxed = Math.max(1, Math.floor(goldGross * taxRate));
    if (goldTaxed > goldGross) goldTaxed = goldGross;
  }
  const goldNet = goldGross - goldTaxed;

  // 차수별 레벨 캡(환생 §3.1) — 현 직군 차수의 캡까지만 성장. none = 만렙(4차 캡 100).
  // PR-perf: 차수(player.classTier)는 위 derive 가 같은 tx 에서 읽은 proficiency 에서 산출한
  //   값(prof.groups[현직군].tier ?? 1)이라, 캡 산출용 proficiency 재select(판당 1회) 불필요.
  //   (none 은 derive classTier=1 로 떨어지므로 분기 유지 — 권위 cumLevel 쓰기는 아래 락.)
  const capGroup = tier1ClassOf(parseV2Class(charSave.class));
  const levelCap =
    capGroup === "none" ? tierLevelCap(4) : tierLevelCap(player.classTier);

  const curExp = Math.max(0, charSave.exp ?? 0);
  const expResult = applyExpGain(curLevel, curExp, expGained, levelCap);

  const newGold = Math.max(0, (charSave.gold ?? 0) + goldNet);

  // 사냥 후 hp/mp — finalState 시작. 충전식 모델 (1g=1충전, 1000 cap):
  // inventory.v2.{hpCharges, mpCharges} 보유량 만큼 부족분 자동 회복. 옛 POTIONS
  // 카탈로그 (heal_s/m/l 등) 폐기 후 단순 카운터.
  let afterHp = Math.max(0, battleResult.finalState.playerHp);
  // MP 실자원화 — 전투 후 잔여 MP 를 mpCharges 로 충당(HP 와 대칭). 충전약이 남아 있으면
  // 사실상 매 전투 풀충전처럼 보이고, 떨어지면 MP 가 줄어 마법 위력이 빠진다.
  const maxMp = player.player.maxMp ?? 0;
  let afterMp = Math.max(
    0,
    Math.min(maxMp, battleResult.finalState.playerMp),
  );

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
    // 보스는 anchorDepth(밴드 최상단)로 스케일돼도 프론티어를 밀지 않음(졸업 시험일 뿐, 깊이 해금 X).
    frontierDepth:
      won && !isBossHunt && depth > frontierDepth ? depth : frontierDepth,
    // outpost 사냥 → 트래킹 업데이트. 미점령 거점 또는 outpostId 없는 hunt 면 기존값 유지.
    ...(nextLastHunted ? { lastHuntedOutpost: nextLastHunted } : {}),
  };
  await upsertSave(tx, userId, "character.v2", next);

  // 전투수 랭킹용 — 승리 시 adventure-log.v2 의 monster kill 카운터 누적(서버 권위).
  // /api/rankings 가 monsters[*].kills 를 SUM 해 battleCount 를 낸다. v2 클라는 이 키를
  // 안 건드려(hook 없음) 서버 단독 소유 → sync clobber 없음. v1 battleClaim 과 동일 키·키잉
  // (enemyName). lock 순서: character.v2 다음 → proficiency.v2 앞(일관 순서, 데드락 회피).
  let bossFirstKill = false; // 보스 첫 처치 = 칭호 신규 획득(결과 카드 연출용).
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
      titles?: Record<string, { obtainedAt: number }>;
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
    // 보스 첫 처치 칭호 — 같은 adventure-log.v2 락 안에서 titles 맵에 멱등 추가
    //   (별도 grantTitle 호출은 이 upsert 에 덮어쓰일 수 있어 여기 통합). 이미 있으면 firstKill=false.
    let titles = logSave.titles;
    if (isBossHunt) {
      const titleId = getThemeBossDef(depth)?.titleId;
      if (titleId && !(logSave.titles ?? {})[titleId]) {
        titles = { ...(logSave.titles ?? {}), [titleId]: { obtainedAt: now } };
        bossFirstKill = true;
      }
    }
    await upsertSave(tx, userId, "adventure-log.v2", {
      ...logSave,
      monsters,
      ...(titles ? { titles } : {}),
    });
  }

  // PR-prof — 승리 시 직업군 숙련도 적립 + 레벨업 시 랜덤 스탯 성장(앵커 가중, cap 까지).
  // 옛 수동 분배(training.v2 포인트) 폐기. lock 순서: character.v2 다음에 proficiency.v2.
  let proficiencyGained = 0; // 전투 결과 표시용.
  const statGains: Partial<Record<V2StatKey, number>> = {}; // 레벨업 랜덤 성장으로 오른 1차 스탯 — 결과 카드 표시용.
  if (won || expResult.levelsGained > 0) {
    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    // PR-perf — 위에서 upfront lock-read 한 proficiencyRaw 재사용(같은 tx 스냅샷, 중간
    //   proficiency 쓰기 없음 → 새 lock 과 동일 base). 중복 lock-read 제거.
    let prof = parseProficiencyForChar(proficiencyRaw, charSave);
    // 적립 — 승리 + 직업 보유 시. 적립량은 깊이 밴드 비례(2~5, 테마 2개당 +1).
    if (won && group !== "none") {
      const perKill = proficiencyPerKillAtDepth(depth);
      prof = addPoints(prof, group, perKill);
      proficiencyGained = perKill;
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
  // 레벨업 HP/MP 성장량 — 결과 카드 표시용(레벨당 고정분 + 오른 VIT·INT). 파생식과 동일 계수.
  const { hp: hpGain, mp: mpGain } =
    expResult.levelsGained > 0
      ? v2LevelGrowthHpMp({
          levelsGained: expResult.levelsGained,
          vitGained: statGains.vit ?? 0,
          intGained: statGains.int ?? 0,
        })
      : { hp: 0, mp: 0 };

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
        maxDepth:
          won && !isBossHunt && depth > frontierDepth
            ? depth
            : frontierDepth, // 최고 도달(수동 푸시 — 보스는 안 밂)
        // 보스 도전 결과 — 결과 카드가 보스 연출(전용 유니크·첫처치 칭호)에 사용.
        isBoss: isBossHunt,
        bossFirstKill,
        enemyName,
        won,
        expGained,
        proficiencyGained, // 직업군 숙련도 획득 (승리·직업 보유 시 +2).
        goldGained: goldNet, // 사냥자 실 수령 (세금 차감 후)
        goldGross,
        goldTaxed,
        levelsGained: expResult.levelsGained,
        statGains, // 레벨업 랜덤 성장으로 오른 1차 스탯 ({} = 레벨업 없음).
        hpGain, // 레벨업으로 오른 maxHp (레벨 고정분 + VIT).
        mpGain, // 레벨업으로 오른 maxMp (레벨 고정분 + INT).
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
        replay: forBatch
          ? toReplayPayloadLite(battleResult.finalState)
          : toReplayPayload(battleResult.finalState, 200),
        // replay UI 의 시작 HP — 사전 회복 적용 후 사냥 진입 시점.
        startPlayerHp: regenResult.hp,
        // 이 사냥의 시작 EXP/maxExp — replay UI 의 EXP 바 표시용
        // (사냥 후 변동은 결과 카드로 분리).
        expForBar: curExp,
        maxExpForBar: requiredExpToNextNullable(curLevel) ?? curExp,
        // 사냥 후 EXP/maxExp — 일괄(5/10회) 사냥 합산 결과 아래 캐릭터 정보 카드가
        // 현재 진행도(다음 레벨까지)를 정확히 보일 때 사용. 레벨업이 섞여도 맞도록
        // 서버의 applyExpGain 결과(expResult)를 그대로 노출.
        expAfter: expResult.exp,
        maxExpAfter:
          requiredExpToNextNullable(expResult.level) ?? expResult.exp,
      },
    },
  };
} // ← runOneHunt 끝

// 세금 수취자 표시 라벨 — 점령 길드명 > 솔로 점령자 닉네임 > 미점령(NPC) "거점 금고".
// runOneHunt 의 세금 owner 결정(§4)과 같은 분기를 표기용으로만 따라간다.
async function resolveTaxOwnerLabel(outpostId: string): Promise<string> {
  const [occ] = await db
    .select({
      occupiedByUserId: outpostOccupations.occupiedByUserId,
      occupiedByGuildId: outpostOccupations.occupiedByGuildId,
    })
    .from(outpostOccupations)
    .where(eq(outpostOccupations.outpostId, outpostId))
    .limit(1);
  if (!occ?.occupiedByUserId) return "거점 금고";
  if (occ.occupiedByGuildId != null) {
    const [g] = await db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, occ.occupiedByGuildId))
      .limit(1);
    if (g?.name) return `${g.name} 길드`;
  }
  return resolveUserDisplayName(occ.occupiedByUserId);
}

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 명시적 string — runOneHunt(중첩 클로저)에서 narrowing 이 풀리지 않게.
  const userId: string = maybeUserId;

  let body: {
    floor?: unknown; // = 프론티어 깊이(depth). 클라 호환 위해 키 이름 유지.
    outpostId?: unknown;
    count?: unknown; // 일괄 사냥 횟수(없으면 1=단판).
    boss?: unknown; // true = 테마 보스 도전(단판·고스태미나·isBoss 전투·보스 전용 드랍/칭호).
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

  // 테마 보스 도전 — 그 테마에 보스가 정의돼 있어야(파일럿 3테마). 없으면 조기 거부.
  const isBossHunt = body.boss === true;
  if (isBossHunt && !getThemeBossDef(depth)) {
    return Response.json({ ok: false, error: "no_boss" }, { status: 400 });
  }

  // outpostId 는 선택적. 있으면 점령자 lookup + 골드 세금 transfer.
  // 없으면(또는 모르는 id) 세금 없이 사냥자가 100% gold.
  let outpostId: string | null = null;
  if (typeof body.outpostId === "string" && body.outpostId.length > 0) {
    if (OUTPOSTS.some((o) => o.id === body.outpostId)) {
      outpostId = body.outpostId;
    }
  }

  // 일괄 사냥 횟수 — 1~MAX. 미전달/비정상이면 1(단판, 기존 동작). 보스 도전은 항상 단판.
  const count = isBossHunt
    ? 1
    : Math.max(1, Math.min(MAX_HUNT_BATCH, Math.floor(Number(body.count) || 1)));

  const result = await db.transaction(async (tx) => {
    const ctx: RunOneHuntCtx = {
      tx,
      userId,
      depth,
      dropFloor,
      isBossHunt,
      outpostId,
    };

    // === 일괄(batch) 루프 ===
    // count===1 은 기존 단판 응답 그대로(full 리플레이 포함, 무변경).
    if (count === 1) {
      return await runOneHunt(false, ctx);
    }
    // count>1 — 한 트랜잭션에서 N회. 스태미나 부족·HP 부족·사망이면 중단(완료분은 커밋).
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalProficiency = 0;
    let totalGold = 0;
    let totalGoldGross = 0; // 세전 합산 — 결과 카드 세금 줄 표기용.
    let totalGoldTaxed = 0;
    let levelsGained = 0;
    const statGains: Partial<Record<V2StatKey, number>> = {};
    let hpGained = 0; // 일괄 동안 레벨업으로 오른 maxHp 합산.
    let mpGained = 0; // 일괄 동안 레벨업으로 오른 maxMp 합산.
    const drops: DropResult = {};
    const droppedEquipments: V2EquipmentId[] = [];
    const droppedUniques: V2EquipmentId[] = [];
    let stoppedReason: "stamina" | "death" | "recovery" | "error" | null = null;
    let lastStamina: unknown = null;
    let finalHpAfter: number | null = null;
    let finalMaxHp: number | null = null;
    let finalMaxDepth: number | null = null;
    let expAfter: number | null = null;
    let maxExpAfter: number | null = null;
    // 일괄 결과 아래 캐릭터 정보 카드용 — 마지막 사냥 후 회복약 충전량 + MP 보유 여부.
    let hpCharges: number | null = null;
    let mpCharges: number | null = null;
    let playerMaxMp: number | null = null;
    let ejected: EjectedFrom | null = null;

    for (let i = 0; i < count; i++) {
      const r = await runOneHunt(true, ctx);
      if (!r.ok) {
        // 첫 사냥부터 실패면 단판과 동일하게 에러 응답 그대로(409 스태미나/HP·403 정책 등).
        //   버튼이 스태미나/회복 상태에선 비활성이라 실사용상 드물다. 중간(완료>0) 실패는
        //   완료분 요약 + 라벨로 중단(스태미나 소진·저체력·기타).
        if (completed === 0) return r;
        const err = (r.body as { error?: string }).error;
        if (err === "out_of_stamina") stoppedReason = "stamina";
        else if (err === "hp_zero") stoppedReason = "recovery";
        else stoppedReason = "error";
        lastStamina = (r.body as { stamina?: unknown }).stamina ?? lastStamina;
        break;
      }
      const res = r.body.result;
      completed++;
      if (res.won) wins++;
      else losses++;
      totalExp += res.expGained;
      totalProficiency += res.proficiencyGained;
      totalGold += res.goldGained;
      totalGoldGross += res.goldGross ?? res.goldGained;
      totalGoldTaxed += res.goldTaxed ?? 0;
      levelsGained += res.levelsGained;
      for (const [k, n] of Object.entries(res.statGains)) {
        const key = k as V2StatKey;
        statGains[key] = (statGains[key] ?? 0) + (n ?? 0);
      }
      hpGained += res.hpGain ?? 0;
      mpGained += res.mpGain ?? 0;
      for (const [id, n] of Object.entries(res.drops)) {
        const key = id as keyof DropResult;
        drops[key] = (drops[key] ?? 0) + (n ?? 0);
      }
      if (res.droppedEquipment) droppedEquipments.push(res.droppedEquipment);
      if (res.droppedUnique) droppedUniques.push(res.droppedUnique);
      if (res.ejected && !ejected) ejected = res.ejected;
      lastStamina = r.body.stamina;
      finalHpAfter = res.hpAfter;
      finalMaxHp = res.maxHp;
      finalMaxDepth = res.maxDepth;
      expAfter = res.expAfter;
      maxExpAfter = res.maxExpAfter;
      hpCharges = res.hpCharges ?? hpCharges;
      mpCharges = res.mpCharges ?? mpCharges;
      playerMaxMp = res.replay?.playerMaxMp ?? playerMaxMp;
      // 사망/저체력이면 다음 사냥이 서버에서 막히므로 즉시 중단(라벨 구분: 사망 vs 회복필요).
      if (res.hpAfter <= 0) {
        stoppedReason = "death";
        break;
      }
      if (!canHuntWithHp(res.hpAfter, res.maxHp)) {
        stoppedReason = "recovery";
        break;
      }
    }

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        stamina: lastStamina,
        batch: {
          attempted: count,
          completed,
          wins,
          losses,
          totalExp,
          totalProficiency,
          totalGold,
          totalGoldGross,
          totalGoldTaxed,
          levelsGained,
          statGains,
          hpGained,
          mpGained,
          drops,
          droppedEquipments,
          droppedUniques,
          stoppedReason,
          finalHpAfter,
          finalMaxHp,
          finalMaxDepth,
          expAfter,
          maxExpAfter,
          hpCharges,
          mpCharges,
          playerMaxMp,
          ejected,
        },
      },
    };
  });

  // 전체 소식 — 유니크 장비 드랍 broadcast. tx 커밋 후 side-effect 로 호출(중첩 트랜잭션
  // 회피 — guild-lodge 데드락 교훈). insertFeedEntry 가 opt-out/디바운스/실패삼킴을 자체
  // 처리하므로 응답엔 영향 없음. droppedUnique 는 승리 성공 응답 body 에만 존재.
  const resultBody = result.body as {
    result?: {
      droppedUnique?: V2EquipmentId | null;
      goldTaxed?: number;
      taxOwnerLabel?: string;
    };
    batch?: {
      droppedUniques?: V2EquipmentId[];
      totalGoldTaxed?: number;
      taxOwnerLabel?: string;
    };
  };
  const uniqueIds = resultBody.batch
    ? (resultBody.batch.droppedUniques ?? [])
    : resultBody.result?.droppedUnique
      ? [resultBody.result.droppedUnique]
      : [];
  for (const itemId of uniqueIds) {
    await insertFeedEntry(userId, "unique_drop", { itemId });
  }

  // 세금 수취자 라벨 — 결과에 세금이 있을 때만 1회 해석해 응답에 붙인다(일괄도 거점은
  // 요청 내내 동일하므로 1회면 충분). tx 밖 비잠금 read 라 직후 점령 변동과 어긋날 수
  // 있으나 표기 전용이라 허용. 실패해도 사냥 응답엔 영향 없어야 하므로 삼킨다.
  const taxedTotal = resultBody.batch
    ? (resultBody.batch.totalGoldTaxed ?? 0)
    : (resultBody.result?.goldTaxed ?? 0);
  if (outpostId && taxedTotal > 0) {
    try {
      const label = await resolveTaxOwnerLabel(outpostId);
      if (resultBody.batch) resultBody.batch.taxOwnerLabel = label;
      else if (resultBody.result) resultBody.result.taxOwnerLabel = label;
    } catch (err) {
      console.warn("[hunt] tax owner label resolve failed", err);
    }
  }

  return Response.json(result.body, { status: result.status });
}
