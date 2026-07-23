import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-smith"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildIdByUser: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildFacilities", () => ({
  readGuildSmithyLevel: vi.fn(),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 0 })),
  upsertGuildResources: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { readGuildSmithyLevel } from "@/lib/server/guildFacilities";
import { GET, POST } from "./route";

function deliveryRequest() {
  return new Request("http://localhost/api/v2/guild/workshop/delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryId: "daily_crafted_any", iid: "crafted-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readGuildSmithyLevel).mockResolvedValue(0);
});

describe("길드 제작소 일일 납품", () => {
  it("제작소가 없으면 조회를 거부한다", async () => {
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "smithy_required",
    });
  });

  it("제작소가 없으면 장비를 소비하기 전에 납품을 거부한다", async () => {
    const response = await POST(deliveryRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "smithy_required",
    });
  });
});
