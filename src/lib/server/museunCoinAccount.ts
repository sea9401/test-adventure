import "server-only";

import { and, asc, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  MUSEUN_COIN_WALLET_KEY,
  parseMuseunCoinBalance,
} from "@/adventure/data/v2/museunCashItems";
import {
  museunCoinAccounts,
  museunCoinLedger,
  museunCoinPaidLots,
  museunCoinSpendAllocations,
  users,
} from "@/db/schema";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "./savesKv";

export type MuseunCoinBalance = {
  freeCoins: number;
  paidCoins: number;
  coins: number;
};

export type MuseunCoinAccountState = {
  userId: string;
  customerKey: string;
  freeBalance: number;
  paidBalance: number;
  reviewRequiredAt: Date | null;
  reviewReason: string | null;
};

export type MuseunCoinPaidLotState = {
  orderId: string;
  userId: string;
  grantedCoins: number;
  availableCoins: number;
  heldCoins: number;
  createdAt: Date;
};

export type MuseunCoinLedgerRecord = {
  id: number;
  eventKey: string;
  userId: string;
  kind: string;
  sourceId: string | null;
  freeDelta: number;
  paidDelta: number;
  freeBalanceAfter: number;
  paidBalanceAfter: number;
  detail: Record<string, unknown> | null;
  createdAt: Date;
};

export type MuseunCoinAccountStore = {
  getAccount(userId: string): Promise<MuseunCoinAccountState | null>;
  lockAccount(userId: string): Promise<MuseunCoinAccountState>;
  findLedgerByEventKey(eventKey: string): Promise<MuseunCoinLedgerRecord | null>;
  insertLedger(row: Omit<MuseunCoinLedgerRecord, "id">): Promise<number>;
  updateAccount(next: MuseunCoinAccountState): Promise<void>;
  listPaidLots(userId: string): Promise<MuseunCoinPaidLotState[]>;
  getPaidLot(orderId: string): Promise<MuseunCoinPaidLotState | null>;
  insertPaidLot(lot: MuseunCoinPaidLotState): Promise<void>;
  updatePaidLot(next: MuseunCoinPaidLotState): Promise<void>;
  getLedgerById(id: number): Promise<MuseunCoinLedgerRecord | null>;
  insertSpendAllocations(
    rows: Array<{ ledgerId: number; lotOrderId: string; coins: number }>,
  ): Promise<void>;
  /** 한 지출이 로트에서 빠져나간 순서(FIFO)대로 돌려준다. */
  listSpendAllocations(
    ledgerId: number,
  ): Promise<Array<{ lotOrderId: string; coins: number }>>;
  mirrorLegacyBalance(userId: string, coins: number): Promise<void>;
};

type SpendAllocation = {
  orderId: string;
  coins: number;
  availableCoins: number;
};

export type MuseunCoinSpendPlan =
  | {
      ok: true;
      freeSpent: number;
      paidSpent: number;
      freeBalance: number;
      paidBalance: number;
      allocations: SpendAllocation[];
    }
  | {
      ok: false;
      error: "insufficient_coins";
      coins: number;
      spendableCoins: number;
      requiredCoins: number;
    };

function requirePositiveCoins(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("invalid_coin_amount");
  }
}

function toBalance(account: MuseunCoinAccountState): MuseunCoinBalance {
  return {
    freeCoins: account.freeBalance,
    paidCoins: account.paidBalance,
    coins: account.freeBalance + account.paidBalance,
  };
}

