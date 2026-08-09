import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; value: unknown }>,
  ensureUser: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => mocks.rows),
      })),
    })),
  },
}));

import { GET } from "./route";

describe("GET /api/v2/me/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u-test");
    mocks.rows = [];
  });

  it("inventory.v2의 숙련 증서 수량을 노출한다", async () => {
    mocks.rows = [
      { key: "character.v2", value: {} },
      { key: "inventory.v2", value: { masteryCertificates: 10 } },
    ];

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      masteryCertificates: 10,
    });
  });

  it("손상된 음수 증서 수량은 0으로 정규화한다", async () => {
    mocks.rows = [
      { key: "inventory.v2", value: { masteryCertificates: -7.5 } },
    ];

    const response = await GET();

    expect(await response.json()).toMatchObject({ masteryCertificates: 0 });
  });
});
