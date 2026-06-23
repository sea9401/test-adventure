import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { clearAffiliationInTx } from "@/lib/server/guildAffiliation";
import { neutralizeGuildTiles } from "@/lib/server/tileOccupation";

// POST /api/v2/guild/disband — 길드 해산 (마스터 전용). body: { confirm: <길드 이름> }
//
// 되돌릴 수 없는 파괴적 작업이라 길드 이름 입력으로 확인(계정 삭제와 동일한 안전장치).
// 처리: ① 전 길드원 affiliation 을 "무소속" 으로 정리(FK 캐스케이드는 character.v2 JSON 을
// 못 건드림) ② guildMembers 즉시 삭제(멤버가 소속에 묶여 재가입 못 하는 것 방지) ③ guilds 를
// 툼스톤(disbandedAt) 마킹 — 하드 삭제 아님.
//   · 이름은 30일(GUILD_DISBANDED_NAME_HOLD_DAYS) 보류되고, guilds-cleanup 크론이 그때 하드
//     삭제하며 FK 캐스케이드로 금고(v2GuildResources)·마을·라인업을 정리하고 점령 거점을 SET NULL.
//   · 금고 골드는 멤버가 없어 회수 불가 = 사실상 즉시 소멸(결정대로 sink). 거점/금고를 tx 에서
//     직접 안 건드려 claim 라우트와의 reciprocal-siege 데드락을 피한다.
//   · 모든 read 가 disbandedAt IS NULL 로 필터하므로 툼스톤 즉시 길드는 사실상 사라진다.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";

  const result = await db.transaction(async (tx) => {
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const [guild] = await tx
      .select({ masterId: guilds.masterId, name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, mem.guildId))
      .for("update")
      .limit(1);
    if (!guild || guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }
    if (confirm !== guild.name) {
      return {
        status: 400,
        body: { ok: false as const, error: "confirm_mismatch" },
      };
    }

    // ① 전 길드원 affiliation 정리(캐스케이드는 character.v2 JSON 의 소속 표기를 못 건드림).
    const members = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, mem.guildId));
    for (const m of members) {
      await clearAffiliationInTx(tx, m.userId);
    }
    // ② 멤버 즉시 해제(소속에 묶여 재가입 못 하는 것 방지) ③ 길드 툼스톤(이름 30일 보류).
    // 금고/마을/라인업/거점 정리는 guilds-cleanup 크론의 하드 삭제 캐스케이드에 위임.
    await tx
      .delete(guildMembers)
      .where(eq(guildMembers.guildId, mem.guildId));
    // 해산 — 그 길드의 전 타일 영토를 중립화(빈 땅). 영토=길드 소유라 길드가 사라지면 영토도
    //   소멸: 점령행·거점 금고·수비큐·영주·정착지 행 즉시 제거(크론 캐스케이드 전 스테일 방지).
    await neutralizeGuildTiles(tx, mem.guildId);
    await tx
      .update(guilds)
      .set({ disbandedAt: new Date() })
      .where(eq(guilds.id, mem.guildId));
    return {
      status: 200,
      body: { ok: true as const, disbanded: true, guildId: mem.guildId },
    };
  });

  return Response.json(result.body, { status: result.status });
}
