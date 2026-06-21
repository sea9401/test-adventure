import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  outpostDefenders,
  outpostOccupations,
  outpostTreasury,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { applyStance } from "@/adventure/character/stance";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  toPvpReplayPayload,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { isOutpostProtected } from "@/adventure/data/v2/outpostSiege";
import {
  RAID_TREASURY_STEAL_FRAC,
  V2_SETTLEMENT_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseWarVigor, vigorAfterBattle } from "@/adventure/data/v2/warVigor";

// POST /api/v2/outpost/attack — 정착지 전쟁 공격(약탈/정복). 설계: docs/v2-settlement-warfare-plan.md.
//   body: { outpostId, mode: "raid" | "conquest" }
//   PR-3a = raid 만. conquest 는 PR-3b(501 not_implemented).
//   raid = 수비 큐 1번을 "건강도(전쟁 전용 HP 이월)" 전투로 격파 → 거점 금고 50% 탈취(마을 유지).
//     큐가 비면 무혈 약탈(수비 등록 안 하면 금고가 털림 = 등록 인센티브).
//   플래그 off → 404. 옛 claim 라우트(3:3 토너먼트)는 손대지 않음 — PR-6 에서 제거.
//
// 🔑 건강도 MP 메모: resolveBattlePvP 는 매치 시작 시 MP 를 풀충전한다(engine-pvp). 따라서
//   vigor.mp 는 전투 "시작"에는 미반영(HP 가 전쟁 소모 축). 전투 후엔 hp/mp 둘 다 vigor 로 저장.
//   MP 시작값까지 vigor 로 반영하려면 공유 엔진 수정 필요 — 후속(부모 판단).

