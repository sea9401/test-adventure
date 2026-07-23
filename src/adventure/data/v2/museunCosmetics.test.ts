import { describe, expect, it } from "vitest";
import { MUSEUN_CASH_ITEMS } from "./museunCashItems";
import {
  CHROMA_NAME_VARIANTS,
  CHAT_BADGE_RARITIES,
  CHAT_BADGE_VARIANTS,
  COSMETIC_RARITY_DISPLAY_ORDER,
  PROFILE_BORDER_RARITIES,
  PROFILE_BORDER_VARIANTS,
  chatBadgeOdds,
  isMuseunCosmeticItemId,
  museunCosmeticAppearance,
  chromaNameOdds,
  drawChromaNameByRoll,
  drawChatBadgeByRoll,
  drawProfileBorderByRoll,
  equipChatBadge,
  equipChromaName,
  equipProfileBorder,
  extendMuseunCosmeticAccess,
  grantChromaName,
  LEGACY_MUSEUN_COSMETIC_ACCESS_UNTIL,
  MUSEUN_COSMETIC_ACCESS_MS,
  museunCosmeticAccessActive,
  parseMuseunCosmetics,
  profileBorderOdds,
  sortCosmeticVariantsByRarity,
  type CosmeticItemRarity,
  unlockMuseunCosmetic,
} from "./museunCosmetics";

const NOW = Date.UTC(2026, 6, 20, 12);

