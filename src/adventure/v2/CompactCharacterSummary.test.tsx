// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactCharacterSummary } from "./CompactCharacterSummary";
import { V2CharacterCard } from "./V2CharacterCard";

afterEach(cleanup);

describe("접을 수 있는 캐릭터 요약", () => {
  it("접힌 요약의 모험 지원권을 누르면 혜택과 남은 시간을 상세 카드로 보여준다", () => {
    render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
        guild={null}
        adventureSupport={{
          active: true,
          activeUntil: Date.now() + 86_400_000,
          regenBonusPct: 20,
        }}
        expanded={false}
        onExpandedChange={vi.fn()}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "모험 지원권 상세 보기" }),
    );

    const dialog = screen.getByRole("dialog", { name: "모험 지원권 정보" });
    expect(dialog.textContent).toContain("에너지 회복량 20% 증가");
    expect(dialog.textContent).toContain("남음");
    expect(dialog.textContent).toContain("까지");
  });

  it("접힌 요약의 음식을 누르면 품질과 효과와 남은 시간을 상세 카드로 보여준다", () => {
    render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
        guild={null}
        activeFoodBuff={{
          recipeId: "fried_egg",
          recipeName: "계란 프라이",
          quality: "careful",
          effect: { combatFlat: { atk: 25 }, huntExpPct: 10 },
          expiresAt: Date.now() + 3_600_000,
        }}
        expanded={false}
        onExpandedChange={vi.fn()}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "계란 프라이 음식 효과 보기" }),
    );

    const dialog = screen.getByRole("dialog", { name: "계란 프라이 음식 효과" });
    expect(dialog.textContent).toContain("정성작");
    expect(dialog.textContent).toContain("공격력 +25");
    expect(dialog.textContent).toContain("사냥 경험치 +10%");
    expect(dialog.textContent).toContain("남음");
    expect(dialog.textContent).toContain("까지");
  });

  it("접힌 요약의 장착 장비를 누르면 실제 개체 옵션 카드를 읽기 전용으로 보여준다", () => {
    render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
        guild={null}
        equipped={{ weapon: "weapon-1" }}
        owned={[
          {
            iid: "weapon-1",
            id: "v2_iron_sword",
            roll: { power: 100, weight: 0, options: {} },
            enhance: { level: 5, bonusPct: 8 },
          },
        ]}
        expanded={false}
        onExpandedChange={vi.fn()}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "철검 아이템 옵션 보기" }),
    );

    const dialog = screen.getByRole("dialog", { name: "철검 정보" });
    expect(dialog.textContent).toContain("철검 +5");
    expect(dialog.textContent).toContain("기본 +100 · 강화 +8");
    expect(screen.queryByRole("button", { name: /비어 있음.*옵션 보기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "장착하기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "해제" })).toBeNull();
  });

  it("펼친 상세 카드 내부의 문구가 있는 버튼으로 다시 접는다", () => {
    const onExpandedChange = vi.fn();
    render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
        guild={null}
        expanded
        onExpandedChange={onExpandedChange}
      >
        <V2CharacterCard
          character={{ name: "젠피", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0 }}
          onCollapse={() => onExpandedChange(false)}
        />
      </CompactCharacterSummary>,
    );

    const collapse = screen.getByRole("button", { name: "캐릭터 정보 접기" });
    expect(collapse.textContent).toContain("상세 정보 접기");
    expect(collapse.closest(".ui-character-card")).not.toBeNull();
    expect(collapse.className).not.toContain("absolute");

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
