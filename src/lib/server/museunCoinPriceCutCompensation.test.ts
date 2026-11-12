import { describe, expect, it } from "vitest";
import { ADVENTURE_SUPPORT_PASS } from "@/adventure/data/v2/adventureSupport";
import { GROWTH_LEAP_PACKAGE_PRICE } from "@/adventure/data/v2/growthLeap";
import {
  executePriceCutCompensationCli,
  parsePriceCutCliArgs,
  planPriceCutCompensation,
  priceCutNoticeText,
  SHOP_PRICE_CUT_ITEMS,
  type PriceCutGrant,
  type PriceCutPurchase,
} from "./museunCoinPriceCutCompensation";

function purchase(overrides: Partial<PriceCutPurchase>): PriceCutPurchase {
  return {
    ledgerId: 1,
    userId: "user-1",
    itemId: "adventure_support_30d",
    spentCoins: 1_000,
    quantity: 1,
    compensated: false,
    ...overrides,
  };
}

describe("무슨 코인 상점 가격 인하 차액 보상", () => {
  it("인하 뒤 가격은 현재 상점 가격과 같다", () => {
    expect(SHOP_PRICE_CUT_ITEMS.map((item) => item.newUnitPrice)).toEqual([
      ADVENTURE_SUPPORT_PASS.coinPrice,
      GROWTH_LEAP_PACKAGE_PRICE,
    ]);
  });

  it("인하 전 가격으로 산 구매에만 수량만큼 차액을 잡는다", () => {
    const plan = planPriceCutCompensation(
      [
        purchase({ ledgerId: 1, spentCoins: 3_000, quantity: 3 }),
        purchase({ ledgerId: 2, itemId: "growth_leap_package", spentCoins: 1_200 }),
        purchase({ ledgerId: 3, spentCoins: 700 }),
        purchase({ ledgerId: 4, compensated: true }),
        purchase({ ledgerId: 5 }),
        purchase({ ledgerId: 6, spentCoins: 900 }),
        purchase({ ledgerId: 7, itemId: "rename_permit", spentCoins: 400 }),
      ],
      new Set([5]),
    );

    expect(plan.grants).toEqual([
      {
        ledgerId: 1,
        userId: "user-1",
        itemId: "adventure_support_30d",
        itemName: "월간 모험 지원권",
        quantity: 3,
        coins: 900,
      },
      {
        ledgerId: 2,
        userId: "user-1",
        itemId: "growth_leap_package",
        itemName: "성장 도약 패키지",
        quantity: 1,
        coins: 400,
      },
    ]);
    expect(plan.skipped.map((row) => [row.ledgerId, row.reason])).toEqual([
      [3, "current_price"],
      [4, "already_compensated"],
      [5, "excluded"],
      [6, "unexpected_amount"],
    ]);
  });

  it("안내 쪽지는 상품별 차액과 합계를 적는다", () => {
    const grants = planPriceCutCompensation([
      purchase({ ledgerId: 1, spentCoins: 2_000, quantity: 2 }),
      purchase({ ledgerId: 2 }),
      purchase({ ledgerId: 3, itemId: "growth_leap_package", spentCoins: 1_200 }),
    ]).grants;

    expect(priceCutNoticeText(grants)).toBe(
      [
        "무슨 코인 상점 가격을 내리면서, 인하 전에 구매하신 상품의 차액을 돌려드렸습니다.",
        "월간 모험 지원권 3개: 900 무슨 코인",
        "성장 도약 패키지 1개: 400 무슨 코인",
        "합계 1,300 무슨 코인이 지갑에 들어갔습니다. 따로 수령하실 필요는 없습니다.",
      ].join("\n"),
    );
  });

  it("실행 방식을 하나만 받고 제외할 원장 번호를 읽는다", () => {
    expect(() => parsePriceCutCliArgs([])).toThrow();
    expect(() => parsePriceCutCliArgs(["--apply", "--dry-run"])).toThrow();
    expect(() => parsePriceCutCliArgs(["--apply", "--user=1"])).toThrow();
    expect(
      parsePriceCutCliArgs(["--dry-run", "--exclude-ledger=12", "--exclude-ledger=34"]),
    ).toEqual({ apply: false, excludeLedgerIds: new Set([12, 34]) });
  });

  function harness(purchases: PriceCutPurchase[]) {
    const calls: Array<{ userId: string; grants: readonly PriceCutGrant[] }> = [];
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      calls,
      logs,
      errors,
      dependencies: {
        async loadRuntime() {
          return {
            async listPurchases() {
              return purchases;
            },
            async compensateUser(userId: string, grants: readonly PriceCutGrant[]) {
              calls.push({ userId, grants });
              if (userId === "broken") throw new Error("paid_lot_not_found");
              const coins = grants.reduce((sum, grant) => sum + grant.coins, 0);
              return { applied: grants.length, freeRestored: 0, paidRestored: coins };
            },
          };
        },
        log: (message: string) => logs.push(message),
        error: (message: string) => errors.push(message),
      },
    };
  }

  it("미리 보기는 계획만 출력하고 아무것도 바꾸지 않는다", async () => {
    const run = harness([purchase({ ledgerId: 1 })]);

    const exitCode = await executePriceCutCompensationCli(
      ["--dry-run"],
      run.dependencies,
    );

    expect(exitCode).toBe(0);
    expect(run.calls).toEqual([]);
    expect(run.logs.at(-1)).toContain("users=1 coins=300");
  });

  it("적용은 이용자별로 한 번씩 보상하고 실패한 이용자가 있으면 오류로 끝낸다", async () => {
    const run = harness([
      purchase({ ledgerId: 1 }),
      purchase({ ledgerId: 2, itemId: "growth_leap_package", spentCoins: 1_200 }),
      purchase({ ledgerId: 3, userId: "broken" }),
      purchase({ ledgerId: 4, userId: "user-2" }),
      purchase({ ledgerId: 5, userId: "user-3" }),
    ]);

    const exitCode = await executePriceCutCompensationCli(
      ["--apply", "--exclude-ledger=5"],
      run.dependencies,
    );

    expect(exitCode).toBe(1);
    expect(run.calls.map((call) => [call.userId, call.grants.length])).toEqual([
      ["user-1", 2],
      ["broken", 1],
      ["user-2", 1],
    ]);
    expect(run.errors).toEqual(["  ✗ user=broken: paid_lot_not_found"]);
    expect(run.logs.at(-1)).toBe(
      "done: users=3 applied=3 paid=1000 free=0 errors=1",
    );
  });
});
