// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextSettlementBuildingUpgrade } from "@/adventure/data/v2/settlement";
import { GuildFacilitiesPanel } from "./GuildOutpostsPanel";
import { GuildFacilityUpgradeFund } from "./GuildFacilityUpgradeFund";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderUpgradeFund() {
  const next = nextSettlementBuildingUpgrade("guild_smithy", 1);
  if (!next) throw new Error("제작소 Lv.2 업그레이드 정의가 필요합니다.");
  render(
    <GuildFacilityUpgradeFund
      buildingId="guild_smithy"
      next={next}
      guildGold={0}
      guildFame={0}
    />,
  );
}

describe("길드 시설 카드 작업 위치", () => {
  it("시설 주요 버튼을 가변적인 업그레이드 영역보다 앞의 고정 요약 영역에 둔다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitiesPanel
        guildId={1}
        info={{
          settlementBuildings: { guild_smithy: 1 },
          settlementBuildingLevels: { guild_smithy: 1 },
          guildGold: 0,
        }}
        activeFacility={null}
        onFacilityChange={vi.fn()}
      />,
    );

    const primaryActionIndex = html.indexOf(">제작소 열기<");
    const upgradeFundIndex = html.indexOf("Lv 2 재료 기부");

    expect(html).toContain('aria-label="제작소 요약"');
    expect(html).toContain("min-h-[8rem]");
    expect(html).toContain("line-clamp-2");
    expect(primaryActionIndex).toBeGreaterThan(-1);
    expect(upgradeFundIndex).toBeGreaterThan(-1);
    expect(primaryActionIndex).toBeLessThan(upgradeFundIndex);
  });

  it("기부 폼 닫기 버튼을 다크 모드에서도 AA 대비로 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ materials: { v2_timber: 100 } })),
    );
    renderUpgradeFund();

    fireEvent.click(screen.getByRole("button", { name: "재료 기부" }));
    const closeButton = await screen.findByRole("button", { name: "닫기" });

    expect(closeButton.className).toContain("text-zinc-600");
    expect(closeButton.className).toContain("dark:text-zinc-300");
  });

  it("기부 폼을 닫으면 재료 기부 버튼으로 포커스를 복원한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ materials: { v2_timber: 100 } })),
    );
    renderUpgradeFund();

    const trigger = screen.getByRole("button", { name: "재료 기부" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "재료 기부" }),
      ),
    );
  });
});

describe("운영 실적 진행 표시", () => {
  const next = nextSettlementBuildingUpgrade("trade_post", 5, "guild_facility");
  if (!next) throw new Error("교역소 Lv.6 정의가 필요합니다.");
  const materials = Object.fromEntries(
    Object.entries(next.cost).filter(([key]) => key !== "gold" && key !== "fame"),
  );
  function renderFund(points: number) {
    render(
      <GuildFacilityUpgradeFund
        buildingId="trade_post"
        next={next!}
        progress={{ targetLevel: 6, materials }}
        operations={{ targetLevel: 6, points, required: 200, weekPoints: 64, weeklyCap: 100 }}
        guildGold={10_000_000_000}
        guildFame={1_000_000}
        canComplete
        onComplete={vi.fn()}
      />,
    );
  }

  it("실적과 이번 주 적립량을 보여주고 미달이면 완료할 수 없다", () => {
    renderFund(120);
    expect(screen.getByText("운영 실적")).toBeTruthy();
    expect(screen.getByText("120 / 200")).toBeTruthy();
    expect(screen.getByText("이번 주 +64 / 100")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "업그레이드하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("운영 실적이 아직 부족합니다.")).toBeTruthy();
  });

  it("실적을 채우면 완료할 수 있다", () => {
    renderFund(200);
    expect(
      (screen.getByRole("button", { name: "업그레이드하기" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("Lv.6 미만 목표에는 실적 줄이 없다", () => {
    renderUpgradeFund();
    expect(screen.queryByText("운영 실적")).toBeNull();
  });
});
