// 길드 멤버십 라우트(leave/kick/transfer/disband) 통합 테스트 — @/db 트랜잭션을 모킹.
// guildMembers 는 한 라우트에서 두 번 select 되므로(본인 멤버십 → 카운트/대상) 호출 순서대로
// 결과를 내주는 큐(gmQueue)로 구동한다. affiliation/activityLog 는 spy 로 호출만 검증.
// ⚠️ 한계: mock 이라 WHERE 절 회귀까진 못 잡음 — 게이트 분기(인증/마스터/대상)와 부정 경로 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { q, spies } = vi.hoisted(() => ({
  q: {
    userId: "u-me" as string | null,
    gmQueue: [] as unknown[][], // guildMembers select 결과(호출 순서대로)
    guildRows: [] as unknown[], // guilds select 결과
  },
  spies: {
    del: vi.fn(),
    upd: vi.fn(),
    ins: vi.fn(),
    clearAffiliation: vi.fn(async () => {}),
    logActivity: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => q.userId),
}));
vi.mock("@/lib/server/guildAffiliation", () => ({
  clearAffiliationInTx: spies.clearAffiliation,
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: spies.logActivity,
}));
vi.mock("@/db", async () => {
  const { guildMembers, outpostOccupations } = await import("@/db/schema");
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {
      where: () => c,
      for: () => c,
      limit: () => c,
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const resolve = (tbl: unknown): unknown[] =>
    tbl === guildMembers
      ? (q.gmQueue.shift() ?? [])
      : tbl === outpostOccupations
        ? [] // revert 헬퍼: 멤버 소유 타일 없음 → no-op(이 스위트는 멤버십 로직만 검증)
        : q.guildRows;
  const tx = {
    select: () => ({ from: (tbl: unknown) => chain(resolve(tbl)) }),
    update: () => {
      spies.upd();
      return { set: () => ({ where: async () => undefined }) };
    },
    insert: () => {
      spies.ins();
      return { values: () => ({ onConflictDoUpdate: async () => undefined }) };
    },
    delete: () => {
      spies.del();
      return { where: async () => undefined };
    },
  };
  return {
    db: { transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)) },
  };
});

import { POST as leavePOST } from "@/app/api/v2/guild/leave/route";
import { POST as kickPOST } from "@/app/api/v2/guild/kick/route";
import { POST as transferPOST } from "@/app/api/v2/guild/transfer/route";
import { POST as disbandPOST } from "@/app/api/v2/guild/disband/route";

function req(body: unknown): Request {
  return new Request("http://t/api/v2/guild/x", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  q.userId = "u-me";
  q.gmQueue = [];
  q.guildRows = [];
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v2/guild/leave", () => {
  it("미인증 → 401", async () => {
    q.userId = null;
    const res = await leavePOST();
    expect(res.status).toBe(401);
  });

  it("소속 없음 → 403 no_guild", async () => {
    q.gmQueue = [[]];
    const res = await leavePOST();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_guild");
  });

  it("마스터 + 다른 멤버 있음 → 409 transfer_required (탈퇴 안 됨)", async () => {
    q.gmQueue = [[{ guildId: 7 }], [{ cnt: 2 }]];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await leavePOST();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("transfer_required");
    expect(spies.del).not.toHaveBeenCalled();
  });

  it("마스터 + 혼자 → 409 disband_required", async () => {
    q.gmQueue = [[{ guildId: 7 }], [{ cnt: 1 }]];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await leavePOST();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("disband_required");
  });

  it("일반 멤버 → 200, 삭제+무소속+쿨다운+로그", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-other" }];
    const res = await leavePOST();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(spies.del).toHaveBeenCalledTimes(1);
    expect(spies.clearAffiliation).toHaveBeenCalledWith(
      expect.anything(),
      "u-me",
    );
    expect(spies.ins).toHaveBeenCalledTimes(1); // 쿨다운 upsert
    expect(spies.logActivity).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v2/guild/kick", () => {
  it("대상 없는 body → 400 bad_target", async () => {
    const res = await kickPOST(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_target");
  });

  it("비마스터 → 403 not_master", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-other" }];
    const res = await kickPOST(req({ targetUserId: "u-victim" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("not_master");
  });

  it("자기 자신 추방 → 400 cannot_kick_self", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await kickPOST(req({ targetUserId: "u-me" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("cannot_kick_self");
  });

  it("대상 비멤버 → 404", async () => {
    q.gmQueue = [[{ guildId: 7 }], []]; // 본인=멤버, 대상=없음
    q.guildRows = [{ masterId: "u-me" }];
    const res = await kickPOST(req({ targetUserId: "u-ghost" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("target_not_member");
  });

  it("마스터가 멤버 추방 → 200, 삭제+무소속+쿨다운+로그", async () => {
    q.gmQueue = [[{ guildId: 7 }], [{ userId: "u-victim" }]];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await kickPOST(req({ targetUserId: "u-victim" }));
    expect(res.status).toBe(200);
    expect((await res.json()).removedUserId).toBe("u-victim");
    expect(spies.del).toHaveBeenCalledTimes(1);
    expect(spies.clearAffiliation).toHaveBeenCalledWith(
      expect.anything(),
      "u-victim",
    );
    expect(spies.ins).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v2/guild/transfer", () => {
  it("비마스터 → 403 not_master", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-other" }];
    const res = await transferPOST(req({ targetUserId: "u-heir" }));
    expect(res.status).toBe(403);
  });

  it("대상 비멤버 → 404", async () => {
    q.gmQueue = [[{ guildId: 7 }], []];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await transferPOST(req({ targetUserId: "u-ghost" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("target_not_member");
  });

  it("마스터가 멤버에게 양도 → 200, masterId+역할 update 3회", async () => {
    q.gmQueue = [[{ guildId: 7 }], [{ userId: "u-heir" }]];
    q.guildRows = [{ masterId: "u-me" }];
    const res = await transferPOST(req({ targetUserId: "u-heir" }));
    expect(res.status).toBe(200);
    expect((await res.json()).newMasterId).toBe("u-heir");
    // guilds.masterId + 대상 role=master + 옛 마스터 role=member
    expect(spies.upd).toHaveBeenCalledTimes(3);
  });
});

describe("POST /api/v2/guild/disband", () => {
  it("비마스터 → 403 not_master", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-other", name: "길드" }];
    const res = await disbandPOST(req({ confirm: "길드" }));
    expect(res.status).toBe(403);
  });

  it("이름 불일치 → 400 confirm_mismatch (삭제 안 됨)", async () => {
    q.gmQueue = [[{ guildId: 7 }]];
    q.guildRows = [{ masterId: "u-me", name: "정확한길드" }];
    const res = await disbandPOST(req({ confirm: "틀린이름" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("confirm_mismatch");
    expect(spies.del).not.toHaveBeenCalled();
  });

  it("마스터+이름 일치 → 200, 전원 무소속 + 길드 삭제", async () => {
    q.gmQueue = [
      [{ guildId: 7 }], // 본인 멤버십
      [{ userId: "u-me" }, { userId: "u-b" }], // 전 멤버
    ];
    q.guildRows = [{ masterId: "u-me", name: "은빛" }];
    const res = await disbandPOST(req({ confirm: "은빛" }));
    expect(res.status).toBe(200);
    expect((await res.json()).disbanded).toBe(true);
    expect(spies.clearAffiliation).toHaveBeenCalledTimes(2);
    expect(spies.del).toHaveBeenCalledTimes(1); // guildMembers 즉시 해제
    expect(spies.upd).toHaveBeenCalledTimes(1); // guilds 툼스톤(disbandedAt)
  });
});
