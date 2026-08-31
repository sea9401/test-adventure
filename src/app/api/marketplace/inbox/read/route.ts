import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox } from "@/db/schema";
import { inboxClaimState } from "@/lib/server/inboxPayload";
import { ensureUser } from "@/lib/server/ensureUser";

// POST /api/marketplace/inbox/read — 상세를 연 받은 우편의 읽음 상태를 멱등 갱신한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(marketplaceInbox)
      .where(
        and(
          eq(marketplaceInbox.id, id),
          eq(marketplaceInbox.userId, userId),
        ),
      )
      .for("update");
    const row = rows[0];
    if (!row) return null;

    const claimState = inboxClaimState(row.kind, row.payload);
    const now = new Date();
    const readAt = row.readAt ?? now;
    const claimedAt =
      row.claimedAt ?? (claimState === "none" ? readAt : null);
    const update: { readAt?: Date; claimedAt?: Date } = {};
    if (!row.readAt) update.readAt = readAt;
    if (!row.claimedAt && claimState === "none") update.claimedAt = claimedAt!;

    if (Object.keys(update).length > 0) {
      await tx
        .update(marketplaceInbox)
        .set(update)
        .where(
          and(
            eq(marketplaceInbox.id, id),
            eq(marketplaceInbox.userId, userId),
          ),
        );
    }

    return { claimState, readAt, claimedAt };
  });

  if (!result) return new Response("not found", { status: 404 });

  return Response.json({
    ok: true,
    claimState: result.claimState,
    readAt: result.readAt.toISOString(),
    claimedAt: result.claimedAt?.toISOString() ?? null,
  });
}
