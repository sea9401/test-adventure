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

function turnstileExpectedHostnames(): string[] {
  return [
    ...new Set(
      (process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function turnstileAction(activity: GuardedActivity): string {
  return `activity_${activity}`;
}

export function turnstileConfig(): {
  configured: boolean;
  siteKey: string | null;
  secretKey: string | null;
  expectedHostnames: string[];
} {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || null;
  const expectedHostnames = turnstileExpectedHostnames();
  return {
    configured: Boolean(siteKey && secretKey && expectedHostnames.length > 0),
    siteKey,
    secretKey,
    expectedHostnames,
  };
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
    const hostname =
      typeof result.hostname === "string" ? result.hostname.toLowerCase() : null;
    if (
      !result.success ||
      result.action !== turnstileAction(args.activity) ||
      !hostname ||
      !config.expectedHostnames.includes(hostname)
    ) {
      return {
        ok: false,
        error: "invalid",
        codes:
          result.success && hostname && !config.expectedHostnames.includes(hostname)
            ? ["hostname-mismatch"]
            : Array.isArray(result["error-codes"])
              ? result["error-codes"].slice(0, 8)
              : undefined,
      };
    }
    return { ok: true, hostname };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
