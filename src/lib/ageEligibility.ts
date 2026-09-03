import { createHmac, timingSafeEqual } from "node:crypto";

export const MINIMUM_SERVICE_AGE = 14;
export const AGE_ELIGIBILITY_COOKIE = "msmsge_age_14_confirmed";
export const AGE_ELIGIBILITY_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const TOKEN_VERSION = "v1";
const FUTURE_CLOCK_SKEW_SECONDS = 5 * 60;
const SIGNING_CONTEXT = "msmsge:minimum-age-eligibility:";

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(SIGNING_CONTEXT)
    .update(payload)
    .digest();
}

export function createAgeEligibilityToken(
  secret: string | undefined,
  nowMs = Date.now(),
): string | null {
  const key = secret?.trim();
  if (!key || !Number.isFinite(nowMs) || nowMs < 0) return null;

  const issuedAt = Math.floor(nowMs / 1000);
  const payload = `${TOKEN_VERSION}.${issuedAt}`;
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}

export function verifyAgeEligibilityToken(
  value: string | null | undefined,
  secret: string | undefined,
  nowMs = Date.now(),
): boolean {
  const key = secret?.trim();
  if (!value || !key || !Number.isFinite(nowMs) || nowMs < 0) return false;

  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  if (!/^\d{1,12}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) {
    return false;
  }

  const issuedAt = Number(parts[1]);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(issuedAt)) return false;
  if (issuedAt > nowSeconds + FUTURE_CLOCK_SKEW_SECONDS) return false;
  if (nowSeconds - issuedAt > AGE_ELIGIBILITY_MAX_AGE_SECONDS) return false;

  const supplied = Buffer.from(parts[2], "base64url");
  const expected = signature(`${parts[0]}.${parts[1]}`, key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
