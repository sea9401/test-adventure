// 타일 전쟁(P3b) — policy 라우트가 합성 타일 id 를 수용해 점령행 정책/세율을 갱신하는지 검증.
//   (defend/lord/harvest 는 outpostId 직접 키라 tile id 로 이미 동작 — 코드 무변경. policy 만
//    카탈로그 메타 의존이라 이 PR 에서 tile 수용 추가 → 그 경로를 대표 테스트.)

import { describe, expect, it, vi } from "vitest";

const { updates } = vi.hoisted(() => ({ updates: [] as unknown[] }));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_TILE_WARFARE: true };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => {
  const occ = {
    occupiedByUserId: "u-test", // 점령자 본인 → 길드 admin 체크 우회.
    occupiedByGuildId: 7,
    policy: "open",
    taxRate: "0.100",
  };
  const sel: Record<string, unknown> = {};
  sel.from = () => sel;
  sel.where = () => sel;
  sel.for = () => sel;
  sel.limit = async () => [occ];
  const tx = {
    select: () => sel,
    update: () => ({
      set: (u: unknown) => ({
        where: async () => {
          updates.push(u);
        },
      }),
    }),
  };
  return {
    db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)) },
  };
});

import { POST } from "@/app/api/v2/outpost/policy/route";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/outpost/policy", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/outpost/policy — 타일 정착지", () => {
  it("길드 점령 타일(tile:2,3)에 세율 설정 → 점령행 갱신", async () => {
    updates.length = 0;
    const res = await POST(req({ outpostId: "tile:2,3", taxRate: 0.3 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; taxRate: string };
    expect(json.ok).toBe(true);
    expect(json.taxRate).toBe("0.300");
    expect(updates).toContainEqual({ taxRate: "0.300" });
  });

  it("정책(guild-only) 설정도 수용", async () => {
    updates.length = 0;
    const res = await POST(
      req({ outpostId: "tile:0,0", policy: "guild-only" }),
    );
    expect(res.status).toBe(200);
    expect(updates).toContainEqual({ policy: "guild-only" });
  });
});
