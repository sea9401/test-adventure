import { isSuperAdminEmail } from "@/lib/server/isAdmin";

export type ArenaAccountRow = {
  email: string | null | undefined;
};

// ADMIN_EMAILS 운영 계정은 일반 유저의 아레나 상대·순위·챔피언십 후보에서 제외한다.
// 닉네임("[운영자]")은 변경될 수 있으므로 서버 권위 이메일 설정을 기준으로 판정한다.
export function excludeArenaOperatorAccounts<T extends ArenaAccountRow>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => !isSuperAdminEmail(row.email));
}
