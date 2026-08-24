// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactCharacterSummary } from "./CompactCharacterSummary";

afterEach(cleanup);

describe("접을 수 있는 캐릭터 요약", () => {
  it("펼친 상세 카드 안쪽의 간단한 화살표 버튼으로 다시 접는다", () => {
    const onExpandedChange = vi.fn();
    render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
        guild={null}
        expanded
        onExpandedChange={onExpandedChange}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );

    expect(screen.getByText("전체 캐릭터 카드")).toBeTruthy();
    expect(screen.queryByText("캐릭터 상세 정보")).toBeNull();
    const collapse = screen.getByRole("button", { name: "캐릭터 정보 접기" });
    expect(collapse.textContent).toBe("");
    expect(collapse.className).toContain("absolute");
    expect(collapse.className).not.toContain("w-full");

    fireEvent.click(collapse);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it("목업의 캐릭터 카드처럼 성장 상태·버프·장비 6슬롯을 한눈에 보여준다", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0, classDisplayName: "수석 요리사" }}
        guild={{ id: 1, name: "무무게" }}
        levelCap={90}
        activePresetName="사냥 프리셋 2"
        adventureSupport={{ active: true, activeUntil: Date.now() + 86_400_000, regenBonusPct: 20 }}
        activeFoodBuff={{ recipeId: "fried_egg", recipeName: "계란 프라이", quality: "normal", effect: {}, expiresAt: Date.now() + 3_600_000 }}
        equipped={{ weapon: "weapon-1" }}
        owned={[{ iid: "weapon-1", id: "v2_iron_sword" }]}
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );
    expect(screen.getByText("젠피")).toBeTruthy();
    expect(screen.getByText(/수석 요리사 · 무무게/)).toBeTruthy();
    expect(screen.getByText("HP 80 / 100")).toBeTruthy();
    expect(screen.getByText("Lv.87")).toBeTruthy();
    expect(screen.getByText("전직 Lv.90")).toBeTruthy();
    expect(screen.getByText("MP 20 / 40")).toBeTruthy();
    expect(screen.getByText("EXP 462 / 1,000")).toBeTruthy();
    expect(screen.getByText("사냥 프리셋 2")).toBeTruthy();
    expect(screen.getByText("계란 프라이")).toBeTruthy();
    expect(screen.getByText("모험 지원권")).toBeTruthy();
    expect(document.querySelectorAll("[data-compact-equipment-slot]")).toHaveLength(6);
    expect(screen.getByTitle("무기 · 철검")).toBeTruthy();
    const expand = screen.getByRole("button", { name: "캐릭터 정보 펼치기" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(expand.className).toContain("size-11");
    fireEvent.click(expand);
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    rerender(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0, classDisplayName: "수석 요리사" }}
        guild={{ id: 1, name: "무무게" }}
        levelCap={90}
        expanded
        onExpandedChange={onExpandedChange}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );
    expect(screen.getByText("전체 캐릭터 카드")).toBeTruthy();
  });
});
