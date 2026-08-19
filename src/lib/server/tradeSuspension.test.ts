import { describe, expect, it } from "vitest";
import type { DbExecutor } from "./savesKv";
import {
  TradeSuspendedError,
  lockTradeParticipantStatuses,
  readTradeRestriction,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "./tradeSuspension";

const now = new Date("2026-08-20T00:00:00.000Z");

type UserRow = {
  id: string;
  bannedUntil: Date | null;
  banReason: string | null;
  tradeSuspendedUntil: Date | null;
  tradeSuspensionReason: string | null;
};

function stringParams(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringParams);
  if (!value || typeof value !== "object") return [];
  if ("value" in value && typeof value.value === "string") return [value.value];
  if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.flatMap(stringParams);
  }
  return [];
}

function fakeExecutor(rows: readonly UserRow[]) {
  const lockedIds: string[] = [];
  const query = {
    from: () => query,
    where: (condition: unknown) => {
      lockedIds.push(...stringParams(condition).filter((value) => value.startsWith("u-")));
      return query;
    },
    orderBy: () => query,
    for: () => Promise.resolve(rows),
  };

  return { tx: { select: () => query } as unknown as DbExecutor, lockedIds };
}

describe("거래 참여자 제한 잠금", () => {
  it("참여자를 중복 없이 ID 오름차순으로 잠그고 계정·독립 거래 제한을 함께 해석한다", async () => {
    const { tx, lockedIds } = fakeExecutor([
      {
        id: "u-a",
        bannedUntil: new Date("2026-08-21T00:00:00.000Z"),
        banReason: "계정 이용 제한",
        tradeSuspendedUntil: null,
        tradeSuspensionReason: null,
      },
      {
        id: "u-z",
        bannedUntil: null,
        banReason: null,
        tradeSuspendedUntil: new Date("2026-08-22T00:00:00.000Z"),
        tradeSuspensionReason: "비정상 거래 조사",
      },
    ]);

    const statuses = await lockTradeParticipantStatuses(tx, ["u-z", "u-a", "u-z"], now);

    expect(lockedIds).toEqual(["u-a", "u-z"]);
    expect(statuses.get("u-a")).toMatchObject({ source: "account" });
    expect(statuses.get("u-z")).toMatchObject({ source: "trade" });
  });

  it("존재하지 않는 참여자는 제한 없는 상태로 포함한다", async () => {
    const { tx } = fakeExecutor([]);

    const statuses = await lockTradeParticipantStatuses(tx, ["u-missing"], now);

    expect(statuses).toEqual(new Map([["u-missing", null]]));
  });

  it("일반 이전은 호출자 참가자 순서에서 첫 제한을 오류로 반환한다", async () => {
    const { tx, lockedIds } = fakeExecutor([
      {
        id: "u-a",
        bannedUntil: new Date("2026-08-21T00:00:00.000Z"),
        banReason: "계정 이용 제한",
        tradeSuspendedUntil: null,
        tradeSuspensionReason: null,
      },
      {
        id: "u-z",
        bannedUntil: null,
        banReason: null,
        tradeSuspendedUntil: new Date("2026-08-22T00:00:00.000Z"),
        tradeSuspensionReason: "비정상 거래 조사",
      },
    ]);

    await expect(requireTradeParticipants(tx, ["u-z", "u-a", "u-z"], now)).rejects.toMatchObject({
      name: "TradeSuspendedError",
      restriction: { source: "trade" },
    });
    expect(lockedIds).toEqual(["u-a", "u-z"]);
  });

  it("현재 계정 제한은 독립 거래 제한보다 우선하고 표준 403 응답으로 직렬화한다", async () => {
    const restriction = readTradeRestriction(
      {
        bannedUntil: new Date("2026-08-21T00:00:00.000Z"),
        banReason: "계정 이용 제한",
        tradeSuspendedUntil: new Date("2026-08-22T00:00:00.000Z"),
        tradeSuspensionReason: "비정상 거래 조사",
      },
      now,
    );
    expect(restriction).toMatchObject({ source: "account" });
    expect(restriction).not.toBeNull();

    const error = new TradeSuspendedError(restriction!);
    const response = tradeSuspendedResponse(error);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "trade_suspended",
      reason: "계정 이용 제한",
      expiresAt: "2026-08-21T00:00:00.000Z",
      permanent: false,
    });
  });
});
