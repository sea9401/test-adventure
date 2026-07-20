import { describe, expect, it } from "vitest";
import {
  CHROMA_NAME_VARIANTS,
  isMuseunCosmeticItemId,
  museunCosmeticAppearance,
  chromaNameOdds,
  drawChromaNameByRoll,
  equipChromaName,
  grantChromaName,
  parseMuseunCosmetics,
  unlockMuseunCosmetic,
} from "./museunCosmetics";

describe("무슨 코인 영구 꾸미기", () => {
  it("알려진 꾸미기 권리만 중복 없이 보존한다", () => {
    expect(
      parseMuseunCosmetics({
        owned: [
          "chroma_chat_name",
          "unknown",
          "chroma_chat_name",
          "starlight_chat_badge",
        ],
      }),
    ).toEqual({
      owned: ["starlight_chat_badge"],
      chromaNames: ["spectrum"],
      equippedChromaName: "spectrum",
    });
    expect(isMuseunCosmeticItemId("prismatic_profile_border")).toBe(true);
    expect(isMuseunCosmeticItemId("rename_permit")).toBe(false);
  });

  it("구매 권리를 한 번만 해금한다", () => {
    const first = unlockMuseunCosmetic({}, "prismatic_profile_border");
    expect(first.alreadyOwned).toBe(false);
    expect(first.state.owned).toEqual(["prismatic_profile_border"]);
    const second = unlockMuseunCosmetic(
      first.state,
      "prismatic_profile_border",
    );
    expect(second.alreadyOwned).toBe(true);
    expect(second.state).toEqual(first.state);
  });

  it("각 상품을 서로 독립된 표시 효과로 해석한다", () => {
    expect(
      museunCosmeticAppearance({
        owned: ["starlight_chat_badge"],
        chromaNames: ["aurora"],
        equippedChromaName: "aurora",
      }),
    ).toEqual({
      profileBorder: null,
      chatBadge: "starlight",
      chatNameEffect: "aurora",
    });
  });

  it("미보유 종류만 등급 가중치 확률로 남기고 획득 즉시 장착한다", () => {
    const before = { chromaNames: ["spectrum", "aurora"] };
    const odds = chromaNameOdds(before);
    expect(odds).toHaveLength(CHROMA_NAME_VARIANTS.length - 2);
    expect(odds.reduce((sum, entry) => sum + entry.probabilityPct, 0)).toBeCloseTo(
      100,
    );
    const granted = grantChromaName(before, "inferno");
    expect(granted.chromaNames).toContain("inferno");
    expect(granted.equippedChromaName).toBe("inferno");
    expect(equipChromaName(granted, "aurora")?.equippedChromaName).toBe(
      "aurora",
    );
    expect(equipChromaName(granted, "royal")).toBeNull();
    const unequipped = equipChromaName(granted, null);
    expect(parseMuseunCosmetics(unequipped).equippedChromaName).toBeNull();
  });

  it("최초 상자는 일반 72%·희귀 20%·영웅 6%·전설 2%로 추첨한다", () => {
    const odds = chromaNameOdds(null);
    const probabilityByRarity = Object.fromEntries(
      ["common", "rare", "epic", "legendary"].map((rarity) => [
        rarity,
        odds
          .filter((entry) =>
            CHROMA_NAME_VARIANTS.some(
              (variant) => variant.id === entry.id && variant.rarity === rarity,
            ),
          )
          .reduce((sum, entry) => sum + entry.probabilityPct, 0),
      ]),
    );
    expect(probabilityByRarity.common).toBeCloseTo(72);
    expect(probabilityByRarity.rare).toBeCloseTo(20);
    expect(probabilityByRarity.epic).toBeCloseTo(6);
    expect(probabilityByRarity.legendary).toBeCloseTo(2);

    expect(drawChromaNameByRoll(null, 0)).toBe("crimson");
    expect(drawChromaNameByRoll(null, 11)).toBe("crimson");
    expect(drawChromaNameByRoll(null, 12)).toBe("coral");
    expect(drawChromaNameByRoll(null, 199)).toBe("eclipse");
  });

  it("등급과 관계없이 마지막 미보유 항목은 100%가 되고 완성 후 추첨하지 않는다", () => {
    const exceptEclipse = {
      chromaNames: CHROMA_NAME_VARIANTS.filter(
        (variant) => variant.id !== "eclipse",
      ).map((variant) => variant.id),
    };
    expect(chromaNameOdds(exceptEclipse)).toEqual([
      { id: "eclipse", probabilityPct: 100 },
    ]);
    expect(drawChromaNameByRoll(exceptEclipse, 0)).toBe("eclipse");

    const complete = {
      chromaNames: CHROMA_NAME_VARIANTS.map((variant) => variant.id),
    };
    expect(chromaNameOdds(complete)).toEqual([]);
    expect(drawChromaNameByRoll(complete, 0)).toBeNull();
  });
});