export function allocateMuseunCoinSpend(input: {
  amount: number;
  freeBalance: number;
  paidBalance: number;
  lots: MuseunCoinPaidLotState[];
}): MuseunCoinSpendPlan {
  requirePositiveCoins(input.amount);
  const orderedLots = [...input.lots].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.orderId.localeCompare(b.orderId),
  );
  const paidAvailable = orderedLots.reduce(
    (sum, lot) => sum + lot.availableCoins,
    0,
  );
  const spendableCoins = input.freeBalance + paidAvailable;
  const coins = input.freeBalance + input.paidBalance;
  if (input.amount > spendableCoins) {
    return {
      ok: false,
      error: "insufficient_coins",
      coins,
      spendableCoins,
      requiredCoins: input.amount,
    };
  }

  const freeSpent = Math.min(input.freeBalance, input.amount);
  let paidRemaining = input.amount - freeSpent;
  const allocations: SpendAllocation[] = [];
  for (const lot of orderedLots) {
    if (paidRemaining <= 0) break;
    const spent = Math.min(lot.availableCoins, paidRemaining);
    if (spent <= 0) continue;
    allocations.push({
      orderId: lot.orderId,
      coins: spent,
      availableCoins: lot.availableCoins - spent,
    });
    paidRemaining -= spent;
  }
  const paidSpent = input.amount - freeSpent;
  return {
    ok: true,
    freeSpent,
    paidSpent,
    freeBalance: input.freeBalance - freeSpent,
    paidBalance: input.paidBalance - paidSpent,
    allocations,
  };
}

function ledgerRow(input: {
  eventKey: string;
  userId: string;
  kind: string;
  sourceId?: string | null;
  freeDelta: number;
  paidDelta: number;
  account: MuseunCoinAccountState;
  detail?: Record<string, unknown> | null;
}): Omit<MuseunCoinLedgerRecord, "id"> {
  return {
    eventKey: input.eventKey,
    userId: input.userId,
    kind: input.kind,
    sourceId: input.sourceId ?? null,
    freeDelta: input.freeDelta,
    paidDelta: input.paidDelta,
    freeBalanceAfter: input.account.freeBalance,
    paidBalanceAfter: input.account.paidBalance,
    detail: input.detail ?? null,
    createdAt: new Date(),
  };
}

