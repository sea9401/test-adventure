import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  museunCoinAccounts,
  museunCoinLedger,
  museunCoinPaidLots,
  museunCoinPaymentOrders,
  museunCoinRefundRequests,
  museunCoinSpendAllocations,
} from "./schema";

describe("Museun Coin payment schema", () => {
  it("exports dedicated account, order, ledger, lot, allocation, and refund tables", () => {
    expect(
      [
        museunCoinAccounts,
        museunCoinPaymentOrders,
        museunCoinLedger,
        museunCoinPaidLots,
        museunCoinSpendAllocations,
        museunCoinRefundRequests,
      ].map(getTableName),
    ).toEqual([
      "museun_coin_accounts",
      "museun_coin_payment_orders",
      "museun_coin_ledger",
      "museun_coin_paid_lots",
      "museun_coin_spend_allocations",
      "museun_coin_refund_requests",
    ]);
  });

  it("stores split balances and review state on each account", () => {
    expect(Object.keys(getTableColumns(museunCoinAccounts))).toEqual([
      "userId",
      "customerKey",
      "freeBalance",
      "paidBalance",
      "reviewRequiredAt",
      "reviewReason",
      "createdAt",
      "updatedAt",
    ]);
    const config = getTableConfig(museunCoinAccounts);
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "museun_coin_accounts_customer_key_unique",
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "museun_coin_accounts_balances_nonnegative",
    );
  });

  it("makes external payment and ledger identifiers unique", () => {
    const orderIndexes = getTableConfig(museunCoinPaymentOrders).indexes.map(
      (index) => [index.config.name, index.config.unique],
    );
    const ledgerIndexes = getTableConfig(museunCoinLedger).indexes.map(
      (index) => [index.config.name, index.config.unique],
    );
    expect(orderIndexes).toContainEqual([
      "museun_coin_payment_orders_payment_key_unique",
      true,
    ]);
    expect(ledgerIndexes).toContainEqual([
      "museun_coin_ledger_event_key_unique",
      true,
    ]);
  });

  it("enforces valid financial states and non-negative lot values", () => {
    expect(
      getTableConfig(museunCoinPaymentOrders).checks.map(
        (constraint) => constraint.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "museun_coin_payment_orders_amounts_positive",
        "museun_coin_payment_orders_status_valid",
      ]),
    );
    expect(
      getTableConfig(museunCoinPaidLots).checks.map(
        (constraint) => constraint.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "museun_coin_paid_lots_values_nonnegative",
        "museun_coin_paid_lots_balance_valid",
      ]),
    );
    expect(
      getTableConfig(museunCoinRefundRequests).checks.map(
        (constraint) => constraint.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "museun_coin_refund_requests_amounts_positive",
        "museun_coin_refund_requests_status_valid",
      ]),
    );
  });
});
