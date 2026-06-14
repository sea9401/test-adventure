// 전황 라우트(GET /api/v2/war/overview) 통합 테스트 — db 를 "테이블 → 고정 rows" 로
// 모킹하고 라우트의 파생 로직(교전 판정·최근 점령 윈도·내 길드 위협·라벨)을 검증한다.
// 쿼리 체인(where/orderBy/limit)은 조건 무시·테이블 단위 전체 반환 — 파생은 라우트의
// JS 필터가 수행하므로 의도 검증엔 충분(클레임 로그 윈도 필터만 모킹 데이터로 흉내).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableRows } = vi.hoisted(() => ({
  tableRows: new Map<unknown, unknown[]>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-viewer"),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  resolveUserDisplayName: vi.fn(async (id: string) => `이름:${id}`),
}));
vi.mock("@/db", () => {
  // thenable 체인 — from(tbl) 시점의 테이블로 rows 결정, where/orderBy/limit 는 통과.
  const chain = (rows: unknown[]) => {
    const c: {
      where: () => typeof c;
      groupBy: () => typeof c;
      orderBy: () => typeof c;
      limit: () => typeof c;
      then: (
        res: (v: unknown[]) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      where: () => c,
      groupBy: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (res, rej) => Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  return {
    db: {
      select: () => ({
        from: (tbl: unknown) => chain(tableRows.get(tbl) ?? []),
      }),
    },
  };
});

import { GET } from "@/app/api/v2/war/overview/route";
import {
  guildMembers,
  guilds,
  outpostClaimAttempts,
  outpostOccupations,
  outpostTreasury,
  savesKv,
  warScoreEvents,
} from "@/db/schema";
import { FORT_MAX_HP } from "@/adventure/data/v2/outpostSiege";

type Overview = {
  ok: boolean;
  sieges: Array<{
    outpostId: string;
    ownerLabel: string;
    fortHp: number;
    recentAttacks: Array<{ attackerName: string; won: boolean }>;
  }>;
  recentCaptures: Array<{ outpostId: string; ownerLabel: string }>;
  myGuild: {
    guildId: number;
    outposts: Array<{
      outpostId: string;
      underAttack: boolean;
      intruderCount: number;
    }>;
  } | null;
};

function occRow(over: Record<string, unknown>) {
  const now = new Date();
  return {
    outpostId: "op-x",
    occupiedByUserId: "u-owner",
    occupiedByGuildId: null,
    occupiedAt: new Date(now.getTime() - 100 * 3_600_000), // 기본: 윈도(48h) 밖
    policy: "open",
    taxRate: "0.1",
    nextAttackAt: now,
    fortHp: FORT_MAX_HP,
    fortMaxHp: FORT_MAX_HP,
    fortUpdatedAt: now, // 재생 경과 0 — fortHp 그대로 읽힌다
    protectedUntil: now,
    ...over,
  };
}

describe("GET /api/v2/war/overview", () => {
  beforeEach(() => {
    tableRows.clear();
    tableRows.set(outpostOccupations, []);
    tableRows.set(outpostClaimAttempts, []);
    tableRows.set(outpostTreasury, []);
    tableRows.set(guilds, []);
    tableRows.set(guildMembers, []);
    tableRows.set(savesKv, []);
    tableRows.set(warScoreEvents, []);
  });

  it("빈 상태 — 전부 빈 목록 + myGuild null", async () => {
    const json = (await (await GET()).json()) as Overview;
    expect(json.ok).toBe(true);
    expect(json.sieges).toEqual([]);
    expect(json.recentCaptures).toEqual([]);
    expect(json.myGuild).toBeNull();
  });

  it("교전 판정 — 성벽 깎임 OR 최근 공성 시도, 풀성벽·무공격은 제외", async () => {
    tableRows.set(outpostOccupations, [
      occRow({ outpostId: "op-damaged", fortHp: 60 }), // 성벽 깎임 → 교전
      occRow({ outpostId: "op-full" }), // 풀성벽·무공격 → 제외
      occRow({ outpostId: "op-attacked" }), // 풀성벽이지만 최근 공격 → 교전
    ]);
    tableRows.set(outpostClaimAttempts, [
      {
        id: 1,
        outpostId: "op-attacked",
        attackerUserId: "u-att",
        attackerGuildId: 7,
        defenderName: "수비자",
        defenderUserId: "u-owner",
        won: false,
        turns: 10,
        createdAt: new Date(),
      },
    ]);
    tableRows.set(guilds, [{ id: 7, name: "검은바위" }]);

    const json = (await (await GET()).json()) as Overview;
    const ids = json.sieges.map((s) => s.outpostId);
    expect(ids).toContain("op-damaged");
    expect(ids).toContain("op-attacked");
    expect(ids).not.toContain("op-full");
    // 함락 임박(성벽 비율 낮은) 순 정렬 — 깎인 거점이 먼저.
    expect(ids[0]).toBe("op-damaged");
    // 공격자 라벨 = 길드명, 격퇴(won=false) 보존.
    const attacked = json.sieges.find((s) => s.outpostId === "op-attacked")!;
    expect(attacked.recentAttacks[0].attackerName).toBe("검은바위 길드");
    expect(attacked.recentAttacks[0].won).toBe(false);
  });

  it("최근 점령 — occupiedAt 48h 안만, 솔로 점령자는 닉네임 라벨", async () => {
    tableRows.set(outpostOccupations, [
      occRow({
        outpostId: "op-new",
        occupiedAt: new Date(Date.now() - 3_600_000),
      }),
      occRow({ outpostId: "op-old" }), // 100h 전 — 제외
    ]);
    const json = (await (await GET()).json()) as Overview;
    expect(json.recentCaptures.map((c) => c.outpostId)).toEqual(["op-new"]);
    expect(json.recentCaptures[0].ownerLabel).toBe("이름:u-owner");
  });

  it("내 길드 거점 — 피습 거점 상단 + underAttack 플래그", async () => {
    tableRows.set(guildMembers, [{ userId: "u-viewer", guildId: 3 }]);
    tableRows.set(guilds, [{ id: 3, name: "우리길드" }]);
    tableRows.set(outpostOccupations, [
      occRow({
        outpostId: "op-safe",
        occupiedByUserId: "u-master",
        occupiedByGuildId: 3,
      }),
      occRow({
        outpostId: "op-hit",
        occupiedByUserId: "u-master",
        occupiedByGuildId: 3,
        fortHp: 40,
      }),
    ]);
    const json = (await (await GET()).json()) as Overview;
    expect(json.myGuild).not.toBeNull();
    expect(json.myGuild!.guildId).toBe(3);
    expect(json.myGuild!.outposts.map((o) => o.outpostId)).toEqual([
      "op-hit",
      "op-safe",
    ]);
    expect(json.myGuild!.outposts[0].underAttack).toBe(true);
    expect(json.myGuild!.outposts[1].underAttack).toBe(false);
    // 내 길드 점령 거점은 라벨이 길드명으로 — sieges 에도 동일 점령이 잡힌다.
    const hit = json.sieges.find((s) => s.outpostId === "op-hit")!;
    expect(hit.ownerLabel).toBe("우리길드 길드");
  });

  it("노다지 거점 — 미점령만, 금액 내림차순 (점령 거점 금고는 제외)", async () => {
    tableRows.set(outpostOccupations, [occRow({ outpostId: "op-occupied" })]);
    tableRows.set(outpostTreasury, [
      { outpostId: "op-small", gold: 120 },
      { outpostId: "op-big", gold: 3400 },
      { outpostId: "op-occupied", gold: 999 }, // 점령 중 — 목록 제외
    ]);
    const json = (await (await GET()).json()) as Overview & {
      treasures: Array<{ outpostId: string; gold: number }>;
    };
    expect(json.treasures.map((t) => t.outpostId)).toEqual([
      "op-big",
      "op-small",
    ]);
  });
});
