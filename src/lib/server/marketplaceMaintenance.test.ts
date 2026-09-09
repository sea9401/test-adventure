import { beforeEach, describe, expect, it, vi } from "vitest";
import { lockMarketplaceMaintenance } from "./marketplaceMaintenance";
import type { DbTransactionExecutor } from "./savesKv";
const mocks = vi.hoisted(() => ({flag: false}));
vi.mock("node:fs", () => ({existsSync: () => mocks.flag}));
beforeEach(() => { mocks.flag = false; });
describe("점검 중 경매 정산 차단", () => {
  it("DB 일시정지 기록이 있으면 정산하지 않는다", async () => {
    const execute = vi.fn().mockResolvedValueOnce({rows: []}).mockResolvedValueOnce({rows: [{value: 1}]});
    expect(await lockMarketplaceMaintenance({execute} as unknown as DbTransactionExecutor)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("DB 기록에 실패했어도 nginx 점검 플래그가 있으면 차단한다", async () => {
    mocks.flag = true;
    const execute = vi.fn().mockResolvedValue({rows: []});
    expect(await lockMarketplaceMaintenance({execute} as unknown as DbTransactionExecutor)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("점검 기록과 플래그가 없을 때만 정산을 허용한다", async () => {
    const execute = vi.fn().mockResolvedValue({rows: []});
    expect(await lockMarketplaceMaintenance({execute} as unknown as DbTransactionExecutor)).toBe(false);
  });
});
