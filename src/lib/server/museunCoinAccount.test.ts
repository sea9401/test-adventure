import { describe, expect, it } from "vitest";
import {
  allocateMuseunCoinSpend,
  createMuseunCoinAccountOperations,
  type MuseunCoinAccountState,
  type MuseunCoinAccountStore,
  type MuseunCoinLedgerRecord,
  type MuseunCoinPaidLotState,
} from "./museunCoinAccount";

class MemoryStore implements MuseunCoinAccountStore {
  account: MuseunCoinAccountState;
  lots: MuseunCoinPaidLotState[] = [];
  ledger: MuseunCoinLedgerRecord[] = [];
  allocations: Array<{ ledgerId: number; lotOrderId: string; coins: number }> = [];
  mirroredCoins: number[] = [];

  constructor(account?: Partial<MuseunCoinAccountState>) {
    this.account = {
      userId: "user-1",
      customerKey: "mc_customer",
      freeBalance: 0,
      paidBalance: 0,
      reviewRequiredAt: null,
      reviewReason: null,
      ...account,
    };
  }

  async getAccount() {
    return this.account;
  }
  async lockAccount() {
    return this.account;
  }
  async findLedgerByEventKey(eventKey: string) {
    return this.ledger.find((row) => row.eventKey === eventKey) ?? null;
  }
  async insertLedger(
    row: Omit<MuseunCoinLedgerRecord, "id">,
  ): Promise<number> {
    const id = this.ledger.length + 1;
    this.ledger.push({ id, ...row });
    return id;
  }
  async updateAccount(next: MuseunCoinAccountState) {
    this.account = next;
  }
  async listPaidLots() {
    return [...this.lots].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.orderId.localeCompare(b.orderId),
    );
  }
  async getPaidLot(orderId: string) {
    return this.lots.find((lot) => lot.orderId === orderId) ?? null;
  }
  async insertPaidLot(lot: MuseunCoinPaidLotState) {
    this.lots.push(lot);
  }
  async updatePaidLot(next: MuseunCoinPaidLotState) {
    const index = this.lots.findIndex((lot) => lot.orderId === next.orderId);
    this.lots[index] = next;
  }
  async insertSpendAllocations(
    rows: Array<{ ledgerId: number; lotOrderId: string; coins: number }>,
  ) {
    this.allocations.push(...rows);
  }
  async mirrorLegacyBalance(_userId: string, coins: number) {
    this.mirroredCoins.push(coins);
  }
}

