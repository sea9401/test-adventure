import { describe, expect, it } from "vitest";
import { TITLES } from "@/adventure/data/titles";
import { savesKv, v2Notifications } from "@/db/schema";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import type { DbExecutor } from "@/lib/server/savesKv";

type SaveValue = {
  titles?: Record<string, { obtainedAt: number }>;
};

function makeTx(initial: SaveValue = {}) {
  let saveValue: SaveValue = initial;
  const notifications: Array<{
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  }> = [];

  const tx = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          if (table === v2Notifications) {
            notifications.push(values as (typeof notifications)[number]);
          }
          return {
            async onConflictDoNothing() {
              if (table === savesKv && Object.keys(saveValue).length === 0) {
                saveValue = (values.value as SaveValue | undefined) ?? {};
              }
            },
            async onConflictDoUpdate() {
              if (table === savesKv) {
                saveValue = (values.value as SaveValue | undefined) ?? {};
              }
            },
          };
        },
      };
    },
    async execute() {
      return { rows: [{ value: saveValue }] };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    offset() {
                      return {
                        async limit() {
                          return table === v2Notifications ? [] : [];
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    delete() {
      return {
        async where() {
          return undefined;
        },
      };
    },
  } as unknown as DbExecutor;

  return {
    tx,
    notifications,
    getSave: () => saveValue,
  };
}

describe("grantTitleIfMissingInTx", () => {
  it("새 칭호를 지급하면 칭호 획득 알림을 함께 남긴다", async () => {
    const { tx, notifications, getSave } = makeTx();

    const granted = await grantTitleIfMissingInTx(tx, "u1", "first_blood", 123);

    expect(granted).toBe(true);
    expect(getSave().titles?.first_blood).toEqual({ obtainedAt: 123 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: "u1",
      type: "title_unlocked",
      payload: {
        titleId: "first_blood",
        titleName: TITLES.first_blood.name,
      },
    });
  });

  it("이미 보유한 칭호면 지급도 알림도 중복하지 않는다", async () => {
    const { tx, notifications, getSave } = makeTx({
      titles: { first_blood: { obtainedAt: 111 } },
    });

    const granted = await grantTitleIfMissingInTx(tx, "u1", "first_blood", 222);

    expect(granted).toBe(false);
    expect(getSave().titles?.first_blood).toEqual({ obtainedAt: 111 });
    expect(notifications).toHaveLength(0);
  });
});
