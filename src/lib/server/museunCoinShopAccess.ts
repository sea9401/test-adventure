import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordCredentials, users } from "@/db/schema";
import { canPassMuseunCoinShopProxy } from "@/lib/museunCoinShopGate";

const DEFAULT_REVIEW_LOGIN_IDS = [
  "gcrb-review-01",
  "gcrb-review-02",
  "gcrb-review-03",
] as const;

function normalizedCsv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type MuseunCoinShopIdentity = {
  email: string;
  loginId: string | null;
};

export function isMuseunCoinShopIdentityAllowed(
  identity: MuseunCoinShopIdentity,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true") return true;

  const adminEmails = normalizedCsv(env.ADMIN_EMAILS);
  if (adminEmails.has(identity.email.trim().toLowerCase())) return true;

  const configuredReviewLoginIds = normalizedCsv(
    env.MUSEUN_COIN_SHOP_REVIEW_LOGIN_IDS,
  );
  const reviewLoginIds =
    configuredReviewLoginIds.size > 0
      ? configuredReviewLoginIds
      : new Set(DEFAULT_REVIEW_LOGIN_IDS);

  return (
    identity.loginId !== null &&
    reviewLoginIds.has(identity.loginId.trim().toLowerCase())
  );
}

/** 공개 전에는 운영자 본인과 지정된 심의용 비밀번호 계정만 상점에 입장시킨다. */
export async function canAccessMuseunCoinShop(userId: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true") return true;
  if (canPassMuseunCoinShopProxy({ id: userId })) return true;

  const [identity] = await db
    .select({
      email: users.email,
      loginId: passwordCredentials.normalizedLoginId,
    })
    .from(users)
    .leftJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  return identity ? isMuseunCoinShopIdentityAllowed(identity) : false;
}
