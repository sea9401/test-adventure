import { auth } from "@/auth";

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type AdminRole = "readonly" | "reward" | "sanction" | "super";

export type AdminCapabilities = {
  read: boolean;
  reward: boolean;
  sanction: boolean;
  super: boolean;
};

function getRoleEmails(envKey: string): Set<string> {
  const raw = process.env[envKey] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function currentAdminRole(): Promise<AdminRole | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  if (getAdminEmails().has(email)) return "super";
  if (getRoleEmails("OPS_REWARD_EMAILS").has(email)) return "reward";
  if (getRoleEmails("OPS_SANCTION_EMAILS").has(email)) return "sanction";
  if (getRoleEmails("OPS_READONLY_EMAILS").has(email)) return "readonly";
  return null;
}

export function getAdminRoleConfigSummary(): Record<AdminRole, number> {
  return {
    super: getAdminEmails().size,
    reward: getRoleEmails("OPS_REWARD_EMAILS").size,
    sanction: getRoleEmails("OPS_SANCTION_EMAILS").size,
    readonly: getRoleEmails("OPS_READONLY_EMAILS").size,
  };
}

export async function currentAdminCapabilities(): Promise<AdminCapabilities> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const empty: AdminCapabilities = {
    read: false,
    reward: false,
    sanction: false,
    super: false,
  };
  if (!email) return empty;
  const superAdmin = getAdminEmails().has(email);
  const reward = superAdmin || getRoleEmails("OPS_REWARD_EMAILS").has(email);
  const sanction = superAdmin || getRoleEmails("OPS_SANCTION_EMAILS").has(email);
  const readonly =
    superAdmin ||
    reward ||
    sanction ||
    getRoleEmails("OPS_READONLY_EMAILS").has(email);
  return {
    read: readonly,
    reward,
    sanction,
    super: superAdmin,
  };
}

/** 관리자 이메일 리스트 (소문자). 랭킹 등 admin 제외 SQL 필터 합성에 사용. */
export function getAdminEmailsList(): string[] {
  return Array.from(getAdminEmails());
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  return (await currentAdminRole()) != null;
}

export async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  if (!(await isCurrentUserAdmin())) return new Response("forbidden", { status: 403 });
  return null;
}

export async function requireAdminRole(role: AdminRole): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const email = session.user.email?.toLowerCase();
  if (!email) return new Response("forbidden", { status: 403 });
  if (getAdminEmails().has(email)) return null;
  if (role === "readonly" && (await isCurrentUserAdmin())) return null;
  if (role === "reward" && getRoleEmails("OPS_REWARD_EMAILS").has(email)) return null;
  if (role === "sanction" && getRoleEmails("OPS_SANCTION_EMAILS").has(email)) return null;
  return new Response("forbidden", { status: 403 });
}

/** 현재 관리자 이메일(소문자). 감사 로그 기록용 — requireAdmin 통과 후 호출. */
export async function currentAdminEmail(): Promise<string> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? "unknown";
}
