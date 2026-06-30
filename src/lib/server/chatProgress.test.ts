import { describe, expect, it } from "vitest";
import { savesKv, v2Notifications } from "@/db/schema";
import { recordUserChatMessageInTx } from "@/lib/server/chatProgress";
import type { DbExecutor } from "@/lib/server/savesKv";

type SaveValue = {
  chatCount?: number;
  titles?: Record<string, { obtainedAt: number }>;
};

function makeTx(initial?: SaveValue) {
  let hasSave = initial !== undefined;
  let saveValue: SaveValue = initial ?? {};
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
              if (table === savesKv && !hasSave) {
                saveValue = (values.value as SaveValue | undefined) ?? {};
                hasSave = true;
              }
            },
            async onConflictDoUpdate() {
              if (table === savesKv) {
                saveValue = (values.value as SaveValue | undefined) ?? {};
                hasSave = true;
              }
            },
          };
        },
      };
    },
    async execute() {
      return { rows: hasSave ? [{ value: saveValue }] : [] };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                for() {
                  return {
                    async limit() {
                      return table === savesKv && hasSave
                        ? [{ value: saveValue }]
                        : [];
                    },
                  };
                },
                orderBy() {
                  return {
                    offset() {
                      return {
                        async limit() {
                          return [];
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

describe("recordUserChatMessageInTx", () => {
  it("채팅 카운트를 1 증가시킨다", async () => {
    const { tx, getSave, notifications } = makeTx({ chatCount: 98 });

    const nextCount = await recordUserChatMessageInTx(tx, "u1", 123);

    expect(nextCount).toBe(99);
    expect(getSave().chatCount).toBe(99);
    expect(getSave().titles?.chatterbox).toBeUndefined();
    expect(notifications).toHaveLength(0);
  });

  it("100회에 도달하면 히든 칭호 수다쟁이를 지급하고 알림을 남긴다", async () => {
    const { tx, getSave, notifications } = makeTx({ chatCount: 99 });

    const nextCount = await recordUserChatMessageInTx(tx, "u1", 456);

    expect(nextCount).toBe(100);
    expect(getSave().chatCount).toBe(100);
    expect(getSave().titles?.chatterbox).toEqual({ obtainedAt: 456 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: "u1",
      type: "title_unlocked",
      payload: {
        titleId: "chatterbox",
        titleName: "수다쟁이",
        hidden: true,
      },
    });
  });

  it("이미 보유한 상태면 카운트만 증가하고 알림은 중복하지 않는다", async () => {
    const { tx, getSave, notifications } = makeTx({
      chatCount: 150,
      titles: { chatterbox: { obtainedAt: 111 } },
    });

    const nextCount = await recordUserChatMessageInTx(tx, "u1", 999);

    expect(nextCount).toBe(151);
    expect(getSave().titles?.chatterbox).toEqual({ obtainedAt: 111 });
    expect(notifications).toHaveLength(0);
  });
});