describe("allocateMuseunCoinSpend", () => {
  it("spends free coins before paid lots", () => {
    expect(
      allocateMuseunCoinSpend({
        amount: 1_200,
        freeBalance: 1_000,
        paidBalance: 500,
        lots: [
          {
            orderId: "old",
            userId: "user-1",
            grantedCoins: 500,
            availableCoins: 500,
            heldCoins: 0,
            createdAt: new Date("2026-09-01"),
          },
        ],
      }),
    ).toEqual({
      ok: true,
      freeSpent: 1_000,
      paidSpent: 200,
      freeBalance: 0,
      paidBalance: 300,
      allocations: [{ orderId: "old", coins: 200, availableCoins: 300 }],
    });
  });

  it("allocates paid coins oldest-first and ignores held coins", () => {
    const result = allocateMuseunCoinSpend({
      amount: 500,
      freeBalance: 0,
      paidBalance: 700,
      lots: [
        {
          orderId: "new",
          userId: "user-1",
          grantedCoins: 400,
          availableCoins: 400,
          heldCoins: 0,
          createdAt: new Date("2026-09-03"),
        },
        {
          orderId: "old",
          userId: "user-1",
          grantedCoins: 400,
          availableCoins: 300,
          heldCoins: 100,
          createdAt: new Date("2026-09-01"),
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      paidSpent: 500,
      paidBalance: 200,
      allocations: [
        { orderId: "old", coins: 300, availableCoins: 0 },
        { orderId: "new", coins: 200, availableCoins: 200 },
      ],
    });
  });

  it("rejects spending above the non-held balance", () => {
    expect(
      allocateMuseunCoinSpend({
        amount: 101,
        freeBalance: 0,
        paidBalance: 200,
        lots: [
          {
            orderId: "held",
            userId: "user-1",
            grantedCoins: 200,
            availableCoins: 100,
            heldCoins: 100,
            createdAt: new Date("2026-09-01"),
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "insufficient_coins",
      coins: 200,
      spendableCoins: 100,
      requiredCoins: 101,
    });
  });
});

describe("Museun Coin account operations", () => {
  it("grants free coins once and mirrors the combined balance", async () => {
    const store = new MemoryStore({ freeBalance: 50, paidBalance: 100 });
    const service = createMuseunCoinAccountOperations(store);

    const first = await service.grantFree({
      userId: "user-1",
      coins: 25,
      eventKey: "reward:1",
      kind: "season_reward",
      sourceId: "inbox-1",
    });
    const replay = await service.grantFree({
      userId: "user-1",
      coins: 25,
      eventKey: "reward:1",
      kind: "season_reward",
      sourceId: "inbox-1",
    });

    expect(first).toMatchObject({ coins: 175, freeCoins: 75, paidCoins: 100 });
    expect(replay).toMatchObject({
      coins: 175,
      freeCoins: 75,
      paidCoins: 100,
      duplicate: true,
    });
    expect(store.ledger).toHaveLength(1);
    expect(store.mirroredCoins).toEqual([175]);
  });

  it("grants a paid lot once", async () => {
    const store = new MemoryStore({ freeBalance: 20 });
    const service = createMuseunCoinAccountOperations(store);

    await service.grantPaid({
      userId: "user-1",
      orderId: "mc_order_1",
      coins: 1_000,
      eventKey: "payment:pay_1",
    });
    await service.grantPaid({
      userId: "user-1",
      orderId: "mc_order_1",
      coins: 1_000,
      eventKey: "payment:pay_1",
    });

    expect(store.account).toMatchObject({ freeBalance: 20, paidBalance: 1_000 });
    expect(store.lots).toHaveLength(1);
    expect(store.lots[0]).toMatchObject({
      orderId: "mc_order_1",
      grantedCoins: 1_000,
      availableCoins: 1_000,
      heldCoins: 0,
    });
  });

  it("spends atomically according to the free-first FIFO plan", async () => {
    const store = new MemoryStore({ freeBalance: 100, paidBalance: 500 });
    store.lots = [
      {
        orderId: "mc_order_1",
        userId: "user-1",
        grantedCoins: 500,
        availableCoins: 500,
        heldCoins: 0,
        createdAt: new Date("2026-09-01"),
      },
    ];
    const service = createMuseunCoinAccountOperations(store);

    const result = await service.spend({
      userId: "user-1",
      coins: 250,
      eventKey: "shop:purchase:1",
      kind: "shop_purchase",
      sourceId: "rename_permit",
    });

    expect(result).toMatchObject({
      ok: true,
      coins: 350,
      freeCoins: 0,
      paidCoins: 350,
    });
    expect(store.lots[0].availableCoins).toBe(350);
    expect(store.allocations).toEqual([
      { ledgerId: 1, lotOrderId: "mc_order_1", coins: 150 },
    ]);
    expect(store.mirroredCoins).toEqual([350]);
  });

  it("holds, releases, and finalizes refundable paid coins", async () => {
    const store = new MemoryStore({ paidBalance: 1_000 });
    store.lots = [
      {
        orderId: "mc_order_1",
        userId: "user-1",
        grantedCoins: 1_000,
        availableCoins: 1_000,
        heldCoins: 0,
        createdAt: new Date("2026-09-01"),
      },
    ];
    const service = createMuseunCoinAccountOperations(store);

    await service.holdRefund({
      userId: "user-1",
      orderId: "mc_order_1",
      coins: 400,
      eventKey: "refund:hold:1",
    });
    expect(store.lots[0]).toMatchObject({ availableCoins: 600, heldCoins: 400 });
    expect(store.account.paidBalance).toBe(1_000);

    await service.releaseRefund({
      userId: "user-1",
      orderId: "mc_order_1",
      coins: 100,
      eventKey: "refund:release:1",
    });
    expect(store.lots[0]).toMatchObject({ availableCoins: 700, heldCoins: 300 });

    await service.finalizeRefund({
      userId: "user-1",
      orderId: "mc_order_1",
      coins: 300,
      eventKey: "refund:complete:1",
    });
    expect(store.lots[0]).toMatchObject({ availableCoins: 700, heldCoins: 0 });
    expect(store.account.paidBalance).toBe(700);
    expect(store.mirroredCoins.at(-1)).toBe(700);
  });
});
