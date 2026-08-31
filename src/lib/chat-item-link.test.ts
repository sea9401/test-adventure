import { describe, expect, it } from "vitest";
import {
  chatEquipmentLinkForOwnedIid,
  chatEquipmentLinkLabel,
  parseChatEquipmentLink,
} from "./chat-item-link";

describe("chat equipment links", () => {
  it("현재 보유한 iid만 공개 스냅샷으로 만든다", () => {
    const raw = {
      owned: [
        {
          iid: "eq-owned",
          id: "v2_iron_sword",
          locked: true,
          roll: { power: 12, weight: 0, options: { crit: 3 } },
          enhance: { level: 3, bonusPct: 999 },
        },
      ],
    };

    const link = chatEquipmentLinkForOwnedIid(raw, "eq-owned");
    expect(link).toMatchObject({
      kind: "equipment",
      itemId: "v2_iron_sword",
      roll: { power: 12, options: { crit: 3 } },
      enhance: { level: 3 },
    });
    expect(link).not.toHaveProperty("iid");
    expect(link).not.toHaveProperty("locked");
    expect(chatEquipmentLinkForOwnedIid(raw, "eq-forged")).toBeNull();
    expect(link && chatEquipmentLinkLabel(link)).toBe("철검 +3");
  });

  it("알 수 없는 장비와 손상된 payload를 거부한다", () => {
    expect(
      parseChatEquipmentLink({ kind: "equipment", itemId: "not-an-item" }),
    ).toBeNull();
    expect(parseChatEquipmentLink("v2_iron_sword")).toBeNull();
  });

  it("제작 품질과 강화가 함께 있는 장비 링크를 그대로 복원한다", () => {
    expect(
      parseChatEquipmentLink({
        kind: "equipment",
        itemId: "v2_crafted_fury_necklace",
        craftQuality: { level: 2, bonusPct: 999 },
        enhance: { level: 4, bonusPct: 999 },
        craftedBy: {
          userId: "u1",
          profession: "blacksmith",
          level: 6,
          craftedAt: "2026-08-09T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      craftQuality: { level: 2, bonusPct: 10 },
      enhance: { level: 4, bonusPct: 6 },
    });
  });
});
