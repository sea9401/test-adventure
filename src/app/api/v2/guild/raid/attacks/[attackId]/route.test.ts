import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, readGuildRaidReplay } = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  readGuildRaidReplay: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/guildRaidRead", () => ({ readGuildRaidReplay }));

import { GET } from "./route";

function context(attackId: string) {
  return { params: Promise.resolve({ attackId }) };
}

describe("길드 토벌전 리플레이 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
  });

  it("양의 정수가 아닌 기록 ID를 찾을 수 없음으로 처리한다", async () => {
    const response = await GET(new Request("http://localhost"), context("x"));
    expect(response.status).toBe(404);
    expect(readGuildRaidReplay).not.toHaveBeenCalled();
  });

  it("접근할 수 없는 기록을 노출하지 않는다", async () => {
    readGuildRaidReplay.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), context("12"));
    expect(response.status).toBe(404);
  });

  it("접근 가능한 기록을 반환한다", async () => {
    readGuildRaidReplay.mockResolvedValue({ attack: { id: 12 }, bossKind: "mountain_chief_hard" });
    const response = await GET(new Request("http://localhost"), context("12"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, attack: { id: 12 } });
  });
});
