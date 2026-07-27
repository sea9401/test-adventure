const SITEVERIFY_URL = "https://api.hcaptcha.com/siteverify";

type HCaptchaResponse = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

export type HCaptchaVerificationResult =
  | { ok: true; hostname: string | null }
  | { ok: false; error: "unconfigured" | "invalid" | "unavailable"; codes?: string[] };

function expectedHostnames(): string[] {
  return [
    ...new Set(
      (
        process.env.HCAPTCHA_EXPECTED_HOSTNAMES ??
        process.env.TURNSTILE_EXPECTED_HOSTNAMES ??
        ""
      )
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function hcaptchaConfig(): {
  configured: boolean;
  siteKey: string | null;
  secretKey: string | null;
  expectedHostnames: string[];
} {
  const siteKey = process.env.HCAPTCHA_SITE_KEY?.trim() || null;
  const secretKey = process.env.HCAPTCHA_SECRET_KEY?.trim() || null;
  const hostnames = expectedHostnames();
  return {
    configured: Boolean(siteKey && secretKey),
    siteKey,
    secretKey,
    expectedHostnames: hostnames,
  };
}

export async function verifyHcaptchaToken(args: {
  token: string;
  remoteIp?: string | null;
}): Promise<HCaptchaVerificationResult> {
  const config = hcaptchaConfig();
  if (!config.configured || !config.secretKey || !config.siteKey) {
    return { ok: false, error: "unconfigured" };
  }
  const token = args.token.trim();
  if (!token || token.length > 4_096) return { ok: false, error: "invalid" };

  const body = new URLSearchParams({
    secret: config.secretKey,
    response: token,
    sitekey: config.siteKey,
  });
  if (args.remoteIp) body.set("remoteip", args.remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, error: "unavailable" };
    const result = (await response.json()) as HCaptchaResponse;
    const hostname =
      typeof result.hostname === "string" ? result.hostname.toLowerCase() : null;
    const hostnameMismatch =
      hostname != null &&
      hostname !== "not-provided" &&
      config.expectedHostnames.length > 0 &&
      !config.expectedHostnames.includes(hostname);
    if (!result.success || hostnameMismatch) {
      return {
        ok: false,
        error: "invalid",
        codes: hostnameMismatch
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
