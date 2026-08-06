function envEmailSet(envKey: string): Set<string> {
  const raw = process.env[envKey] ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function superAdminEmails(): Set<string> {
  return envEmailSet("ADMIN_EMAILS");
}

export function roleAdminEmails(
  role: "reward" | "sanction" | "readonly",
): Set<string> {
  const envKey = {
    reward: "OPS_REWARD_EMAILS",
    sanction: "OPS_SANCTION_EMAILS",
    readonly: "OPS_READONLY_EMAILS",
  }[role];
  return envEmailSet(envKey);
}

/** 가장·계정 작업처럼 최고 권한이 필요한 경로의 동기 검사용. */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (
    typeof email === "string" && superAdminEmails().has(email.toLowerCase())
  );
}

/** 어드민 페이지에 접근 가능한 모든 역할의 계정인지 동기 판정한다. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.toLowerCase();
  return (
    isSuperAdminEmail(normalized) ||
    roleAdminEmails("reward").has(normalized) ||
    roleAdminEmails("sanction").has(normalized) ||
    roleAdminEmails("readonly").has(normalized)
  );
}
