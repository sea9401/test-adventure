// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 시설 이용 패널은 각자 게임 상태·API를 쓰므로 이 화면 배치 테스트에서는 이름만 남긴다.
vi.mock("@/adventure/v2/guild/GuildWorkshopPanel", () => ({ GuildWorkshopPanel: () => <p>제작소 패널</p> }));
vi.mock("@/adventure/v2/guild/GuildTrainingGroundPanel", () => ({ GuildTrainingGroundPanel: () => <p>훈련장 패널</p> }));
vi.mock("@/adventure/v2/guild/GuildAlchemyWorkshopPanel", () => ({ GuildAlchemyWorkshopPanel: () => <p>연금 공방 패널</p> }));
vi.mock("@/adventure/v2/guild/GuildDiningHallPanel", () => ({ GuildDiningHallPanel: () => <p>식당 패널</p> }));
vi.mock("@/adventure/v2/guild/GuildTradePostPanel", () => ({ GuildTradePostPanel: () => <p>교역소 패널</p> }));
import {
  AdventurerAssociationView,
  associationFacilityRowDescription,
} from "./AdventurerAssociationView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serveAssociation() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/v2/association") {
        return Response.json({
          ok: true,
          facilities: [
            {
              buildingId: "exploration_hq",
              level: 1,
              targetLevel: 2,
              materials: {},
              gold: 0,
              nextUpgrade: { level: 2, associationCost: { gold: 1000 } },
            },
          ],
        });
      }
      return Response.json({ ok: false });
    }),
  );
}

describe("모험가 협회 목록과 상세", () => {
  it("행 설명은 레벨과 현재 효과 요약이다", () => {
    expect(
      associationFacilityRowDescription({ buildingId: "training_ground", level: 1 }),
    ).toMatch(/^Lv\.1 · .+/);
  });

  it("시설 여섯 개를 행으로 보여 주고 목록에는 기부 양식을 두지 않는다", async () => {
    serveAssociation();
    render(<AdventurerAssociationView onBack={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /탐사 본부/ })).toBeTruthy();
    for (const name of ["협회 제작소", "훈련장", "연금 공방", "협회 식당", "협회 교역소"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "재료·골드 기부" })).toBeNull();
    expect(screen.queryByText(/무소속 모험가를 위한 공공시설/)).toBeNull();
  });

  it("시설을 고르면 이용과 공동 기부를 바꿔 볼 수 있다", async () => {
    serveAssociation();
    render(<AdventurerAssociationView onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /탐사 본부/ }));
    const views = screen.getByRole("group", { name: "시설 보기" });
    expect(views.querySelector('[aria-pressed="true"]')?.textContent).toBe("이용");
    expect(screen.queryByRole("button", { name: "재료·골드 기부" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "공동 기부 (Lv.2)" }));
    expect(screen.getByRole("button", { name: "재료·골드 기부" })).toBeTruthy();
  });
});

describe("모험가 협회 PC 2단", () => {
  it("1024px 이상에서는 시설 목록과 고른 시설을 나란히 보여 주고 첫 시설을 먼저 고른다", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("1024px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    serveAssociation();
    render(<AdventurerAssociationView onBack={vi.fn()} />);

    const firstRow = await screen.findByRole("button", { name: /협회 제작소/ });
    expect(firstRow.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("group", { name: "시설 보기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "모험가 협회" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /협회 제작소/ }).closest("section")).toBeTruthy();
    expect(screen.getByText("제작소 패널")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /탐사 본부/ }));
    expect(screen.getByRole("button", { name: /탐사 본부/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("이 시설의 공공 이용 화면을 준비하고 있습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /협회 제작소/ })).toBeTruthy();
  });
});
