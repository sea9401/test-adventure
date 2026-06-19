// 길드 관리 권한 — 마스터(guilds.masterId) 또는 관리 직책(guild_members.role 이
// vice_master/manager). 길드 관리탭(초대·가입 신청 수락/거절·보유 거점 세율/정책)의
// 단일 게이트. 직책 임명/해임 자체는 마스터 전용 (/api/v2/guild/role).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";

export const GUILD_ROLE_MANAGER = "manager";
export const GUILD_ROLE_VICE_MASTER = "vice_master";

// 관리탭 접근이 가능한 role 값들 (마스터는 masterId 가 원천이라 별도).
export const GUILD_ADMIN_ROLES: readonly string[] = [
  GUILD_ROLE_VICE_MASTER,
  GUILD_ROLE_MANAGER,
];

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && GUILD_ADMIN_ROLES.includes(role);
}

// 마스터 또는 부마스터인 role 값(관리자 manager 는 제외) — 정착지 관리 탭 등 더 좁은 게이트용.
export function isMasterOrViceRole(role: string | null | undefined): boolean {
  return role === GUILD_ROLE_VICE_MASTER;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 길드 마스터(guilds.masterId) 또는 부마스터(role)만 true — 관리자(manager) 제외.
//   정착지 관리(건설·이름변경·칸 해금·단계 업그레이드)처럼 마스터/부마스터 전용 작업의 게이트.
export async function isGuildMasterOrVice(
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
  return isMasterOrViceRole(m?.role);
}

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
  return isAdminRole(m?.role);
}
