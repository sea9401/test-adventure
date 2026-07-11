import { randomUUID } from "node:crypto";
import type { GuardedActivity } from "./activityGuard";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export type TurnstileVerificationResult =
  | { ok: true; hostname: string | null }
  | { ok: false; error: "unconfigured" | "invalid" | "unavailable"; codes?: string[] };

export function turnstileAction(activity: GuardedActivity): string {
  return `activity_${activity}`;
}

export function turnstileConfig(): {
  configured: boolean;
  siteKey: string | null;
  secretKey: string | null;
} {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || null;
  return { configured: Boolean(siteKey && secretKey), siteKey, secretKey };
}

export async function verifyTurnstileToken(args: {
  token: string;
  activity: GuardedActivity;
  remoteIp?: string | null;
}): Promise<TurnstileVerificationResult> {
  const config = turnstileConfig();
  if (!config.configured || !config.secretKey) return { ok: false, error: "unconfigured" };
  const token = args.token.trim();
  if (!token || token.length > 2_048) return { ok: false, error: "invalid" };

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        remoteip: args.remoteIp || undefined,
        idempotency_key: randomUUID(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, error: "unavailable" };
    const result = (await response.json()) as TurnstileResponse;
    if (!result.success || result.action !== turnstileAction(args.activity)) {
      return {
        ok: false,
        error: "invalid",
        codes: Array.isArray(result["error-codes"])
          ? result["error-codes"].slice(0, 8)
          : undefined,
      };
    }
    return {
      ok: true,
      hostname: typeof result.hostname === "string" ? result.hostname : null,
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
