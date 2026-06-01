import { describe, it, expect } from "vitest";
import { computeSeasonPayouts, type PayoutRecord } from "./fishingPayouts";
import { FISH_TIERS } from "@/adventure/data/v2/fish";

function rec(fishId: string, userId: string, size: number): PayoutRecord {
  return { fishId, userId, size };
}

describe("computeSeasonPayouts", () => {
  it("종별 사이즈 내림차순으로 순위 코인 지급(흔함 25/15/10)", () => {
    const c = FISH_TIERS.common.recordCoins;
    const payouts = computeSeasonPayouts([
      rec("crucian_carp", "b", 30),
      rec("crucian_carp", "a", 40),
      rec("crucian_carp", "c", 20),
    ]);
    expect(payouts.get("a")).toBe(c.rank1); // 1위
    expect(payouts.get("b")).toBe(c.rank2); // 2위
    expect(payouts.get("c")).toBe(c.rank3); // 3위
  });

  it("top-10 밖은 코인 0", () => {
    const records: PayoutRecord[] = [];
    for (let i = 0; i < 13; i += 1) records.push(rec("trout", `u${i}`, 100 - i));
    const payouts = computeSeasonPayouts(records);
    // 11~13위(u10,u11,u12)는 없음.
    expect(payouts.has("u10")).toBe(false);
    expect(payouts.has("u9")).toBe(true); // 10위 = 4~10등 코인
    expect(payouts.get("u9")).toBe(FISH_TIERS.rare.recordCoins.rank4to10);
  });

  it("여러 종 석권 시 누적", () => {
    const cc = FISH_TIERS.common.recordCoins.rank1;
    const ec = FISH_TIERS.epic.recordCoins.rank1;
    const payouts = computeSeasonPayouts([
      rec("crucian_carp", "ace", 40),
      rec("marlin", "ace", 400),
    ]);
    expect(payouts.get("ace")).toBe(cc + ec);
  });

  it("알 수 없는 어종 id 는 무시", () => {
    const payouts = computeSeasonPayouts([rec("not_a_fish", "x", 999)]);
    expect(payouts.size).toBe(0);
  });

  it("동률은 표준 경쟁 순위 — 같은 사이즈는 같은 순위로 동등 시상", () => {
    const c = FISH_TIERS.common.recordCoins;
    const payouts = computeSeasonPayouts([
      rec("goby", "a", 25),
      rec("goby", "b", 25), // a 와 동률 1위
      rec("goby", "c", 10),
    ]);
    // a, b 둘 다 1위 코인. c 는 3위(2위 건너뜀).
    expect(payouts.get("a")).toBe(c.rank1);
    expect(payouts.get("b")).toBe(c.rank1);
    expect(payouts.get("c")).toBe(c.rank3);
  });

  it("입력이 뒤섞여 있어도 정렬 후 순위 부여", () => {
    const c = FISH_TIERS.common.recordCoins;
    const payouts = computeSeasonPayouts([
      rec("goby", "small", 5),
      rec("goby", "big", 25),
      rec("goby", "mid", 15),
    ]);
    expect(payouts.get("big")).toBe(c.rank1);
    expect(payouts.get("mid")).toBe(c.rank2);
    expect(payouts.get("small")).toBe(c.rank3);
  });
});
