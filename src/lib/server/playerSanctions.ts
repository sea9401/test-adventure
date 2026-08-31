import "server-only";

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, userSanctions } from "@/db/schema";
import type { PlayerSanctionStatus } from "@/lib/playerSanctions";

const PERMANENT_YEAR = 9_999;

export async function readPlayerSanctionStatus(
  userId: string,
  now = new Date(),
): Promise<PlayerSanctionStatus | null> {
  const [userRows, warningRows] = await Promise.all([
    db
      .select({
        bannedUntil: users.bannedUntil,
        banReason: users.banReason,
        tradeSuspendedUntil: users.tradeSuspendedUntil,
        tradeSuspensionReason: users.tradeSuspensionReason,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        id: userSanctions.id,
        reason: userSanctions.reason,
        createdAt: userSanctions.createdAt,
      })
      .from(userSanctions)
      .where(
        and(
          eq(userSanctions.userId, userId),
          eq(userSanctions.type, "warn"),
          isNull(userSanctions.acknowledgedAt),
        ),
      )
      .orderBy(desc(userSanctions.id))
      .limit(1),
  ]);

  const user = userRows[0];
  if (!user) return null;

  const bannedUntil = user.bannedUntil;
  const warning = warningRows[0];
  const currentTradeUntil = user.tradeSuspendedUntil;
  const tradeSuspensionRows =
    currentTradeUntil && currentTradeUntil.getTime() > now.getTime()
      ? await db
          .select({
            id: userSanctions.id,
            reason: userSanctions.reason,
            expiresAt: userSanctions.expiresAt,
            acknowledgedAt: userSanctions.acknowledgedAt,
          })
          .from(userSanctions)
          .innerJoin(users, eq(users.id, userSanctions.userId))
          .where(
            and(
              eq(userSanctions.userId, userId),
              inArray(userSanctions.type, ["trade_suspend", "trade_ban"]),
              isNull(userSanctions.liftedAt),
              gt(userSanctions.expiresAt, now),
              eq(userSanctions.expiresAt, users.tradeSuspendedUntil),
            ),
          )
          .orderBy(desc(userSanctions.id))
          .limit(1)
      : [];
  const tradeSuspension =
    currentTradeUntil && currentTradeUntil.getTime() > now.getTime()
      ? tradeSuspensionRows.find(
          (row) => row.expiresAt?.getTime() === currentTradeUntil.getTime(),
        )
      : undefined;
  return {
    suspension:
      bannedUntil && bannedUntil.getTime() > now.getTime()
        ? {
            reason: user.banReason ?? "운영 정책에 따라 계정 이용이 제한되었습니다.",
            expiresAt: bannedUntil.toISOString(),
            permanent: bannedUntil.getUTCFullYear() >= PERMANENT_YEAR,
          }
        : null,
    tradeSuspension: tradeSuspension
      ? {
          id: tradeSuspension.id,
          reason:
            tradeSuspension.reason ||
            user.tradeSuspensionReason ||
            "운영 정책에 따라 거래 이용이 제한되었습니다.",
          expiresAt: tradeSuspension.expiresAt!.toISOString(),
          permanent: tradeSuspension.expiresAt!.getUTCFullYear() >= PERMANENT_YEAR,
          acknowledged: tradeSuspension.acknowledgedAt !== null,
        }
      : null,
    warning: warning
      ? {
          id: warning.id,
          reason: warning.reason || "운영 정책 위반 가능성이 확인되어 경고가 부과되었습니다.",
          createdAt: warning.createdAt.toISOString(),
        }
      : null,
  };
}
