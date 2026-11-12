// 2026-11-12 무슨 코인 상점 가격 인하(월간 모험 지원권 1,000→700, 성장 도약 패키지 1,200→800)의
// 차액 보상. 인하 전 가격으로 산 구매 원장을 찾아 차액을 되돌리고 안내 쪽지를 보낸다.
// DB 접근은 runtime으로 주입한다(scripts/compensate-shop-price-cut.ts 참고).

export const SHOP_PRICE_CUT_ITEMS = [
  {
    itemId: "adventure_support_30d",
    name: "월간 모험 지원권",
    oldUnitPrice: 1_000,
    newUnitPrice: 700,
  },
  {
    itemId: "growth_leap_package",
    name: "성장 도약 패키지",
    oldUnitPrice: 1_200,
    newUnitPrice: 800,
  },
] as const;

export const SHOP_PRICE_CUT_LEDGER_KIND = "shop_price_adjustment";

export type PriceCutPurchase = {
  ledgerId: number;
  userId: string;
  itemId: string;
  spentCoins: number;
  quantity: number;
  compensated: boolean;
};

export type PriceCutGrant = {
  ledgerId: number;
  userId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  coins: number;
};

export type PriceCutSkipReason =
  | "excluded"
  | "already_compensated"
  | "current_price"
  | "unexpected_amount";

export type PriceCutPlan = {
  grants: PriceCutGrant[];
  skipped: Array<PriceCutPurchase & { reason: PriceCutSkipReason }>;
};

export function planPriceCutCompensation(
  purchases: readonly PriceCutPurchase[],
  excludeLedgerIds: ReadonlySet<number> = new Set(),
): PriceCutPlan {
  const plan: PriceCutPlan = { grants: [], skipped: [] };
  for (const purchase of purchases) {
    const item = SHOP_PRICE_CUT_ITEMS.find(
      (candidate) => candidate.itemId === purchase.itemId,
    );
    if (!item) continue;
    const skip = (reason: PriceCutSkipReason) =>
      plan.skipped.push({ ...purchase, reason });
    if (excludeLedgerIds.has(purchase.ledgerId)) skip("excluded");
    else if (purchase.compensated) skip("already_compensated");
    else if (purchase.spentCoins === item.newUnitPrice * purchase.quantity) {
      skip("current_price");
    } else if (purchase.spentCoins !== item.oldUnitPrice * purchase.quantity) {
      skip("unexpected_amount");
    } else {
      plan.grants.push({
        ledgerId: purchase.ledgerId,
        userId: purchase.userId,
        itemId: item.itemId,
        itemName: item.name,
        quantity: purchase.quantity,
        coins: (item.oldUnitPrice - item.newUnitPrice) * purchase.quantity,
      });
    }
  }
  return plan;
}

export function priceCutNoticeText(grants: readonly PriceCutGrant[]): string {
  const byItem = new Map<string, { quantity: number; coins: number }>();
  for (const grant of grants) {
    const current = byItem.get(grant.itemName) ?? { quantity: 0, coins: 0 };
    byItem.set(grant.itemName, {
      quantity: current.quantity + grant.quantity,
      coins: current.coins + grant.coins,
    });
  }
  const lines = [...byItem].map(
    ([name, { quantity, coins }]) =>
      `${name} ${quantity}개: ${coins.toLocaleString("ko-KR")} 무슨 코인`,
  );
  const total = grants.reduce((sum, grant) => sum + grant.coins, 0);
  return [
    "무슨 코인 상점 가격을 내리면서, 인하 전에 구매하신 상품의 차액을 돌려드렸습니다.",
    ...lines,
    `합계 ${total.toLocaleString("ko-KR")} 무슨 코인이 지갑에 들어갔습니다. 따로 수령하실 필요는 없습니다.`,
  ].join("\n");
}

export type PriceCutCliOptions = {
  apply: boolean;
  excludeLedgerIds: Set<number>;
};

export function parsePriceCutCliArgs(args: readonly string[]): PriceCutCliOptions {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  if (apply === dryRun) throw new Error("pass exactly one of --dry-run or --apply");
  const excludeLedgerIds = new Set<number>();
  for (const arg of args) {
    if (arg === "--apply" || arg === "--dry-run") continue;
    const match = /^--exclude-ledger=(\d+)$/.exec(arg);
    if (!match) throw new Error(`unsupported argument: ${arg}`);
    excludeLedgerIds.add(Number(match[1]));
  }
  return { apply, excludeLedgerIds };
}

export type PriceCutCompensationRuntime = {
  listPurchases(itemIds: readonly string[]): Promise<PriceCutPurchase[]>;
  /** 한 이용자의 차액을 한 트랜잭션으로 되돌리고, 새로 되돌린 건이 있으면 안내 쪽지를 넣는다. */
  compensateUser(
    userId: string,
    grants: readonly PriceCutGrant[],
  ): Promise<{ applied: number; freeRestored: number; paidRestored: number }>;
};

export async function executePriceCutCompensationCli(
  args: readonly string[],
  dependencies: {
    loadRuntime(): Promise<PriceCutCompensationRuntime>;
    log(message: string): void;
    error(message: string): void;
  },
): Promise<number> {
  const options = parsePriceCutCliArgs(args);
  const runtime = await dependencies.loadRuntime();
  const purchases = await runtime.listPurchases(
    SHOP_PRICE_CUT_ITEMS.map((item) => item.itemId),
  );
  const plan = planPriceCutCompensation(purchases, options.excludeLedgerIds);

  dependencies.log(
    `${options.apply ? "APPLY" : "DRY RUN"}: purchases=${purchases.length} grants=${plan.grants.length} skipped=${plan.skipped.length}`,
  );
  for (const skipped of plan.skipped) {
    dependencies.log(
      `  skip ledger=${skipped.ledgerId} user=${skipped.userId} item=${skipped.itemId} spent=${skipped.spentCoins} qty=${skipped.quantity} reason=${skipped.reason}`,
    );
  }
  const byUser = new Map<string, PriceCutGrant[]>();
  for (const grant of plan.grants) {
    dependencies.log(
      `  grant ledger=${grant.ledgerId} user=${grant.userId} item=${grant.itemId} qty=${grant.quantity} coins=${grant.coins}`,
    );
    byUser.set(grant.userId, [...(byUser.get(grant.userId) ?? []), grant]);
  }
  const plannedCoins = plan.grants.reduce((sum, grant) => sum + grant.coins, 0);
  if (!options.apply) {
    dependencies.log(
      `No changes made. users=${byUser.size} coins=${plannedCoins}. Re-run with --apply.`,
    );
    return 0;
  }

  let applied = 0;
  let freeRestored = 0;
  let paidRestored = 0;
  let errors = 0;
  for (const [userId, grants] of byUser) {
    try {
      const result = await runtime.compensateUser(userId, grants);
      applied += result.applied;
      freeRestored += result.freeRestored;
      paidRestored += result.paidRestored;
      dependencies.log(
        `  ✓ user=${userId} applied=${result.applied} paid=${result.paidRestored} free=${result.freeRestored}`,
      );
    } catch (error) {
      errors += 1;
      dependencies.error(
        `  ✗ user=${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  dependencies.log(
    `done: users=${byUser.size} applied=${applied} paid=${paidRestored} free=${freeRestored} errors=${errors}`,
  );
  return errors > 0 ? 1 : 0;
}
