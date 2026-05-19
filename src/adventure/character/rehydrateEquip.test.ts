import { describe, expect, it } from "vitest";
import { ITEMS } from "@/adventure/data/items";
import { rehydrateEquippedItem } from "./rehydrateEquip";

// 회귀 테스트 — 과거 서버측 rehydrate 가 craftTier/dropQuality 를 무시하고 베이스만
// 돌려줘서, 걸작/빼어난 장비를 낀 빌드의 feat(흡혈 등)이 위탁 사냥에서 침묵 비활성화됐다.
// 공용 헬퍼 rehydrateEquippedItem 이 두 marker 모두 반영하도록 보장한다.
describe("rehydrateEquippedItem", () => {
  const baseId = "bandit_dagger"; // bonus: { atk: 4, dex: 2 }, variance 있는 제작산 후보.

  it("null/undefined 입력은 null", () => {
    expect(rehydrateEquippedItem(null)).toBeNull();
    expect(rehydrateEquippedItem(undefined)).toBeNull();
  });

  it("이름 매칭 실패면 null (아이템 삭제·rename 케이스)", () => {
    const ghost = { ...ITEMS[baseId], name: "그런아이템없음" };
    expect(rehydrateEquippedItem(ghost)).toBeNull();
  });

  it("craftTier/dropQuality 없는 일반 인스턴스는 베이스로 교체", () => {
    const saved = ITEMS[baseId];
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.bonus).toEqual(ITEMS[baseId].bonus);
  });

  it("craftTier 마커가 있으면 등급 반영본을 돌려준다 (마커 + 베이스 이상)", () => {
    const base = ITEMS[baseId];
    const saved = { ...base, craftTier: 2 as const };
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.craftTier).toBe(2);
    // 베이스가 atk/dex 만 가지므로 둘만 비교. variance 정의가 있으면 크고, 없으면 같다.
    const bonus = (re!.bonus ?? {}) as Record<string, number | undefined>;
    const baseBonus = (base.bonus ?? {}) as Record<string, number | undefined>;
    expect(bonus.atk ?? 0).toBeGreaterThanOrEqual(baseBonus.atk ?? 0);
    expect(bonus.dex ?? 0).toBeGreaterThanOrEqual(baseBonus.dex ?? 0);
  });

  it("dropQuality 마커가 있으면 그 등급 반영본을 돌려준다", () => {
    const base = ITEMS[baseId];
    const saved = { ...base, dropQuality: 2 as const };
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.dropQuality).toBe(2);
    const bonus = (re!.bonus ?? {}) as Record<string, number | undefined>;
    const baseBonus = (base.bonus ?? {}) as Record<string, number | undefined>;
    expect(bonus.atk ?? 0).toBeGreaterThanOrEqual(baseBonus.atk ?? 0);
    expect(bonus.dex ?? 0).toBeGreaterThanOrEqual(baseBonus.dex ?? 0);
  });

  // 인스턴스 기반 장비(별빛 재단 무구) — instanceId + enhancementLevel 까지 들고 있다.
  it("별빛 재단 무구 +3 — bonus 에 강화 보너스 누적", () => {
    const base = ITEMS.starlit_greatsword_str;
    const saved = {
      ...base,
      instanceId: "inst-test-123",
      enhancementLevel: 3,
    };
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.instanceId).toBe("inst-test-123");
    expect(re!.enhancementLevel).toBe(3);
    // base: atk 28, str 19 (힘의 별빛 대검) / +3: atk 31, str 22
    expect(re!.bonus?.atk).toBe(31);
    expect(re!.bonus?.str).toBe(22);
  });

  it("별빛 재단 무구 그러나 instanceId 누락 — 강화 0 베이스로 살린다 (슬롯 보존)", () => {
    const base = ITEMS.starlit_greatsword_str;
    const saved = { ...base }; // instanceId 없음
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.bonus).toEqual(base.bonus);
    // 강화 0 베이스로 떨어졌으므로 instanceId / enhancementLevel 메타는 비어 있음.
    expect(re!.instanceId).toBeUndefined();
    expect(re!.enhancementLevel).toBeUndefined();
  });

  it("별빛 재단 무구 + craftTier 만 있고 instanceId 누락 — 등급 반영 베이스로 살린다", () => {
    const base = ITEMS.starlit_greatsword_str;
    const saved = { ...base, craftTier: 2 as const }; // instanceId 없음
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.craftTier).toBe(2);
    const bonus = (re!.bonus ?? {}) as Record<string, number | undefined>;
    const baseBonus = (base.bonus ?? {}) as Record<string, number | undefined>;
    expect(bonus.atk ?? 0).toBeGreaterThanOrEqual(baseBonus.atk ?? 0);
  });

  it("별빛 재단 무구 +0 (미강화) — bonus 베이스 그대로, 메타만 박힘", () => {
    const base = ITEMS.starlit_armor_dex;
    const saved = {
      ...base,
      instanceId: "inst-mantle",
      enhancementLevel: 0,
    };
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.bonus).toEqual(base.bonus);
    expect(re!.enhancementLevel).toBe(0);
  });

  it("별빛 무구 enhancementLevel 가 MAX 초과 — MAX 로 clamp", () => {
    const saved = {
      ...ITEMS.starlit_greatsword_str,
      instanceId: "inst-clamp",
      enhancementLevel: 999,
    };
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.enhancementLevel).toBe(7);
  });
});
