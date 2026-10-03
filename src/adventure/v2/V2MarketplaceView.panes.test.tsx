// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceHarness } from "@/app/dev/marketplace/MarketplaceHarness";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("거래소 PC 2단", () => {
  it("둘러보기는 왼쪽에 분류·검색·정렬, 오른쪽에 매물을 두고 PC 폭을 넓힌다", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    const { container } = render(<MarketplaceHarness />);

    const aside = container.querySelector("aside");
    expect(aside?.querySelector('input[placeholder="아이템 또는 제작자 검색"]')).toBeTruthy();
    expect(aside?.querySelector('[aria-label="매물 정렬"]')).toBeTruthy();
    expect(aside?.querySelector('[role="tablist"]')?.className).toContain("lg:grid-cols-4");
    expect(aside?.className).not.toContain("lg:sticky");
    expect(container.querySelector("main")?.className).toContain("lg:max-w-[60rem]");
  });

  it("최근 거래 탭은 2단으로 나누지 않는다", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    const { container } = render(<MarketplaceHarness />);

    fireEvent.click(screen.getByRole("button", { name: /최근 거래/ }));
    expect(container.querySelector("aside")).toBeNull();
  });
});
