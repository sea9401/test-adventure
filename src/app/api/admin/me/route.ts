import {
  currentAdminCapabilities,
  currentAdminEmail,
  currentAdminRole,
  getAdminRoleConfigSummary,
  requireAdmin,
} from "@/lib/server/isAdmin";

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const [email, role, capabilities] = await Promise.all([
    currentAdminEmail(),
    currentAdminRole(),
    currentAdminCapabilities(),
  ]);

  return Response.json({
    ok: true,
    email,
    role,
    capabilities,
    roleConfig: getAdminRoleConfigSummary(),
  });
}
