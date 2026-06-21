import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { outpostDefenders, outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { guildOwningOutpost } from "@/lib/server/v2Settlement";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// 정착지 전쟁 — 참여형 수비 등록 큐. 설계: docs/v2-settlement-warfare-plan.md §2.2.
//   POST { outpostId, action: "register" | "unregister" } — 내 길드 점령 거점에 수비 등록/해제.
//     길드원 누구나(마스터 전용 아님). 등록순(registeredAt) = 방어 배치 순서.
//   GET ?outpostId= — 그 거점의 수비 큐(등록순·이름).
//   플래그 V2_SETTLEMENT_WARFARE off → 404(기능 비활성·현행 byte-identical).

type Defender = {
  userId: string;
  name: string;
  registeredAt: string;
  isMe: boolean;
};

async function readQueue(
  outpostId: string,
  meUserId: string | null,
): Promise<Defender[]> {
  // 현재 점령 길드 — 양도/함락된 거점의 옛 소유 길드 수비 행은 큐에서 제외(스테일 방어 방지).
  //   미점령이면 빈 큐. 옛 행은 DB 에 남아도 무해(필터링)·재등록 시 현재 길드로 갱신.
  const occ = (
    await db
      .select({ g: outpostOccupations.occupiedByGuildId })
      .from(outpostOccupations)
      .where(eq(outpostOccupations.outpostId, outpostId))
      .limit(1)
  )[0];
  const ownerGuildId = occ?.g ?? null;
  if (ownerGuildId == null) return [];
  const rows = await db
    .select({
      userId: outpostDefenders.userId,
      registeredAt: outpostDefenders.registeredAt,
    })
    .from(outpostDefenders)
    .where(
      and(
        eq(outpostDefenders.outpostId, outpostId),
        eq(outpostDefenders.guildId, ownerGuildId),
      ),
    )
    .orderBy(asc(outpostDefenders.registeredAt), asc(outpostDefenders.userId));
  return Promise.all(
    rows.map(async (r) => ({
      userId: r.userId,
      name: await resolveUserDisplayName(r.userId),
      registeredAt: r.registeredAt.toISOString(),
      isMe: r.userId === meUserId,
    })),
  );
}

export async function GET(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  const url = new URL(req.url);
  const outpostId = url.searchParams.get("outpostId") ?? "";
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }
  const queue = await readQueue(outpostId, userId);
  return Response.json({ ok: true, queue });
}

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const action = body.action;
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }
  if (action !== "register" && action !== "unregister") {
    return Response.json(
      { ok: false, error: "invalid_action" },
      { status: 400 },
    );
  }

  // lock 순서: 점령행(guildOwningOutpost 가 FOR UPDATE) → 수비 큐 변경. 타 라우트 공통.
  const gate = await db.transaction(async (tx) => {
    const guildId = await guildOwningOutpost(tx, userId, outpostId);
    if (guildId == null) {
      return { ok: false as const, status: 403, error: "not_owner" };
    }
    if (action === "register") {
      // 한 거점 한 유저 1회(복합 PK). 점령 길드가 바뀐 뒤 남은 스테일 행은 현재 길드로
      //   갱신(guildId·registeredAt) — 옛 소유 시절 등록이 새 등록을 막지 않게.
      await tx
        .insert(outpostDefenders)
        .values({ outpostId, userId, guildId })
        .onConflictDoUpdate({
          target: [outpostDefenders.outpostId, outpostDefenders.userId],
          set: { guildId, registeredAt: sql`now()` },
        });
    } else {
      await tx
        .delete(outpostDefenders)
        .where(
          and(
            eq(outpostDefenders.outpostId, outpostId),
            eq(outpostDefenders.userId, userId),
          ),
        );
    }
    return { ok: true as const };
  });

  if (!gate.ok) {
    return Response.json(
      { ok: false, error: gate.error },
      { status: gate.status },
    );
  }
  const queue = await readQueue(outpostId, userId);
  return Response.json({ ok: true, queue });
}
