import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// POST /api/marketplace/inbox/delete — 완료된 받은 우편을 수신자에게만 숨긴다.
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
      .select({
        claimedAt: marketplaceInbox.claimedAt,
        recipientDeletedAt: marketplaceInbox.recipientDeletedAt,
      })
      .from(marketplaceInbox)
      .where(
        and(
          eq(marketplaceInbox.id, id),
          eq(marketplaceInbox.userId, userId),
        ),
      )
      .for("update");
    const row = rows[0];
    if (!row) return { kind: "not_found" as const };
    if (row.recipientDeletedAt) {
      return {
        kind: "deleted" as const,
        deletedAt: row.recipientDeletedAt,
      };
    }
    if (!row.claimedAt) return { kind: "not_completed" as const };

    const deletedAt = new Date();
    await tx
      .update(marketplaceInbox)
      .set({ recipientDeletedAt: deletedAt })
      .where(
        and(
          eq(marketplaceInbox.id, id),
          eq(marketplaceInbox.userId, userId),
          isNull(marketplaceInbox.recipientDeletedAt),
        ),
      );

    return { kind: "deleted" as const, deletedAt };
  });

  if (result.kind === "not_found") {
    return new Response("not found", { status: 404 });
  }
  if (result.kind === "not_completed") {
    return Response.json({ error: "not_completed" }, { status: 409 });
  }
  return Response.json({
    ok: true,
    deletedAt: result.deletedAt.toISOString(),
  });
}