type WarVigorSave = { warVigor?: unknown; [k: string]: unknown };

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const mode = body.mode;
  if (mode !== "raid" && mode !== "conquest") {
    return Response.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  if (mode === "conquest") {
    return Response.json(
      { ok: false, error: "not_implemented" },
      { status: 501 },
    );
  }
  const outpost = OUTPOSTS.find((o) => o.id === outpostId);
  if (!outpost || outpost.neutral) {
    return Response.json(
      { ok: false, error: "no_such_outpost" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    // lock 순서: occupation FOR UPDATE → 수비 큐 → 세이브 → 금고 → 길드자원.
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .for("update")
        .limit(1)
    )[0];

    const attackerGuildId = await getGuildId(tx, userId);
    if (attackerGuildId == null) {
      return { status: 400, body: { ok: false as const, error: "no_guild" } };
    }
    const defenderGuildId = occRow?.occupiedByGuildId ?? null;
    if (defenderGuildId == null) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" },
      };
    }
    if (defenderGuildId === attackerGuildId) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_yours" },
      };
    }
    // 약탈은 보급선(영토 연속성) 게이트 없음 — 점령이 아니라 괴롭힘이라 어느 적 거점이든 가능.
    //   (정복=PR-3b 는 별도 결정.) 함락 직후 보호막은 존중.
    if (isOutpostProtected(occRow.protectedUntil, new Date(now))) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "protected",
          protectedUntil: occRow.protectedUntil.toISOString(),
        },
      };
    }

    // 수비 큐 — 현재 점령 길드의 등록자만(스테일 제외)·등록순. 1번 = 첫 수비자.
    const queue = await tx
      .select({ userId: outpostDefenders.userId })
      .from(outpostDefenders)
      .where(
        and(
          eq(outpostDefenders.outpostId, outpost.id),
          eq(outpostDefenders.guildId, defenderGuildId),
        ),
      )
      .orderBy(asc(outpostDefenders.registeredAt), asc(outpostDefenders.userId));
    const defender1Id = queue[0]?.userId ?? null;

    const attacker = await derivePlayerCombatV2(userId, tx);
    if (!attacker) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" },
      };
    }

    // 관련 세이브 사전 정렬 lock(공격자 + 수비자1) — cross-tx 데드락 회피.
    const lockIds = Array.from(
      new Set([userId, ...(defender1Id ? [defender1Id] : [])]),
    ).sort();
    for (const id of lockIds) {
      await lockSaveForUpdate<unknown>(tx, id, "character.v2", {});
    }
    const attackerSave = await lockSaveForUpdate<WarVigorSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const attackerName = await resolveUserDisplayName(userId);

    let won: boolean;
    let defenderName: string | null = null;
    let replay: ReplayPayload | null = null;

    if (defender1Id == null) {
      // 무방비 거점 → 무혈 약탈 성공.
      won = true;
    } else {
      const defender = await derivePlayerCombatV2(defender1Id, tx);
      if (!defender) {
        // 수비자 캐릭 손상/삭제 = 스테일 큐 행 → 정리 후 무혈 약탈.
        await tx
          .delete(outpostDefenders)
          .where(
            and(
              eq(outpostDefenders.outpostId, outpost.id),
              eq(outpostDefenders.userId, defender1Id),
            ),
          );
        won = true;
      } else {
        defenderName = await resolveUserDisplayName(defender1Id);
        const defenderSave = await lockSaveForUpdate<WarVigorSave>(
          tx,
          defender1Id,
          "character.v2",
          {},
        );
        const attackerVigor = parseWarVigor(attackerSave.warVigor);
        const defenderVigor = parseWarVigor(defenderSave.warVigor);

        // 건강도 → 시작 HP(이월). 최소 1 HP 가드. MP 는 엔진이 풀충전(위 메모).
        const aStartHp = Math.max(
          1,
          Math.floor(attacker.maxHp * attackerVigor.hp),
        );
        const dStartHp = Math.max(
          1,
          Math.floor(defender.maxHp * defenderVigor.hp),
        );
        const attackerStanced = applyStance(
          { ...attacker.player, hp: aStartHp },
          attacker.selectedStance,
        );
        const defenderStanced = applyStance(
          { ...defender.player, hp: dStartHp },
          defender.selectedStance,
        );
        const pvp = resolveBattlePvP(
          attackerStanced,
          defenderStanced,
          attackerName,
          defenderName,
          {
            pickAction: () => ({ kind: "attack" }),
            potions: { p1: {}, p2: {} },
          },
        );
        won = pvp.outcome === "p1_win";
        replay = toPvpReplayPayload(pvp.finalState, defenderName, 200);

        // 전투 후 양측 건강도 저장(남은 HP/MP 비율 + 갱신시각). 일반 HP/MP/골드는 불변(별개 축).
        const aMaxMp = attacker.player.maxMp ?? 0;
        const dMaxMp = defender.player.maxMp ?? 0;
        await upsertSave(tx, userId, "character.v2", {
          ...attackerSave,
          warVigor: vigorAfterBattle(
            pvp.finalState.p1.hp,
            attacker.maxHp,
            pvp.finalState.p1.mp,
            aMaxMp,
            now,
          ),
        });
        await upsertSave(tx, defender1Id, "character.v2", {
          ...defenderSave,
          warVigor: vigorAfterBattle(
            pvp.finalState.p2.hp,
            defender.maxHp,
            pvp.finalState.p2.mp,
            dMaxMp,
            now,
          ),
        });

        // 진 수비자는 큐에서 탈락(설계). 공격자 승리 시 수비자1 제거.
        if (won) {
          await tx
            .delete(outpostDefenders)
            .where(
              and(
                eq(outpostDefenders.outpostId, outpost.id),
                eq(outpostDefenders.userId, defender1Id),
              ),
            );
        }
      }
    }

    // 약탈 전리품 — 승리(무혈 포함) 시 거점 금고 50% 탈취 → 공격자 길드 골드.
    let stolenGold = 0;
    if (won) {
      const tRow = (
        await tx
          .select({ gold: outpostTreasury.gold })
          .from(outpostTreasury)
          .where(eq(outpostTreasury.outpostId, outpost.id))
          .for("update")
          .limit(1)
      )[0];
      const treasury = Math.max(0, tRow?.gold ?? 0);
      stolenGold = Math.floor(treasury * RAID_TREASURY_STEAL_FRAC);
      if (stolenGold > 0) {
        await tx
          .update(outpostTreasury)
          .set({ gold: treasury - stolenGold, updatedAt: sql`now()` })
          .where(eq(outpostTreasury.outpostId, outpost.id));
        const ag = await lockGuildResources(tx, attackerGuildId);
        await upsertGuildResources(tx, attackerGuildId, {
          gold: ag.gold + stolenGold,
        });
      }
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        mode: "raid" as const,
        won,
        stolenGold,
        defenderName,
        replay,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
