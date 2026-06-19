// 국가 선포 라우트(POST /api/v2/guild/nation/declare) 통합 테스트 — db.transaction 을
// "테이블 → 고정 rows" 로 모킹하고 라우트의 게이트 사슬(마스터·미선포·대도시 보유)을 검증한다.
// 각 게이트를 독립적으로 구동하려고 guildMembers / guilds / outpostVillages 세 테이블의 rows 를
// 테스트마다 셋업한다. update 는 캡처해 happy-path 에서 nationName / nationDeclaredAt 세팅을 확인.
//
// 🔑 라우트는 @/lib/server/v2Settlement 를 import 하지 않고 tx.select().from(table) 로
//   row 를 직접 읽는다 → DB 레이어 모킹 = @/db 트랜잭션 한 곳이면 모든 게이트를 구동한다.
//   쿼리 사슬(where/for/limit)은 SQL 술어를 파싱하지 않되, 라우트가 쓰는 세 관계형 필터
//   (멤버십=내 유저 · 길드=내 길드 id+미해산 · 마을=내 길드 소유)를 relationalResolve 가 재현해
//   디코이 행(타 유저 멤버십·해산 길드·타 길드 대도시)이 실제 라우트처럼 배제된다.
//   ⚠️ 한계: mock 기반이라 라우트가 WHERE 절을 통째로 누락하는 회귀까지는 못 잡는다(실 DB 통합
//   테스트 영역). 여기선 JS 게이트 분기(마스터/미선포/대도시 .some())와 부정 시나리오를 검증한다.

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 팩토리는 호이스팅되므로 공유 상태는 vi.hoisted 로.
const { tableRows, captured, q } = vi.hoisted(() => {
  const tableRows = new Map<unknown, unknown[]>();
  return {
    tableRows,
    captured: { update: null as Record<string, unknown> | null },
    // 현재 유저 + 테이블 리졸버(라우트 관계형 필터 재현). beforeEach 에서 relationalResolve 주입.
    q: {
      userId: "u-master" as string,
      resolve: (tbl: unknown): unknown[] => tableRows.get(tbl) ?? [],
    },
  };
});

const { ensureUserMock } = vi.hoisted(() => ({
  ensureUserMock: vi.fn(async (): Promise<string | null> => "u-master"),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: ensureUserMock,
}));

