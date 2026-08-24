// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompactCharacterSummary } from "./CompactCharacterSummary";

describe("접을 수 있는 캐릭터 요약", () => {
  it("기본 요약에 이름·직업·길드·HP·MP를 남기고 전체 카드를 펼친다", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 100, exp: 0, expToNext: null, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0, classDisplayName: "검성" }}
        guild={{ id: 1, name: "무무게" }}
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );
    expect(screen.getByText("젠피")).toBeTruthy();
    expect(screen.getByText(/검성 · 무무게/)).toBeTruthy();
    expect(screen.getByText("HP 80 / 100")).toBeTruthy();
    expect(screen.getByText("Lv.100")).toBeTruthy();
    expect(screen.getByText("MP 20 / 40")).toBeTruthy();
    const expand = screen.getByRole("button", { name: "캐릭터 정보 펼치기" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(expand.className).toContain("size-11");
    fireEvent.click(expand);
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    rerender(
      <CompactCharacterSummary
        character={{ name: "젠피", level: 100, exp: 0, expToNext: null, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 0, classDisplayName: "검성" }}
        guild={{ id: 1, name: "무무게" }}
        expanded
        onExpandedChange={onExpandedChange}
      >
        <div>전체 캐릭터 카드</div>
      </CompactCharacterSummary>,
    );
    expect(screen.getByText("전체 캐릭터 카드")).toBeTruthy();
  });
});
