export function canViewGuildContributionDetails(role: string): boolean {
  return role === "master" || role === "manager";
}