export function createMuseunCoinAccountOperations(store: MuseunCoinAccountStore) {
  async function duplicateBalance(
    account: MuseunCoinAccountState,
    eventKey: string,
  ) {
    const existing = await store.findLedgerByEventKey(eventKey);
    return existing ? { ...toBalance(account), duplicate: true as const } : null;
  }

  return {
    async getBalance(userId: string): Promise<MuseunCoinBalance> {
      const account = await store.getAccount(userId);
      return account
        ? toBalance(account)
        : { freeCoins: 0, paidCoins: 0, coins: 0 };
    },

    async grantFree(input: {
      userId: string;
      coins: number;
      eventKey: string;
      kind: string;
      sourceId?: string | null;
      detail?: Record<string, unknown> | null;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return duplicate;
      const next = {
        ...account,
        freeBalance: account.freeBalance + input.coins,
      };
      await store.insertLedger(
        ledgerRow({
          ...input,
          freeDelta: input.coins,
          paidDelta: 0,
          account: next,
        }),
      );
      await store.updateAccount(next);
      await store.mirrorLegacyBalance(input.userId, toBalance(next).coins);
      return { ...toBalance(next), duplicate: false as const };
    },

    async grantPaid(input: {
      userId: string;
      orderId: string;
      coins: number;
      eventKey: string;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return duplicate;
      if (await store.getPaidLot(input.orderId)) throw new Error("paid_lot_exists");
      const next = {
        ...account,
        paidBalance: account.paidBalance + input.coins,
      };
      await store.insertPaidLot({
        orderId: input.orderId,
        userId: input.userId,
        grantedCoins: input.coins,
        availableCoins: input.coins,
        heldCoins: 0,
        createdAt: new Date(),
      });
      await store.insertLedger(
        ledgerRow({
          eventKey: input.eventKey,
          userId: input.userId,
          kind: "payment_credit",
          sourceId: input.orderId,
          freeDelta: 0,
          paidDelta: input.coins,
          account: next,
        }),
      );
      await store.updateAccount(next);
      await store.mirrorLegacyBalance(input.userId, toBalance(next).coins);
      return { ...toBalance(next), duplicate: false as const };
    },

    async spend(input: {
      userId: string;
      coins: number;
      eventKey: string;
      kind: string;
      sourceId?: string | null;
      detail?: Record<string, unknown> | null;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return { ok: true as const, ...duplicate };
      const lots = await store.listPaidLots(input.userId);
      const plan = allocateMuseunCoinSpend({
        amount: input.coins,
        freeBalance: account.freeBalance,
        paidBalance: account.paidBalance,
        lots,
      });
      if (!plan.ok) return plan;
      const next = {
        ...account,
        freeBalance: plan.freeBalance,
        paidBalance: plan.paidBalance,
      };
      const ledgerId = await store.insertLedger(
        ledgerRow({
          ...input,
          freeDelta: -plan.freeSpent,
          paidDelta: -plan.paidSpent,
          account: next,
        }),
      );
      for (const allocation of plan.allocations) {
        const lot = lots.find((candidate) => candidate.orderId === allocation.orderId);
        if (!lot) throw new Error("paid_lot_missing");
        await store.updatePaidLot({
          ...lot,
          availableCoins: allocation.availableCoins,
        });
      }
      await store.insertSpendAllocations(
        plan.allocations.map((allocation) => ({
          ledgerId,
          lotOrderId: allocation.orderId,
          coins: allocation.coins,
        })),
      );
      await store.updateAccount(next);
      await store.mirrorLegacyBalance(input.userId, toBalance(next).coins);
      return {
        ok: true as const,
        ...toBalance(next),
        ledgerId,
        duplicate: false as const,
      };
    },

    // 가격 인하 차액처럼 이미 끝난 지출의 일부를 되돌린다. 유료로 쓴 몫은 빠져나간 로트에
    // 다시 채워 환불 대상 코인으로 남기고, 무료로 쓴 몫만 무료 코인으로 돌려준다. 유료 몫을
    // 먼저 돌려주며, 한 지출은 한 번만 되돌릴 수 있다.
    async restoreSpend(input: {
      userId: string;
      spendLedgerId: number;
      coins: number;
      kind: string;
      sourceId?: string | null;
      detail?: Record<string, unknown> | null;
    }) {
      requirePositiveCoins(input.coins);
      const eventKey = `spend_restore:${input.spendLedgerId}`;
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, eventKey);
      if (duplicate) return { ...duplicate, freeRestored: 0, paidRestored: 0 };
      const spend = await store.getLedgerById(input.spendLedgerId);
      if (
        !spend ||
        spend.userId !== input.userId ||
        spend.freeDelta > 0 ||
        spend.paidDelta > 0
      ) {
        throw new Error("spend_ledger_not_found");
      }
      const paidSpent = -spend.paidDelta;
      if (input.coins > paidSpent - spend.freeDelta) {
        throw new Error("restore_exceeds_spend");
      }
      const paidRestored = Math.min(input.coins, paidSpent);
      const freeRestored = input.coins - paidRestored;

      const restoredLots: Array<{ orderId: string; coins: number }> = [];
      let paidRemaining = paidRestored;
      const allocations = await store.listSpendAllocations(input.spendLedgerId);
      for (const allocation of [...allocations].reverse()) {
        if (paidRemaining <= 0) break;
        const coins = Math.min(allocation.coins, paidRemaining);
        const lot = await store.getPaidLot(allocation.lotOrderId);
        if (!lot || lot.userId !== input.userId) throw new Error("paid_lot_not_found");
        if (lot.availableCoins + lot.heldCoins + coins > lot.grantedCoins) {
          throw new Error("restore_exceeds_lot");
        }
        await store.updatePaidLot({
          ...lot,
          availableCoins: lot.availableCoins + coins,
        });
        restoredLots.push({ orderId: lot.orderId, coins });
        paidRemaining -= coins;
      }
      if (paidRemaining > 0) throw new Error("spend_allocation_missing");

      const next = {
        ...account,
        freeBalance: account.freeBalance + freeRestored,
        paidBalance: account.paidBalance + paidRestored,
      };
      await store.insertLedger(
        ledgerRow({
          eventKey,
          userId: input.userId,
          kind: input.kind,
          sourceId: input.sourceId,
          freeDelta: freeRestored,
          paidDelta: paidRestored,
          account: next,
          detail: {
            ...input.detail,
            spendLedgerId: input.spendLedgerId,
            lots: restoredLots,
          },
        }),
      );
      await store.updateAccount(next);
      await store.mirrorLegacyBalance(input.userId, toBalance(next).coins);
      return {
        ...toBalance(next),
        freeRestored,
        paidRestored,
        duplicate: false as const,
      };
    },

    async holdRefund(input: {
      userId: string;
      orderId: string;
      coins: number;
      eventKey: string;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return duplicate;
      const lot = await store.getPaidLot(input.orderId);
      if (!lot || lot.userId !== input.userId) throw new Error("paid_lot_not_found");
      if (lot.availableCoins < input.coins) throw new Error("refund_exceeds_available");
      await store.updatePaidLot({
        ...lot,
        availableCoins: lot.availableCoins - input.coins,
        heldCoins: lot.heldCoins + input.coins,
      });
      await store.insertLedger(
        ledgerRow({
          eventKey: input.eventKey,
          userId: input.userId,
          kind: "refund_hold",
          sourceId: input.orderId,
          freeDelta: 0,
          paidDelta: 0,
          account,
          detail: { coins: input.coins },
        }),
      );
      return { ...toBalance(account), duplicate: false as const };
    },

    async releaseRefund(input: {
      userId: string;
      orderId: string;
      coins: number;
      eventKey: string;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return duplicate;
      const lot = await store.getPaidLot(input.orderId);
      if (!lot || lot.userId !== input.userId) throw new Error("paid_lot_not_found");
      if (lot.heldCoins < input.coins) throw new Error("refund_exceeds_hold");
      await store.updatePaidLot({
        ...lot,
        availableCoins: lot.availableCoins + input.coins,
        heldCoins: lot.heldCoins - input.coins,
      });
      await store.insertLedger(
        ledgerRow({
          eventKey: input.eventKey,
          userId: input.userId,
          kind: "refund_release",
          sourceId: input.orderId,
          freeDelta: 0,
          paidDelta: 0,
          account,
          detail: { coins: input.coins },
        }),
      );
      return { ...toBalance(account), duplicate: false as const };
    },

    async finalizeRefund(input: {
      userId: string;
      orderId: string;
      coins: number;
      eventKey: string;
    }) {
      requirePositiveCoins(input.coins);
      const account = await store.lockAccount(input.userId);
      const duplicate = await duplicateBalance(account, input.eventKey);
      if (duplicate) return duplicate;
      const lot = await store.getPaidLot(input.orderId);
      if (!lot || lot.userId !== input.userId) throw new Error("paid_lot_not_found");
      if (lot.heldCoins < input.coins || account.paidBalance < input.coins) {
        throw new Error("refund_exceeds_hold");
      }
      const next = { ...account, paidBalance: account.paidBalance - input.coins };
      await store.updatePaidLot({ ...lot, heldCoins: lot.heldCoins - input.coins });
      await store.insertLedger(
        ledgerRow({
          eventKey: input.eventKey,
          userId: input.userId,
          kind: "refund_complete",
          sourceId: input.orderId,
          freeDelta: 0,
          paidDelta: -input.coins,
          account: next,
          detail: { coins: input.coins },
        }),
      );
      await store.updateAccount(next);
      await store.mirrorLegacyBalance(input.userId, toBalance(next).coins);
      return { ...toBalance(next), duplicate: false as const };
    },
  };
}

function accountState(row: typeof museunCoinAccounts.$inferSelect): MuseunCoinAccountState {
  return {
    userId: row.userId,
    customerKey: row.customerKey,
    freeBalance: row.freeBalance,
    paidBalance: row.paidBalance,
    reviewRequiredAt: row.reviewRequiredAt,
    reviewReason: row.reviewReason,
  };
}

function paidLotState(row: typeof museunCoinPaidLots.$inferSelect): MuseunCoinPaidLotState {
  if (!row.userId) throw new Error("paid_lot_owner_deleted");
  return {
    orderId: row.orderId,
    userId: row.userId,
    grantedCoins: row.grantedCoins,
    availableCoins: row.availableCoins,
    heldCoins: row.heldCoins,
    createdAt: row.createdAt,
  };
}

function ledgerRecord(
  row: typeof museunCoinLedger.$inferSelect,
): MuseunCoinLedgerRecord | null {
  if (!row.userId) return null;
  return {
    id: row.id,
    eventKey: row.eventKey,
    userId: row.userId,
    kind: row.kind,
    sourceId: row.sourceId,
    freeDelta: row.freeDelta,
    paidDelta: row.paidDelta,
    freeBalanceAfter: row.freeBalanceAfter,
    paidBalanceAfter: row.paidBalanceAfter,
    detail:
      row.detail && typeof row.detail === "object"
        ? (row.detail as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
  };
}

export function createDrizzleMuseunCoinAccountStore(
  tx: DbTransactionExecutor,
): MuseunCoinAccountStore {
  return {
    async getAccount(userId) {
      const row = (
        await tx
          .select()
          .from(museunCoinAccounts)
          .where(eq(museunCoinAccounts.userId, userId))
          .limit(1)
      )[0];
      return row ? accountState(row) : null;
    },
    async lockAccount(userId) {
      const user = (
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for("update")
          .limit(1)
      )[0];
      if (!user) throw new Error("user_not_found");
      const existing = (
        await tx
          .select()
          .from(museunCoinAccounts)
          .where(eq(museunCoinAccounts.userId, userId))
          .for("update")
          .limit(1)
      )[0];
      if (existing) return accountState(existing);

      const wallet = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        MUSEUN_COIN_WALLET_KEY,
        {},
      );
      const created = (
        await tx
          .insert(museunCoinAccounts)
          .values({
            userId,
            customerKey: `mc_${randomUUID().replaceAll("-", "")}`,
            freeBalance: parseMuseunCoinBalance(wallet),
            paidBalance: 0,
          })
          .returning()
      )[0];
      if (!created) throw new Error("coin_account_create_failed");
      return accountState(created);
    },
    async findLedgerByEventKey(eventKey) {
      const row = (
        await tx
          .select()
          .from(museunCoinLedger)
          .where(eq(museunCoinLedger.eventKey, eventKey))
          .limit(1)
      )[0];
      return row ? ledgerRecord(row) : null;
    },
    async getLedgerById(id) {
      const row = (
        await tx
          .select()
          .from(museunCoinLedger)
          .where(eq(museunCoinLedger.id, id))
          .limit(1)
      )[0];
      return row ? ledgerRecord(row) : null;
    },
    async insertLedger(row) {
      const inserted = (
        await tx
          .insert(museunCoinLedger)
          .values(row)
          .returning({ id: museunCoinLedger.id })
      )[0];
      if (!inserted) throw new Error("coin_ledger_insert_failed");
      return inserted.id;
    },
    async updateAccount(next) {
      await tx
        .update(museunCoinAccounts)
        .set({
          freeBalance: next.freeBalance,
          paidBalance: next.paidBalance,
          reviewRequiredAt: next.reviewRequiredAt,
          reviewReason: next.reviewReason,
          updatedAt: new Date(),
        })
        .where(eq(museunCoinAccounts.userId, next.userId));
    },
    async listPaidLots(userId) {
      const rows = await tx
        .select()
        .from(museunCoinPaidLots)
        .where(
          and(
            eq(museunCoinPaidLots.userId, userId),
            gt(museunCoinPaidLots.availableCoins, 0),
          ),
        )
        .orderBy(asc(museunCoinPaidLots.createdAt), asc(museunCoinPaidLots.orderId))
        .for("update");
      return rows.map(paidLotState);
    },
    async getPaidLot(orderId) {
      const row = (
        await tx
          .select()
          .from(museunCoinPaidLots)
          .where(eq(museunCoinPaidLots.orderId, orderId))
          .for("update")
          .limit(1)
      )[0];
      return row ? paidLotState(row) : null;
    },
    async insertPaidLot(lot) {
      await tx.insert(museunCoinPaidLots).values(lot);
    },
    async updatePaidLot(next) {
      await tx
        .update(museunCoinPaidLots)
        .set({
          availableCoins: next.availableCoins,
          heldCoins: next.heldCoins,
          updatedAt: new Date(),
        })
        .where(eq(museunCoinPaidLots.orderId, next.orderId));
    },
    async insertSpendAllocations(rows) {
      if (rows.length > 0) await tx.insert(museunCoinSpendAllocations).values(rows);
    },
    async listSpendAllocations(ledgerId) {
      return tx
        .select({
          lotOrderId: museunCoinSpendAllocations.lotOrderId,
          coins: museunCoinSpendAllocations.coins,
        })
        .from(museunCoinSpendAllocations)
        .where(eq(museunCoinSpendAllocations.ledgerId, ledgerId))
        .orderBy(asc(museunCoinSpendAllocations.id));
    },
    async mirrorLegacyBalance(userId, coins) {
      const wallet = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        MUSEUN_COIN_WALLET_KEY,
        {},
      );
      await upsertSave(tx, userId, MUSEUN_COIN_WALLET_KEY, {
        ...wallet,
        coins,
      });
    },
  };
}

export async function getMuseunCoinBalance(
  executor: DbExecutor,
  userId: string,
): Promise<MuseunCoinBalance> {
  const account = (
    await executor
      .select({
        freeBalance: museunCoinAccounts.freeBalance,
        paidBalance: museunCoinAccounts.paidBalance,
      })
      .from(museunCoinAccounts)
      .where(eq(museunCoinAccounts.userId, userId))
      .limit(1)
  )[0];
  if (account) {
    return {
      freeCoins: account.freeBalance,
      paidCoins: account.paidBalance,
      coins: account.freeBalance + account.paidBalance,
    };
  }
  const wallet = await readSave<Record<string, unknown>>(
    executor,
    userId,
    MUSEUN_COIN_WALLET_KEY,
    {},
  );
  const coins = parseMuseunCoinBalance(wallet);
  return { freeCoins: coins, paidCoins: 0, coins };
}

export async function lockMuseunCoinAccount(
  tx: DbTransactionExecutor,
  userId: string,
) {
  return createDrizzleMuseunCoinAccountStore(tx).lockAccount(userId);
}

export async function grantFreeMuseunCoins(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["grantFree"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).grantFree(input);
}

export async function grantPaidMuseunCoins(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["grantPaid"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).grantPaid(input);
}

export async function spendMuseunCoins(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["spend"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).spend(input);
}

export async function holdPaidLotForRefund(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["holdRefund"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).holdRefund(input);
}

export async function releasePaidLotHold(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["releaseRefund"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).releaseRefund(input);
}

export async function finalizePaidLotRefund(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["finalizeRefund"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).finalizeRefund(input);
}

export async function restoreMuseunCoinSpend(
  tx: DbTransactionExecutor,
  input: Parameters<
    ReturnType<typeof createMuseunCoinAccountOperations>["restoreSpend"]
  >[0],
) {
  return createMuseunCoinAccountOperations(
    createDrizzleMuseunCoinAccountStore(tx),
  ).restoreSpend(input);
}
