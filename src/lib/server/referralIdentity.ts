import "server-only";

import { createHmac } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import {
  accounts,
  passwordCredentials,
  referralRewardIdentities,
} from "@/db/schema";

type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

type ReferralLoginIdentity =
  | {
      kind: "oauth";
      provider: string;
      providerAccountId: string;
    }
  | {
      kind: "credentials";
      normalizedLoginId: string;
    };

function referralIdentitySecret(): string {
  const secret = process.env.REFERRAL_IDENTITY_SECRET?.trim();
  if (!secret) {
    throw new Error("REFERRAL_IDENTITY_SECRET is required");
  }
  return secret;
}

export function hashReferralLoginIdentity(identity: ReferralLoginIdentity): string {
  const message =
    identity.kind === "oauth"
      ? `oauth\0${identity.provider}\0${identity.providerAccountId}`
      : `credentials\0${identity.normalizedLoginId}`;
  return createHmac("sha256", referralIdentitySecret())
    .update(message, "utf8")
    .digest("hex");
}

async function referralIdentityHashesForUser(
  tx: DbExecutor,
  userId: string,
): Promise<string[]> {
  const [oauthRows, credentialRows] = await Promise.all([
    tx
      .select({
        provider: accounts.provider,
        providerAccountId: accounts.providerAccountId,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
    tx
      .select({ normalizedLoginId: passwordCredentials.normalizedLoginId })
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, userId)),
  ]);

  const hashes = [
    ...oauthRows.map((row) =>
      hashReferralLoginIdentity({
        kind: "oauth" as const,
        provider: row.provider,
        providerAccountId: row.providerAccountId,
      }),
    ),
    ...credentialRows.map((row) =>
      hashReferralLoginIdentity({
        kind: "credentials" as const,
        normalizedLoginId: row.normalizedLoginId,
      }),
    ),
  ];
  return [...new Set(hashes)].sort();
}

export async function reserveReferralIdentityClaims(
  tx: DbExecutor,
  userId: string,
): Promise<boolean> {
  const identityHashes = await referralIdentityHashesForUser(tx, userId);
  if (identityHashes.length === 0) return false;

  const inserted = await tx
    .insert(referralRewardIdentities)
    .values(identityHashes.map((identityHash) => ({ identityHash })))
    .onConflictDoNothing()
    .returning({ identityHash: referralRewardIdentities.identityHash });
  if (inserted.length === identityHashes.length) return true;

  if (inserted.length > 0) {
    await tx.delete(referralRewardIdentities).where(
      inArray(
        referralRewardIdentities.identityHash,
        inserted.map((row) => row.identityHash),
      ),
    );
  }
  return false;
}

export async function backfillReferralIdentityClaims(
  tx: DbExecutor,
  userId: string,
): Promise<void> {
  const identityHashes = await referralIdentityHashesForUser(tx, userId);
  if (identityHashes.length === 0) return;
  await tx
    .insert(referralRewardIdentities)
    .values(identityHashes.map((identityHash) => ({ identityHash })))
    .onConflictDoNothing()
    .returning({ identityHash: referralRewardIdentities.identityHash });
}
