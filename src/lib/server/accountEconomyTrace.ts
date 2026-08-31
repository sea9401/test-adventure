export type EconomyTraceDays = 7 | 30 | 90;

export type EconomyTraceAccount = {
  userId: string;
  gameName: string;
  guildId: number | null;
  guildName: string | null;
  guildRole: string | null;
};

export type EconomyTraceGatheringRow = {
  eventType: string;
  itemKind: string | null;
  itemId: string | null;
  itemName: string | null;
  quantity: number;
  events: number;
};

export type EconomyTraceEventRow = {
  eventType: string;
  itemKind: string | null;
  itemId: string | null;
  quantity: number;
  goldDelta: number;
  events: number;
};

export type EconomyTraceCounterpartyRow = EconomyTraceEventRow & {
  counterpartyUserId: string | null;
  counterpartyName: string | null;
};

export type EconomyTraceWarehouseRow = {
  type: string;
  itemKind: string | null;
  itemId: string | null;
  itemName: string | null;
  quantity: number;
  events: number;
};

export type AccountEconomyTraceInput = {
  account: EconomyTraceAccount;
  days: EconomyTraceDays;
  since: string;
  until: string;
  gatheringRows: EconomyTraceGatheringRow[];
  economyRows: EconomyTraceEventRow[];
  counterpartyRows: EconomyTraceCounterpartyRow[];
  warehouseRows: EconomyTraceWarehouseRow[];
  currentMaterials: Record<string, number>;
  gold: number;
  bankedGold: number;
};

type TraceActivity = "woodcutting" | "mining" | "farming" | "fishing";

export type AccountEconomyTraceReport = {
  account: EconomyTraceAccount;
  period: { days: EconomyTraceDays; since: string; until: string };
  production: {
    totalQuantity: number;
    activities: Array<{
      activity: TraceActivity;
      quantity: number;
      events: number;
    }>;
    items: Array<{
      activity: TraceActivity;
      itemKind: string | null;
      itemId: string;
      itemName: string;
      quantity: number;
      events: number;
    }>;
  };
  current: {
    gold: number;
    bankedGold: number;
    productionMaterials: Array<{
      itemKind: string;
      itemId: string;
      itemName: string;
      quantity: number;
    }>;
  };
  marketplace: Array<{
    direction: "buy" | "sell";
    eventType: string;
    itemKind: string | null;
    itemId: string | null;
    quantity: number;
    goldDelta: number;
    events: number;
    counterpartyUserId: string | null;
    counterpartyName: string | null;
  }>;
  guildWarehouse: Array<{
    direction: "deposit" | "withdraw";
    itemKind: string | null;
    itemId: string | null;
    itemName: string | null;
    quantity: number;
    events: number;
  }>;
  uses: EconomyTraceEventRow[];
  evidence: {
    materialMarketplaceTransfer: boolean;
    guildWarehouseDeposit: boolean;
  };
  limitations: string;
};

const ACTIVITY_ORDER: TraceActivity[] = [
  "woodcutting",
  "mining",
  "farming",
  "fishing",
];

export function parseEconomyTraceDays(raw: string | null): EconomyTraceDays | null {
  if (raw === null || raw.trim() === "") return 30;
  const days = Number(raw);
  return days === 7 || days === 30 || days === 90 ? days : null;
}

export function buildAccountEconomyTrace(
  input: AccountEconomyTraceInput,
): AccountEconomyTraceReport {
  const activities = new Map<
    TraceActivity,
    { activity: TraceActivity; quantity: number; events: number }
  >();
  const items: AccountEconomyTraceReport["production"]["items"] = [];

  for (const row of input.gatheringRows) {
    const activity = activityFromEventType(row.eventType);
    if (!activity || !row.itemId) continue;
    const current = activities.get(activity) ?? {
      activity,
      quantity: 0,
      events: 0,
    };
    current.quantity += safeInteger(row.quantity);
    current.events += safeInteger(row.events);
    activities.set(activity, current);
    items.push({
      activity,
      itemKind: row.itemKind,
      itemId: row.itemId,
      itemName: row.itemName?.trim() || row.itemId,
      quantity: safeInteger(row.quantity),
      events: safeInteger(row.events),
    });
  }

  const productionItems = new Map(
    items
      .filter((row) => row.itemKind === "material")
      .map((row) => [row.itemId, row] as const),
  );
  const productionMaterials = [...productionItems.values()]
    .map((row) => ({
      itemKind: "material",
      itemId: row.itemId,
      itemName: row.itemName,
      quantity: safeInteger(input.currentMaterials[row.itemId]),
    }))
    .filter((row) => row.quantity > 0);

  const marketplace = input.counterpartyRows.map((row) => ({
    direction: marketplaceDirection(row.eventType),
    eventType: row.eventType,
    itemKind: row.itemKind,
    itemId: row.itemId,
    quantity: safeInteger(row.quantity),
    goldDelta: safeInteger(row.goldDelta),
    events: safeInteger(row.events),
    counterpartyUserId: row.counterpartyUserId,
    counterpartyName: row.counterpartyName,
  }));
  const guildWarehouse = input.warehouseRows.flatMap((row) => {
    if (row.type !== "warehouse_deposit" && row.type !== "warehouse_withdraw") {
      return [];
    }
    return [
      {
        direction: row.type === "warehouse_deposit" ? "deposit" : "withdraw",
        itemKind: row.itemKind,
        itemId: row.itemId,
        itemName: row.itemName,
        quantity: safeInteger(row.quantity),
        events: safeInteger(row.events),
      } satisfies AccountEconomyTraceReport["guildWarehouse"][number],
    ];
  });

  const activityList = ACTIVITY_ORDER.flatMap((activity) => {
    const row = activities.get(activity);
    return row ? [row] : [];
  });
  return {
    account: input.account,
    period: { days: input.days, since: input.since, until: input.until },
    production: {
      totalQuantity: activityList.reduce((sum, row) => sum + row.quantity, 0),
      activities: activityList,
      items,
    },
    current: {
      gold: safeInteger(input.gold),
      bankedGold: safeInteger(input.bankedGold),
      productionMaterials,
    },
    marketplace,
    guildWarehouse,
    uses: input.economyRows,
    evidence: {
      materialMarketplaceTransfer: marketplace.some(
        (row) => row.direction === "sell" && row.itemKind === "material",
      ),
      guildWarehouseDeposit: guildWarehouse.some(
        (row) => row.direction === "deposit",
      ),
    },
    limitations:
      "스택 재료에는 개별 일련번호가 없어 생산품 한 개의 완전한 이동 경로를 확정할 수 없습니다. 확인된 직접 거래·창고 이동과 현재 잔액을 함께 판단해 주세요.",
  };
}

function activityFromEventType(eventType: string): TraceActivity | null {
  const activity = eventType.split(".")[1];
  return activity === "woodcutting" ||
    activity === "mining" ||
    activity === "farming" ||
    activity === "fishing"
    ? activity
    : null;
}

function marketplaceDirection(eventType: string): "buy" | "sell" {
  return eventType.includes("sell") ? "sell" : "buy";
}

function safeInteger(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) ? number : 0;
}
