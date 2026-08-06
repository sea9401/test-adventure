import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import {
  isBrowserPushSubscription,
  type BrowserPushSubscription,
} from "@/lib/push-notifications";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureUser } from "@/lib/server/ensureUser";
import { webPushPublicKey } from "@/lib/server/webPush";

type AuthenticationResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

async function authenticatedUser(req: Request): Promise<AuthenticationResult> {
  const userId = await ensureUser();
  if (!userId) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      ),
    };
  }
  const invalidSession = await requireActiveDeviceSession(userId, req);
  return invalidSession
    ? { ok: false, response: invalidSession }
    : { ok: true, userId };
}

export async function POST(req: Request) {
  const auth = await authenticatedUser(req);
  if (!auth.ok) return auth.response;
  if (!webPushPublicKey()) {
    return Response.json({ ok: false, error: "push_not_configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isBrowserPushSubscription(body)) {
    return Response.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }

  const subscription: BrowserPushSubscription = body;
  await db
    .insert(pushSubscriptions)
    .values({
      userId: auth.userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: auth.userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updatedAt: new Date(),
      },
    });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await authenticatedUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (
    typeof body?.endpoint !== "string" ||
    !body.endpoint.startsWith("https://") ||
    body.endpoint.length > 4_096
  ) {
    return Response.json({ ok: false, error: "invalid_endpoint" }, { status: 400 });
  }
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, body.endpoint),
        eq(pushSubscriptions.userId, auth.userId),
      ),
    );
  return Response.json({ ok: true });
}
