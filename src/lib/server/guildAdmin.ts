// 길드 관리 권한 — 마스터(guilds.masterId) 또는 관리자(guild_members.role === "manager").
// 길드 관리탭(초대·가입 신청 수락/거절·보유 거점 세율/정책)의 단일 게이트.
// 관리자 임명/해임 자체는 마스터 전용 (/api/v2/guild/role).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";

export const GUILD_ROLE_MANAGER = "manager";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function isGuildAdmin(
  tx: Tx | typeof db,
  guildId: number,
  userId: string,
): Promise<boolean> {
  const [g] = await tx
    .select({ masterId: guilds.masterId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  if (!g) return false;
  if (g.masterId === userId) return true;
  const [m] = await tx
    .select({ role: guildMembers.role })
    .from(guildMembers)
    .where(
      and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)),
    )
    .limit(1);
  return m?.role === GUILD_ROLE_MANAGER;
}
