import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isSuperAdminEmail } from "@/lib/server/isAdmin";

export const ADMIN_IMPERSONATION_COOKIE = "admin_impersonation";
export const ADMIN_IMPERSONATION_UI_COOKIE = "admin_impersonation_ui";
export const ADMIN_IMPERSONATION_TTL_SECONDS = 60 * 60;

export type AdminImpersonation = {
  adminId: string;
  targetUserId: string;
  issuedAt: number;
  expiresAt: number;
};

function secret(): string | null {
  const value = process.env.AUTH_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

export function isAdminImpersonationEnabled(): boolean {
  if (!secret()) return false;
  if (process.env.IS_STAGING === "true") return true;
  if (process.env.ADMIN_IMPERSONATION_ENABLED !== "true") return false;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_ADMIN_IMPERSONATION !== "true"
  ) {
    return false;
  }
  return true;
}

function signature(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function encodeAdminImpersonation(
  value: AdminImpersonation,
  key: string,
): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}

export function decodeAdminImpersonation(
  token: string,
  key: string,
  now = Date.now(),
): AdminImpersonation | null {
  const [payload, rawSignature, extra] = token.split(".");
  if (!payload || !rawSignature || extra) return null;
  let supplied: Buffer;
  try {
    supplied = Buffer.from(rawSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(payload, key);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<AdminImpersonation>;
    if (
      typeof parsed.adminId !== "string" ||
      parsed.adminId.length === 0 ||
      typeof parsed.targetUserId !== "string" ||
      parsed.targetUserId.length === 0 ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= now ||
      parsed.issuedAt > now + 60_000 ||
      parsed.expiresAt - parsed.issuedAt >
        (ADMIN_IMPERSONATION_TTL_SECONDS + 60) * 1_000
    ) {
      return null;
    }
    return parsed as AdminImpersonation;
  } catch {
    return null;
  }
}

export async function readAdminImpersonationFor(
  adminId: string,
  adminEmail: string | null | undefined,
): Promise<AdminImpersonation | null> {
  const key = secret();
  if (!key || !isAdminImpersonationEnabled() || !isSuperAdminEmail(adminEmail)) {
    return null;
  }
  const token = (await cookies()).get(ADMIN_IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  const decoded = decodeAdminImpersonation(token, key);
  return decoded?.adminId === adminId ? decoded : null;
}

export async function getActiveAdminImpersonation(): Promise<AdminImpersonation | null> {
  if (
    !isAdminImpersonationEnabled() ||
    !(await cookies()).has(ADMIN_IMPERSONATION_COOKIE)
  ) {
    return null;
  }
  const session = await auth();
  if (!session?.user?.id) return null;
  return readAdminImpersonationFor(session.user.id, session.user.email);
}

export async function setAdminImpersonation(
  adminId: string,
  targetUserId: string,
): Promise<AdminImpersonation> {
  const key = secret();
  if (!key || !isAdminImpersonationEnabled()) {
    throw new Error("impersonation_disabled");
  }
  const issuedAt = Date.now();
  const value: AdminImpersonation = {
    adminId,
    targetUserId,
    issuedAt,
    expiresAt: issuedAt + ADMIN_IMPERSONATION_TTL_SECONDS * 1_000,
  };
  (await cookies()).set(
    ADMIN_IMPERSONATION_COOKIE,
    encodeAdminImpersonation(value, key),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_IMPERSONATION_TTL_SECONDS,
      priority: "high",
    },
  );
  (await cookies()).set(ADMIN_IMPERSONATION_UI_COOKIE, "1", {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_IMPERSONATION_TTL_SECONDS,
  });
  return value;
}

export async function clearAdminImpersonation(): Promise<void> {
  (await cookies()).set(ADMIN_IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  (await cookies()).set(ADMIN_IMPERSONATION_UI_COOKIE, "", {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