describe("무슨 코인 기간제 꾸미기", () => {
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
      accessUntil: {
        spectrum: LEGACY_MUSEUN_COSMETIC_ACCESS_UNTIL,
        starlight_chat_badge: LEGACY_MUSEUN_COSMETIC_ACCESS_UNTIL,
      },
      equippedChromaName: "spectrum",
      equippedProfileBorder: null,
      equippedChatBadge: "starlight_chat_badge",
    });
    expect(isMuseunCosmeticItemId("prismatic_profile_border")).toBe(true);
    expect(isMuseunCosmeticItemId("rename_permit")).toBe(false);
  });

  it("구매 권리를 한 번만 해금한다", () => {
    const first = unlockMuseunCosmetic(
      {},
      "prismatic_profile_border",
      NOW,
    );
    expect(first.alreadyOwned).toBe(false);
    expect(first.state.owned).toEqual(["prismatic_profile_border"]);
    expect(first.state.equippedProfileBorder).toBe(
      "prismatic_profile_border",
    );
    expect(first.state.accessUntil.prismatic_profile_border).toBe(
      NOW + MUSEUN_COSMETIC_ACCESS_MS,
    );
    const second = unlockMuseunCosmetic(
      first.state,
      "prismatic_profile_border",
    );
    expect(second.alreadyOwned).toBe(true);
    expect(second.state).toEqual(first.state);
  });

  it("프로필 꾸미기 15종과 채팅 배지 28종을 독립 장착한다", () => {
    expect(PROFILE_BORDER_VARIANTS).toHaveLength(15);
    expect(CHAT_BADGE_VARIANTS).toHaveLength(28);
    for (const variant of PROFILE_BORDER_VARIANTS) {
      expect(MUSEUN_CASH_ITEMS[variant.itemId].effect).toEqual({
        kind: "cosmetic",
        slot: "profile_border",
        style: variant.id,
      });
    }
    for (const variant of CHAT_BADGE_VARIANTS) {
      expect(MUSEUN_CASH_ITEMS[variant.itemId].effect).toEqual({
        kind: "cosmetic",
        slot: "chat_badge",
        style: variant.id,
      });
    }
    const borders = unlockMuseunCosmetic(
      unlockMuseunCosmetic({}, "prismatic_profile_border").state,
      "oceanic_profile_border",
    ).state;
    expect(borders.equippedProfileBorder).toBe("oceanic_profile_border");
    expect(
      equipProfileBorder(borders, "prismatic_profile_border")
        ?.equippedProfileBorder,
    ).toBe("prismatic_profile_border");
    expect(equipProfileBorder(borders, "celestial_profile_border")).toBeNull();

    const badges = unlockMuseunCosmetic(borders, "crown_chat_badge").state;
    expect(badges.equippedChatBadge).toBe("crown_chat_badge");
    expect(equipChatBadge(badges, null)?.equippedChatBadge).toBeNull();
  });

  it("프로필 꾸미기와 배지를 전설부터 일반까지 정렬하고 동급 순서를 유지한다", () => {
    expect(COSMETIC_RARITY_DISPLAY_ORDER).toEqual([
      "legendary",
      "epic",
      "rare",
      "common",
    ]);

    const expectRarityOrder = (
      variants: readonly { itemId: string; rarity: CosmeticItemRarity }[],
    ) => {
      const originalItemIds = variants.map((variant) => variant.itemId);
      const sorted = sortCosmeticVariantsByRarity(variants);
      expect([...new Set(sorted.map((variant) => variant.rarity))]).toEqual(
        COSMETIC_RARITY_DISPLAY_ORDER,
      );
      expect(variants.map((variant) => variant.itemId)).toEqual(originalItemIds);
      for (const rarity of COSMETIC_RARITY_DISPLAY_ORDER) {
        expect(
          sorted
            .filter((variant) => variant.rarity === rarity)
            .map((variant) => variant.itemId),
        ).toEqual(
          variants
            .filter((variant) => variant.rarity === rarity)
            .map((variant) => variant.itemId),
        );
      }
    };

    expectRarityOrder(PROFILE_BORDER_VARIANTS);
    expectRarityOrder(CHAT_BADGE_VARIANTS);
  });

  it("프로필 꾸미기 상자는 일반 60%·희귀 27%·영웅 10%·전설 3%로 추첨한다", () => {
    expect(
      Object.fromEntries(
        ["common", "rare", "epic", "legendary"].map((rarity) => [
          rarity,
          PROFILE_BORDER_VARIANTS.filter(
            (variant) => variant.rarity === rarity,
          ).length,
        ]),
      ),
    ).toEqual({ common: 5, rare: 4, epic: 5, legendary: 1 });
    expect(
      PROFILE_BORDER_VARIANTS.filter(
        (variant) => variant.rarity === "common",
      ).every((variant) => variant.interior === "none"),
    ).toBe(true);
    expect(
      PROFILE_BORDER_VARIANTS.filter(
        (variant) => variant.rarity !== "common",
      ).map((variant) => variant.interior),
    ).not.toContain("none");
    const odds = profileBorderOdds(null);
    const probabilityByRarity = Object.fromEntries(
      (Object.keys(PROFILE_BORDER_RARITIES) as Array<
        keyof typeof PROFILE_BORDER_RARITIES
      >).map((rarity) => [
        rarity,
        odds
          .filter((entry) =>
            PROFILE_BORDER_VARIANTS.some(
              (variant) =>
                variant.itemId === entry.itemId && variant.rarity === rarity,
            ),
          )
          .reduce((sum, entry) => sum + entry.probabilityPct, 0),
      ]),
    );
    expect(probabilityByRarity.common).toBeCloseTo(60);
    expect(probabilityByRarity.rare).toBeCloseTo(27);
    expect(probabilityByRarity.epic).toBeCloseTo(10);
    expect(probabilityByRarity.legendary).toBeCloseTo(3);
    expect(drawProfileBorderByRoll(null, 0)).toBe(
      "prismatic_profile_border",
    );
  });

  it("배지 상자는 일반 70%·희귀 22%·영웅 7%·전설 1%로 추첨한다", () => {
    expect(
      Object.fromEntries(
        ["common", "rare", "epic", "legendary"].map((rarity) => [
          rarity,
          CHAT_BADGE_VARIANTS.filter(
            (variant) => variant.rarity === rarity,
          ).length,
        ]),
      ),
    ).toEqual({ common: 14, rare: 7, epic: 5, legendary: 2 });
    const odds = chatBadgeOdds(null);
    const probabilityByRarity = Object.fromEntries(
      (Object.keys(CHAT_BADGE_RARITIES) as Array<
        keyof typeof CHAT_BADGE_RARITIES
      >).map((rarity) => [
        rarity,
        odds
          .filter((entry) =>
            CHAT_BADGE_VARIANTS.some(
              (variant) =>
                variant.itemId === entry.itemId && variant.rarity === rarity,
            ),
          )
          .reduce((sum, entry) => sum + entry.probabilityPct, 0),
      ]),
    );
    expect(probabilityByRarity.common).toBeCloseTo(70);
    expect(probabilityByRarity.rare).toBeCloseTo(22);
    expect(probabilityByRarity.epic).toBeCloseTo(7);
    expect(probabilityByRarity.legendary).toBeCloseTo(1);
    expect(drawChatBadgeByRoll(null, 0)).toBe("starlight_chat_badge");
  });

  it("각 등급이 남아 있는 동안 보유 개수와 무관하게 등급 확률을 유지한다", () => {
    const cosmetics = {
      owned: [
        "infernal_profile_border",
        "oceanic_profile_border",
        "prismatic_profile_border",
        "leaf_chat_badge",
        "sword_chat_badge",
        "flame_chat_badge",
        "crown_chat_badge",
      ],
    };
    const borderOdds = profileBorderOdds(cosmetics);
    const badgeOdds = chatBadgeOdds(cosmetics);
    const sumByRarity = <T extends { itemId: string; rarity: string }>(
      odds: Array<{ itemId: string; probabilityPct: number }>,
      variants: readonly T[],
    ) =>
      Object.fromEntries(
        ["common", "rare", "epic", "legendary"].map((rarity) => [
          rarity,
          odds
            .filter((entry) =>
              variants.some(
                (variant) =>
                  variant.itemId === entry.itemId && variant.rarity === rarity,
              ),
            )
            .reduce((sum, entry) => sum + entry.probabilityPct, 0),
        ]),
      );

    const borderProbability = sumByRarity(
      borderOdds,
      PROFILE_BORDER_VARIANTS,
    );
    expect(borderProbability.common).toBeCloseTo(60);
    expect(borderProbability.rare).toBeCloseTo(27);
    expect(borderProbability.epic).toBeCloseTo(10);
    expect(borderProbability.legendary).toBeCloseTo(3);

    const badgeProbability = sumByRarity(badgeOdds, CHAT_BADGE_VARIANTS);
    expect(badgeProbability.common).toBeCloseTo(70);
    expect(badgeProbability.rare).toBeCloseTo(22);
    expect(badgeProbability.epic).toBeCloseTo(7);
    expect(badgeProbability.legendary).toBeCloseTo(1);
  });

  it("각 상품을 사용 기간 안에서 서로 독립된 표시 효과로 해석한다", () => {
    expect(
      museunCosmeticAppearance({
        owned: ["starlight_chat_badge"],
        chromaNames: ["aurora"],
        equippedChromaName: "aurora",
      }, NOW),
    ).toEqual({
      profileBorder: null,
      chatBadge: "starlight",
      chatNameEffect: "aurora",
      championshipBadge: null,
    });
  });

  it("만료되면 표시·장착을 막고 연장권은 남은 기간 뒤에 30일을 더한다", () => {
    const active = grantChromaName({}, "aurora", NOW);
    expect(museunCosmeticAccessActive(active, "aurora", NOW)).toBe(true);
    expect(
      museunCosmeticAppearance(active, NOW + MUSEUN_COSMETIC_ACCESS_MS),
    ).toEqual({
      profileBorder: null,
      chatBadge: null,
      chatNameEffect: null,
      championshipBadge: null,
    });
    expect(
      equipChromaName(active, "aurora", NOW + MUSEUN_COSMETIC_ACCESS_MS),
    ).toBeNull();

    const stacked = extendMuseunCosmeticAccess(active, "aurora", 30, NOW);
    expect(stacked?.activeUntil).toBe(NOW + MUSEUN_COSMETIC_ACCESS_MS * 2);

    const renewed = extendMuseunCosmeticAccess(
      active,
      "aurora",
      30,
      NOW + MUSEUN_COSMETIC_ACCESS_MS,
    );
    expect(renewed?.activeUntil).toBe(
      NOW + MUSEUN_COSMETIC_ACCESS_MS * 2,
    );
    expect(
      extendMuseunCosmeticAccess({}, "aurora", 30, NOW),
    ).toBeNull();
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
    expect(CHROMA_NAME_VARIANTS).toHaveLength(56);
    expect(
      Object.fromEntries(
        ["common", "rare", "epic", "legendary"].map((rarity) => [
          rarity,
          CHROMA_NAME_VARIANTS.filter(
            (variant) => variant.rarity === rarity,
          ).length,
        ]),
      ),
    ).toEqual({ common: 22, rare: 14, epic: 14, legendary: 6 });
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
    expect(drawChromaNameByRoll(null, 1_511)).toBe("crimson");
    expect(drawChromaNameByRoll(null, 1_512)).toBe("coral");
    expect(drawChromaNameByRoll(null, 46_199)).toBe("petalfall");
  });

  it("각 등급이 남아 있는 동안 닉네임 보유 개수와 무관하게 등급 확률을 유지한다", () => {
    const odds = chromaNameOdds({
      chromaNames: ["crimson", "coral", "abyss", "spectrum", "hellfire"],
    });
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

    const allButCelestial = {
      owned: PROFILE_BORDER_VARIANTS.filter(
        (variant) => variant.itemId !== "celestial_profile_border",
      ).map((variant) => variant.itemId),
    };
    expect(profileBorderOdds(allButCelestial)).toEqual([
      { itemId: "celestial_profile_border", probabilityPct: 100 },
    ]);
    expect(drawProfileBorderByRoll(allButCelestial, 0)).toBe(
      "celestial_profile_border",
    );

    const allBadges = {
      owned: CHAT_BADGE_VARIANTS.map((variant) => variant.itemId),
    };
    expect(chatBadgeOdds(allBadges)).toEqual([]);
    expect(drawChatBadgeByRoll(allBadges, 0)).toBeNull();
  });
});
