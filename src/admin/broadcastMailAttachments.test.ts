import { describe, expect, it } from "vitest";
import {
  adminMailCashItemOptions,
  adminMailConsumableOptions,
  splitAdminMailConsumables,
} from "./broadcastMailAttachments";

describe("관리자 대량 우편 소비 아이템 첨부", () => {
  it("세 소비 아이템만 소비 아이템 목록에 두고 코인샵 목록과 중복하지 않는다", () => {
    expect(adminMailConsumableOptions().map((option) => option.id)).toEqual([
      "stamina_potion",
      "cultivation_reset_potion",
      "level_100_elixir",
    ]);

    const cashItemIds = adminMailCashItemOptions().map((option) => option.id);
    expect(cashItemIds).not.toContain("cultivation_reset_potion");
    expect(cashItemIds).not.toContain("level_100_elixir");
  });

  it("스태미나 회복약과 캐시 인벤토리 소비 아이템을 기존 우편 필드로 나눈다", () => {
    expect(
      splitAdminMailConsumables(
        [
          { id: "stamina_potion", count: 3 },
          { id: "cultivation_reset_potion", count: 2 },
          { id: "level_100_elixir", count: 1 },
          { id: "unknown", count: 99 },
        ],
        [{ id: "rename_permit", count: 4 }],
      ),
    ).toEqual({
      staminaPotions: 3,
      cashItems: [
        { itemId: "rename_permit", count: 4 },
        { itemId: "cultivation_reset_potion", count: 2 },
        { itemId: "level_100_elixir", count: 1 },
      ],
    });
  });
});
