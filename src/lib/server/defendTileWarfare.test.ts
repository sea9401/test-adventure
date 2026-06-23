// 타일 전쟁 검증(P4-prep) — defend 라우트가 합성 타일 id 에 수비 등록하는지.
//   defend 는 outpostId 직접 키(P3b 무변경)라 tile id 로 동작함을 end-to-end 로 확인.

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_SETTLEMENT_WARFARE: true };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-def"),
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  guildOwningOutpost: vi.fn(async () => 7), // 내가 점령 길드(7) 멤버
}));
vi.mock("@/lib/server/serverFeed", () => ({
  resolveUserDisplayName: vi.fn(async () => "수비자"),
}));
vi.mock("@/db", () => {
  function rows(cols?: unknown): Promise<unknown[]> {
    if (cols && typeof cols === "object" && "g" in (cols as object))
      return Promise.resolve([{ g: 7 }]); // readQueue 점령행 길드
    return Promise.resolve([]); // 수비 큐(등록 후 비어있다 가정·응답엔 영향만)
  }
  function chain(cols?: unknown): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => rows(cols);
    c.limit = () => rows(cols);
    return c;
  }
  const tx = {
    select: (cols?: unknown) => chain(cols),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.inserts.push(v);
        return {
          onConflictDoUpdate: async () => {},
          onConflictDoNothing: async () => {},
        };
      },
    }),
    delete: () => ({ where: async () => {} }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: (cols?: unknown) => chain(cols),
    },
  };
});

import { POST } from "@/app/api/v2/outpost/defend/route";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/outpost/defend", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/outpost/defend — 타일 정착지 수비 등록", () => {
  afterEach(() => {
    h.inserts = [];
    vi.clearAllMocks();
  });

  it("길드 점령 타일에 수비 등록 → outpost_defenders 에 tile id 로 insert", async () => {
    const res = await POST(req({ outpostId: "tile:5,5", action: "register" }));
    expect(res.status).toBe(200);
    expect(h.inserts).toContainEqual({
      outpostId: "tile:5,5",
      userId: "u-def",
      guildId: 7,
    });
  });
});