vi.mock("@/db", () => {
  // select 사슬 — from(tbl) 시점의 테이블로 rows 결정, where/for/limit 는 통과(thenable).
  const selectChain = (rows: unknown[]) => {
    const c: {
      where: () => typeof c;
      for: () => typeof c;
      limit: () => typeof c;
      then: (
        res: (v: unknown[]) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      where: () => c,
      for: () => c,
      limit: () => c,
      then: (res, rej) => Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const tx = {
    select: () => ({
      from: (tbl: unknown) => selectChain(q.resolve(tbl)),
    }),
    // update(guilds).set({...}).where(...) — set 페이로드만 캡처(no-op).
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        captured.update = payload;
        return { where: async () => undefined };
      },
    }),
    // insert(guild_activity_log).values({...}) — 활동 로그(no-op).
    insert: () => ({ values: async () => undefined }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  };
});

import { POST } from "@/app/api/v2/guild/nation/declare/route";
import { guildMembers, guilds, outpostVillages } from "@/db/schema";
import {
  GUILD_MAX_MEMBERS,
  NATION_MEMBER_BONUS,
  guildMemberCap,
} from "@/adventure/data/guild";
import {
  NATION_REQUIRED_TIER,
  VILLAGE_TIERS,
  nextTier,
  tierMeetsNation,
} from "@/adventure/data/v2/settlement";

// 라우트의 관계형 필터를 충실 재현 — 디코이 행이 실제 라우트처럼 배제되게 한다. 라우트 쿼리:
//   ① guildMembers where userId = 나  ② guilds where id = 내guildId AND disbandedAt IS NULL
//   ③ outpostVillages where guildId = 내guildId
function relationalResolve(tbl: unknown): unknown[] {
  const rows =
    (tableRows.get(tbl) as Record<string, unknown>[] | undefined) ?? [];
  if (tbl === guildMembers) {
    return rows.filter((r) => r.userId === q.userId);
  }
  const mem = (
    (tableRows.get(guildMembers) as Record<string, unknown>[] | undefined) ?? []
  ).find((r) => r.userId === q.userId);
  const gid = mem?.guildId;
  if (tbl === guilds) {
    return rows.filter((r) => r.id === gid && r.disbandedAt == null);
  }
  if (tbl === outpostVillages) {
    return rows.filter((r) => r.guildId === gid);
  }
  return rows;
}

type DeclareResult = {
  ok: boolean;
  error?: string;
  reason?: string;
  nationName?: string;
  requiredTier?: string;
};

// 국가명 body 를 실은 POST Request — 라우트가 req.json() 으로 읽는다.
function declareReq(body: unknown = { name: "은빛 제국" }): Request {
  return new Request("http://test/api/v2/guild/nation/declare", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// 길드 row — 기본 = 내가 마스터·미선포.
function guildRow(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    masterId: "u-master",
    nationName: null,
    disbandedAt: null,
    ...over,
  };
}

describe("POST /api/v2/guild/nation/declare", () => {
  beforeEach(() => {
    tableRows.clear();
    captured.update = null;
    q.userId = "u-master";
    q.resolve = relationalResolve;
    ensureUserMock.mockResolvedValue("u-master");
    // 기본 셋업 = 마스터·미선포·대도시 마을 1개 보유(happy-path 토대).
    tableRows.set(guildMembers, [{ userId: "u-master", guildId: 7 }]);
    tableRows.set(guilds, [guildRow()]);
    tableRows.set(outpostVillages, [{ guildId: 7, tier: "metropolis" }]);
  });

  it("미인증 — ensureUser null → 401", async () => {
    ensureUserMock.mockResolvedValueOnce(null);
    const res = await POST(declareReq());
    expect(res.status).toBe(401);
    const json = (await res.json()) as DeclareResult;
    expect(json.ok).toBe(false);
    expect(json.error).toBe("unauthorized");
  });

  it("잘못된 body(이름 없음) — name_required 400", async () => {
    const res = await POST(declareReq({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("name_required");
  });

  it("국가명 검증 실패(너무 짧음) — invalid_name 400", async () => {
    const res = await POST(declareReq({ name: "가" })); // 1자 < NATION_NAME_MIN(2)
    expect(res.status).toBe(400);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("invalid_name");
    expect(typeof json.reason).toBe("string");
  });

  it("길드 미가입 — 내 멤버십 없음(타 유저 행은 배제) → no_guild 403", async () => {
    tableRows.set(guildMembers, [{ userId: "u-other", guildId: 99 }]); // 디코이
    const res = await POST(declareReq());
    expect(res.status).toBe(403);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("no_guild");
  });

  it("길드 해산됨(disbandedAt 필터로 배제) — guild_not_found 404", async () => {
    tableRows.set(guilds, [guildRow({ disbandedAt: new Date() })]); // 해산 → 미선택
    const res = await POST(declareReq());
    expect(res.status).toBe(404);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("guild_not_found");
  });

  it("마스터 아님 — not_master 403", async () => {
    tableRows.set(guilds, [guildRow({ masterId: "u-other" })]);
    const res = await POST(declareReq());
    expect(res.status).toBe(403);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("not_master");
    // 게이트 차단 시 update 미발생.
    expect(captured.update).toBeNull();
  });

  it("이미 선포함(멱등) — already_nation 409, 두 번 선포 불가", async () => {
    tableRows.set(guilds, [guildRow({ nationName: "기존 왕국" })]);
    const res = await POST(declareReq());
    expect(res.status).toBe(409);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("already_nation");
    expect(json.nationName).toBe("기존 왕국");
    expect(captured.update).toBeNull();
  });

  it("대도시 마을 미보유(마을/도시뿐) — no_metropolis 409", async () => {
    tableRows.set(outpostVillages, [
      { guildId: 7, tier: "village" },
      { guildId: 7, tier: "city" },
    ]);
    const res = await POST(declareReq());
    expect(res.status).toBe(409);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("no_metropolis");
    // requiredTier 라벨 = 대도시(VILLAGE_TIER_NAME[NATION_REQUIRED_TIER]).
    expect(json.requiredTier).toBe("대도시");
    expect(captured.update).toBeNull();
  });

  it("대도시가 있으나 타 길드 소유(guildId 필터로 배제) — no_metropolis 409", async () => {
    tableRows.set(outpostVillages, [
      { guildId: 7, tier: "city" }, // 내 길드: 대도시 아님
      { guildId: 999, tier: "metropolis" }, // 남의 길드 대도시 — 게이트에 안 잡혀야
    ]);
    const res = await POST(declareReq());
    expect(res.status).toBe(409);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("no_metropolis");
    expect(captured.update).toBeNull();
  });

  it("마을 0개 — 게이트 미충족 no_metropolis 409", async () => {
    tableRows.set(outpostVillages, []);
    const res = await POST(declareReq());
    expect(res.status).toBe(409);
    const json = (await res.json()) as DeclareResult;
    expect(json.error).toBe("no_metropolis");
  });

  it("happy path — 마스터·미선포·대도시 보유 → 200, nationName/nationDeclaredAt 세팅", async () => {
    const res = await POST(declareReq({ name: "은빛 제국" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as DeclareResult;
    expect(json.ok).toBe(true);
    expect(json.nationName).toBe("은빛 제국");
    // update 페이로드 = nationName(trim 된 값) + nationDeclaredAt(Date).
    expect(captured.update).not.toBeNull();
    expect(captured.update!.nationName).toBe("은빛 제국");
    expect(captured.update!.nationDeclaredAt).toBeInstanceOf(Date);
  });

  it("happy path — 마을 여러 개 중 하나만 대도시여도 통과", async () => {
    tableRows.set(outpostVillages, [
      { guildId: 7, tier: "village" },
      { guildId: 7, tier: "metropolis" }, // 하나라도 대도시면 게이트 통과.
      { guildId: 7, tier: "city" },
    ]);
    const res = await POST(declareReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as DeclareResult;
    expect(json.ok).toBe(true);
  });
});

// ── 순수 엔진 단언 ── 라우트 게이트가 의존하는 settlement / guild 헬퍼의 SSOT 동작. ──────
describe("settlement 등급 게이트 + 국가 정원 보너스 (순수)", () => {
  it("tierMeetsNation — 대도시만 충족, 마을/도시는 미충족", () => {
    expect(tierMeetsNation("metropolis")).toBe(true);
    expect(tierMeetsNation("city")).toBe(false);
    expect(tierMeetsNation("village")).toBe(false);
    // NATION_REQUIRED_TIER 자체는 항상 충족.
    expect(tierMeetsNation(NATION_REQUIRED_TIER)).toBe(true);
  });

  it("VILLAGE_TIERS / nextTier — 마을→도시→대도시(최종) 단계 순서", () => {
    expect(VILLAGE_TIERS).toEqual(["village", "city", "metropolis"]);
    expect(nextTier("village")).toBe("city");
    expect(nextTier("city")).toBe("metropolis");
    expect(nextTier("metropolis")).toBeNull(); // 대도시 = 최종(국가는 별도 게이트).
  });

  it("국가 정원 보너스 = guildMemberCap(true) - guildMemberCap(false) === NATION_MEMBER_BONUS", () => {
    // 매직넘버 금지 — 실제 export 상수/함수로 델타 단언.
    expect(guildMemberCap(true) - guildMemberCap(false)).toBe(NATION_MEMBER_BONUS);
    // 정원 = 기본 + (국가면 보너스).
    expect(guildMemberCap(false)).toBe(GUILD_MAX_MEMBERS);
    expect(guildMemberCap(true)).toBe(GUILD_MAX_MEMBERS + NATION_MEMBER_BONUS);
  });
});
