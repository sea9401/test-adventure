import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ugcPolicyConsents } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { UGC_POLICY_VERSION } from "@/lib/ugc-safety";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const [row] = await db
    .select({ acceptedAt: ugcPolicyConsents.acceptedAt })
    .from(ugcPolicyConsents)
    .where(
      and(
        eq(ugcPolicyConsents.userId, userId),
        eq(ugcPolicyConsents.version, UGC_POLICY_VERSION),
      ),
    )
    .limit(1);

  return Response.json({
    version: UGC_POLICY_VERSION,
    accepted: Boolean(row),
    acceptedAt: row?.acceptedAt.getTime() ?? null,
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { accepted?: unknown; version?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (body.accepted !== true || body.version !== UGC_POLICY_VERSION) {
    return new Response("explicit consent required", { status: 400 });
  }

  const [row] = await db
    .insert(ugcPolicyConsents)
    .values({ userId, version: UGC_POLICY_VERSION })
    .onConflictDoNothing()
    .returning({ acceptedAt: ugcPolicyConsents.acceptedAt });

  if (row) {
    return Response.json({
      accepted: true,
      version: UGC_POLICY_VERSION,
      acceptedAt: row.acceptedAt.getTime(),
    });
  }

  const [existing] = await db
    .select({ acceptedAt: ugcPolicyConsents.acceptedAt })
    .from(ugcPolicyConsents)
    .where(
      and(
        eq(ugcPolicyConsents.userId, userId),
        eq(ugcPolicyConsents.version, UGC_POLICY_VERSION),
      ),
    )
    .limit(1);
  return Response.json({
    accepted: true,
    version: UGC_POLICY_VERSION,
    acceptedAt: existing?.acceptedAt.getTime() ?? Date.now(),
  });
}
