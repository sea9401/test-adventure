import { ensureUser } from "@/lib/server/ensureUser";
import { chuseokEventService, validChuseokRequestId } from "@/lib/server/chuseokEvent";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";

const failure = (error: string, status: number) => Response.json({ ok: false, error }, { status });

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return failure("unauthorized", 401);
  try {
    return Response.json(await chuseokEventService.read(userId));
  } catch (error) {
    console.error("[chuseok] read failed", error);
    return failure("server_error", 500);
  }
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return failure("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:chuseok", userLimit: 20, ipLimit: 100, windowMs: 60_000 });
  if (limited) return limited;
  let body: unknown;
  try { body = await req.json(); } catch { return failure("invalid_json", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("bad_request", 400);
  const { action, requestId } = body as Record<string, unknown>;
  if (action !== "attendance" && action !== "attack") return failure("bad_request", 400);
  if (action === "attack" && !validChuseokRequestId(requestId)) return failure("bad_request_id", 400);
  try {
    const result = action === "attendance"
      ? await chuseokEventService.attend(userId)
      : await chuseokEventService.attack(userId, requestId as string);
    if (!result.ok) {
      const status = result.error === "daily_limit" ? 429 : result.error === "event_ended" ? 410 : result.error === "bad_request_id" ? 400 : 409;
      return failure(result.error, status);
    }
    if ("reward" in result) recordEconomyEventSoon({ userId, eventType: "reward.chuseok_attendance", itemKind: "consumable", itemId: "stamina_potion", quantity: result.reward });
    return Response.json(result);
  } catch (error) {
    console.error("[chuseok] action failed", error);
    return failure("server_error", 500);
  }
}
