import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { DbTransactionExecutor } from "./savesKv";

export function marketplaceMaintenanceFlagExists(): boolean {
  return existsSync("/etc/nginx/msmsge-maintenance.on");
}

/** 반드시 정산 트랜잭션 안에서 호출한다. 점검 시작·해제 스크립트와 잠금을 공유한다. */
export async function lockMarketplaceMaintenance(tx: DbTransactionExecutor): Promise<boolean> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(6180909)`);
  // DB 기록에 실패한 점검도 nginx 플래그로 보호한다.
  if (marketplaceMaintenanceFlagExists()) return true;
  const result = await tx.execute(sql`
    SELECT 1 FROM ops_settings WHERE key = 'maintenance.coop-boss-timer'
  `);
  return result.rows.length > 0;
}
