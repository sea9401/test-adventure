// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactCharacterEffectCard } from "./CompactCharacterEffectCard";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
});

describe("접힌 캐릭터 효과 상세 카드", () => {
  it("좁은 모바일 화면에서 카드 좌우와 높이를 뷰포트 안으로 제한한다", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });

    render(
      <CompactCharacterEffectCard
        detail={{
          kind: "food",
          buff: {
            recipeId: "fried_egg",
            recipeName: "계란 프라이",
            quality: "normal",
            effect: { combatFlat: { atk: 25 } },
            expiresAt: Date.now() + 3_600_000,
          },
        }}
        anchor={{ top: 500, bottom: 530, left: 310 }}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "계란 프라이 음식 효과" });
    const width = Number.parseFloat(dialog.style.width);
    const left = Number.parseFloat(dialog.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(312);
    expect(dialog.style.maxHeight).toBe("486px");
    expect(dialog.className).toContain("overflow-y-auto");
  });

  it("Escape 키와 닫기 버튼으로 상세 카드를 닫는다", () => {
    const onClose = vi.fn();
    render(
      <CompactCharacterEffectCard
        detail={{
          kind: "support",
          activeUntil: Date.now() + 86_400_000,
          regenBonusPct: 20,
        }}
        anchor={{ top: 100, bottom: 120, left: 20 }}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("프리미엄 만료 경계 뒤에는 대기 중인 일반 지원권으로 표시한다", () => {
    const now = Date.UTC(2026, 7, 30);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    render(
      <CompactCharacterEffectCard
        detail={{
          kind: "support",
          tier: "premium",
          premiumUntil: now,
          activeUntil: now + 10 * 86_400_000,
          regenBonusPct: 20,
        }}
        anchor={{ top: 100, bottom: 120, left: 20 }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "모험 지원권 정보" }),
    ).toBeTruthy();
    expect(screen.getByText("모험 지원권")).toBeTruthy();
    expect(screen.queryByText("모험 지원권 프리미엄")).toBeNull();
    vi.useRealTimers();
  });
});
