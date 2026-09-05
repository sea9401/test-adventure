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

  it("마법 부여된 보유 장비의 옵션을 링크 스냅샷에 보존한다", () => {
    const liberation = {
      rank: 2,
      lineCount: 2,
      revision: 7,
      options: [
        { id: "base_str_pct", level: 10 },
        { id: "skill_crit_damage_pp", level: 8 },
      ],
    };

    const link = chatEquipmentLinkForOwnedIid(
      {
        owned: [
          {
            iid: "eq-liberated",
            id: "v2_boss_catastrophe_gloves",
            liberation,
          },
        ],
      },
      "eq-liberated",
    );

    expect(link).toMatchObject({ liberation });
    expect(parseChatEquipmentLink(link)).toMatchObject({ liberation });
  });

  it("장비 부위에 맞지 않는 마법 부여 옵션은 링크에서 제외한다", () => {
    const link = parseChatEquipmentLink({
      kind: "equipment",
      itemId: "v2_iron_sword",
      liberation: {
        rank: 2,
        lineCount: 1,
        revision: 2,
        options: [{ id: "max_hp_flat", level: 8 }],
      },
    });

    expect(link).not.toBeNull();
    expect(link).not.toHaveProperty("liberation");
  });
});
