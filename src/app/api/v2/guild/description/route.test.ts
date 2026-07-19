import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUILD_DESCRIPTION_MAX } from "@/adventure/data/guild";

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    updatedGuild: null as Record<string, unknown> | null,
  };
  const tx = {
    select: vi.fn(() => {
      const rows = state.selectRows.shift() ?? [];
      const builder = {
        from: vi.fn(),
        where: vi.fn(),
        for: vi.fn(),
        limit: vi.fn(async () => rows),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      builder.for.mockReturnValue(builder);
      return builder;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        state.updatedGuild = values;
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  };
  return {
    state,
    tx,
    ensureUser: vi.fn(async () => "u-master"),
    rateLimit: vi.fn(() => null),
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function request(description: unknown) {
  return new Request("http://localhost/api/v2/guild/description", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.updatedGuild = null;
  mocks.state.selectRows = [[{ guildId: 7 }], [{ masterId: "u-master" }]];
  mocks.ensureUser.mockResolvedValue("u-master");
  mocks.rateLimit.mockReturnValue(null);
});

describe("길드 소개 저장", () => {
  it("마스터가 앞뒤 공백을 정리한 소개를 저장한다", async () => {
    const response = await POST(request("  함께 모험해요  "));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      description: "함께 모험해요",
    });
    expect(mocks.state.updatedGuild).toEqual({ description: "함께 모험해요" });
  });

  it("공백만 저장하면 소개를 제거한다", async () => {
    const response = await POST(request("   "));

    expect(response.status).toBe(200);
    expect(mocks.state.updatedGuild).toEqual({ description: null });
  });

  it("마스터가 아닌 길드원은 소개를 바꿀 수 없다", async () => {
    mocks.state.selectRows = [[{ guildId: 7 }], [{ masterId: "u-other" }]];

    const response = await POST(request("변경 시도"));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_master");
    expect(mocks.state.updatedGuild).toBeNull();
  });

  it("최대 길이를 넘는 소개는 거부한다", async () => {
    const response = await POST(request("가".repeat(GUILD_DESCRIPTION_MAX + 1)));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("description_too_long");
    expect(mocks.state.updatedGuild).toBeNull();
  });
});
