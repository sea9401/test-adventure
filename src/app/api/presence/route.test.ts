import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "player" as string | null),
  requireSession: vi.fn(async () => null as Response | null),
  values: vi.fn(),
  upsert: vi.fn(async () => undefined),
}));
vi.mock("@/db", () => ({ db: { insert: () => ({ values: mocks.values }) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/checkSession", () => ({ requireActiveDeviceSession: mocks.requireSession }));
vi.mock("@/lib/server/resolveActor", () => ({ resolveActor: async () => ({ name: "모험가", className: "warrior", title: null }) }));
vi.mock("@/lib/server/abuseLog", () => ({ clientIpFromRequest: () => null }));
vi.mock("@/lib/server/sameIpPresence", () => ({ recordSameIpPresenceSoon: vi.fn() }));
import { POST } from "./route";
import { APP_BUILD_VERSION } from "@/lib/clientVersion";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "deployed-build");
  mocks.ensureUser.mockResolvedValue("player");
  mocks.requireSession.mockResolvedValue(null);
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
});
afterEach(() => vi.unstubAllEnvs());

describe("presence version payload", () => {
  it("returns the deployment ID with the existing compatibility version after registering presence", async () => {
    const response = await POST(new Request("http://test/api/presence", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ buildVersion: APP_BUILD_VERSION, buildId: "deployed-build" });
    expect(mocks.values).toHaveBeenCalledWith({ userId: "player", name: "모험가", className: "warrior", title: null });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("preserves the inactive-device 410 without writing presence", async () => {
    mocks.requireSession.mockResolvedValue(new Response(null, { status: 410 }));
    const response = await POST(new Request("http://test/api/presence", { method: "POST" }));
    expect(response.status).toBe(410);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
