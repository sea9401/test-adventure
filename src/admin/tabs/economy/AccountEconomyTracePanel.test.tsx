import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountEconomyTraceReport } from "@/lib/server/accountEconomyTrace";
import { AccountEconomyTraceReportView } from "./AccountEconomyTracePanel";

const report: AccountEconomyTraceReport = {
  account: {
    userId: "user-black-cow",
    gameName: "흑우",
    guildId: 7,
    guildName: "네오",
    guildRole: "member",
  },
  period: {
    days: 30,
    since: "2026-07-13T00:00:00.000Z",
    until: "2026-08-12T00:00:00.000Z",
  },
  production: {
    totalQuantity: 120,
    activities: [{ activity: "woodcutting", quantity: 120, events: 12 }],
    items: [
      {
        activity: "woodcutting",
        itemKind: "material",
        itemId: "pine_log",
        itemName: "소나무 원목",
        quantity: 120,
        events: 12,
      },
    ],
  },
  current: {
    gold: 50_000,
    bankedGold: 20_000,
    productionMaterials: [
      {
        itemKind: "material",
        itemId: "pine_log",
        itemName: "소나무 원목",
        quantity: 80,
      },
    ],
  },
  marketplace: [
    {
      direction: "sell",
      eventType: "marketplace.sell",
      itemKind: "material",
      itemId: "pine_log",
      quantity: 30,
      goldDelta: 9_000,
      events: 1,
      counterpartyUserId: "buyer-id",
      counterpartyName: "구매자",
    },
  ],
  guildWarehouse: [
    {
      direction: "deposit",
      itemKind: "material",
      itemId: "pine_log",
      itemName: "소나무 원목",
      quantity: 10,
      events: 1,
    },
  ],
  uses: [
    {
      eventType: "shop.material.sell",
      itemKind: "material",
      itemId: "pine_log",
      quantity: 5,
      goldDelta: 500,
      events: 1,
    },
  ],
  evidence: {
    materialMarketplaceTransfer: true,
    guildWarehouseDeposit: true,
  },
  limitations:
    "스택 재료에는 개별 일련번호가 없어 생산품 한 개의 완전한 이동 경로를 확정할 수 없습니다.",
};

describe("계정 재화 흐름 분석 결과", () => {
  it("생산·현재 보유·직접 거래 상대·길드 창고 이동과 추적 한계를 보여준다", () => {
    const html = renderToStaticMarkup(
      <AccountEconomyTraceReportView report={report} />,
    );

    expect(html).toContain("흑우");
    expect(html).toContain("네오");
    expect(html).toContain("120");
    expect(html).toContain("소나무 원목");
    expect(html).toContain("구매자");
    expect(html).toContain("길드 창고 입고");
    expect(html).toContain("직접 이동 기록 있음");
    expect(html).toContain("개별 일련번호");
  });

  it("직접 거래와 창고 이동이 없을 때 명시적인 없음 상태를 보여준다", () => {
    const emptyReport: AccountEconomyTraceReport = {
      ...report,
      marketplace: [],
      guildWarehouse: [],
      uses: [],
      evidence: {
        materialMarketplaceTransfer: false,
        guildWarehouseDeposit: false,
      },
    };
    const html = renderToStaticMarkup(
      <AccountEconomyTraceReportView report={emptyReport} />,
    );

    expect(html).toContain("확인된 직접 이동 없음");
    expect(html).toContain("거래 상대 기록 없음");
    expect(html).toContain("길드 창고 이동 없음");
    expect(html).toContain("주요 사용 기록 없음");
  });
});
