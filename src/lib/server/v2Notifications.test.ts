// insertNotification 정책 테스트 — 기본 insert / 거점 단위 디바운스 / 유저당 trim.
// db 는 serverFeed.test 와 같은 "테이블 → rows" thenable 체인 모킹.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableRows, inserted, deleted } = vi.hoisted(() => ({
  tableRows: new Map<unknown, unknown[]>(),
  inserted: [] as Array<{ table: unknown; values: unknown }>,
  deleted: [] as unknown[],
}));

vi.mock("@/db", () => {
  const chain = (rows: unknown[]) => {
    const c: {
      where: () => typeof c;
      orderBy: () => typeof c;
      offset: () => typeof c;
      limit: () => typeof c;
      then: (
        res: (v: unknown[]) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      where: () => c,
      orderBy: () => c,
      offset: () => c,
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
      insert: (table: unknown) => ({
        values: async (values: unknown) => {
          inserted.push({ table, values });
        },
      }),
      delete: (table: unknown) => ({
        where: async (cond: unknown) => {
          deleted.push({ table, cond });
        },
      }),
    },
  };
});

import {
  insertNotification,
  insertNotificationMany,
} from "@/lib/server/v2Notifications";
import { v2Notifications } from "@/db/schema";
import { WAR_NOTIF_DEBOUNCE_MS } from "@/lib/v2-notification-config";

describe("insertNotification", () => {
  beforeEach(() => {
    tableRows.clear();
    inserted.length = 0;
    deleted.length = 0;
    tableRows.set(v2Notifications, []); // 디바운스 후보 무·trim cut 무
  });

  it("기본 — insert 1회, trim cut 없으면 delete 안 함", async () => {
    await insertNotification("u1", "outpost_lost", {
      outpostId: "op-1",
      byNpc: true,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      userId: "u1",
      type: "outpost_lost",
    });
    expect(deleted).toHaveLength(0);
  });

  it("디바운스 — 같은 거점의 최근 동일 type 항목 있으면 skip", async () => {
    tableRows.set(v2Notifications, [{ payload: { outpostId: "op-1" } }]);
    await insertNotification(
      "u1",
      "outpost_attacked",
      { outpostId: "op-1", fortHp: 60, fortMaxHp: 100 },
      { debounceMs: WAR_NOTIF_DEBOUNCE_MS },
    );
    expect(inserted).toHaveLength(0);
  });

  it("디바운스 — 다른 거점이면 통과 (거점 단위 키)", async () => {
    tableRows.set(v2Notifications, [{ payload: { outpostId: "op-other" } }]);
    await insertNotification(
      "u1",
      "outpost_attacked",
      { outpostId: "op-1", fortHp: 60, fortMaxHp: 100 },
      { debounceMs: WAR_NOTIF_DEBOUNCE_MS },
    );
    expect(inserted).toHaveLength(1);
  });

  it("trim — 보존 상한 초과 cut 이 있으면 이전 행 delete", async () => {
    // select 모킹이 모든 체인에 같은 rows 를 주므로: 디바운스 미사용 경로 + cut 존재 재현.
    tableRows.set(v2Notifications, [{ id: 123, payload: {} }]);
    await insertNotification("u1", "outpost_lost", {
      outpostId: "op-1",
      byNpc: true,
    });
    expect(inserted).toHaveLength(1);
    expect(deleted).toHaveLength(1);
  });

  it("insertNotificationMany — 수신자 수만큼 insert (길드 전원)", async () => {
    await insertNotificationMany(["u1", "u2", "u3"], "outpost_lost", {
      outpostId: "op-1",
      attackerLabel: "검은바위 길드",
    });
    expect(inserted).toHaveLength(3);
    expect(inserted.map((i) => (i.values as { userId: string }).userId)).toEqual(
      ["u1", "u2", "u3"],
    );
  });
});
