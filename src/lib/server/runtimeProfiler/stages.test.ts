import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestProfile, runWithRequestProfile } from "./requestContext";
import { profileAsyncSequence, profileAsyncStage, profileSyncStage, recordProfileCounter } from "./stages";

const context = () => createRequestProfile({
  feature: "combat", method: "POST", startedAtNs: BigInt(0), socketBytesAtStart: 0,
});
afterEach(() => vi.restoreAllMocks());

describe("request stage profiling", () => {
  it("순차 단계의 시간과 오류를 집계하고 원래 예외를 보존한다", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const profile = context();
    const failure = new Error("save failed");
    await expect(runWithRequestProfile(profile, () =>
      profileAsyncSequence("hunt.prepare", async (enter) => {
        now = 10;
        enter("hunt.battle");
        now = 35;
        recordProfileCounter("hunt.resolvedBattles");
        recordProfileCounter("hunt.turns", 7);
        enter("hunt.rewards");
        now = 40;
        throw failure;
      }),
    )).rejects.toBe(failure);
    expect(profile.stages).toEqual({
      "hunt.prepare": { count: 1, errors: 0, totalMs: 10, maxMs: 10 },
      "hunt.battle": { count: 1, errors: 0, totalMs: 25, maxMs: 25 },
      "hunt.rewards": { count: 1, errors: 1, totalMs: 5, maxMs: 5 },
    });
    expect(profile.counters).toEqual({ "hunt.resolvedBattles": 1, "hunt.turns": 7 });
  });

  it("동시 요청과 같은 단계의 반복 호출을 분리한다", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const a = context(), b = context();
    let resume!: () => void;
    const wait = new Promise<void>((resolve) => { resume = resolve; });
    const running = runWithRequestProfile(a, () => profileAsyncStage("hunt.save", async () => {
      await wait;
      recordProfileCounter("hunt.turns", 3);
      return "saved";
    }));
    now = 5;
    runWithRequestProfile(b, () => {
      expect(profileSyncStage("hunt.battle", () => { now = 9; return 42; })).toBe(42);
      profileSyncStage("hunt.battle", () => { now = 15; });
      recordProfileCounter("hunt.turns", 10);
    });
    resume();
    await expect(running).resolves.toBe("saved");
    expect(a.stages).toEqual({ "hunt.save": { count: 1, errors: 0, totalMs: 15, maxMs: 15 } });
    expect(b.stages).toEqual({ "hunt.battle": { count: 2, errors: 0, totalMs: 10, maxMs: 6 } });
    expect(a.counters).toEqual({ "hunt.turns": 3 });
    expect(b.counters).toEqual({ "hunt.turns": 10 });
  });

  it("문맥 없음, 잘못된 이름/값, 계측 실패는 작업 결과를 바꾸지 않는다", async () => {
    const clock = vi.spyOn(performance, "now").mockImplementation(() => { throw Error("clock"); });
    expect(profileSyncStage("hunt.battle", () => 5)).toBe(5);
    expect(clock).not.toHaveBeenCalled();
    const p = context();
    await runWithRequestProfile(p, async () => {
      expect(profileSyncStage("hunt.battle", () => 7)).toBe(7);
      await expect(profileAsyncStage("hunt.save", async () => 9)).resolves.toBe(9);
      clock.mockReturnValue(0);
      profileSyncStage("private/user-id" as never, () => 1);
      recordProfileCounter("private/user-id" as never, 1);
      recordProfileCounter("hunt.turns", Infinity);
      recordProfileCounter("hunt.turns", -1);
    });
    expect(p.stages).toBeUndefined();
    expect(p.counters).toBeUndefined();
  });

  it("종료 시 시계가 실패해도 원래 작업 예외를 덮어쓰지 않는다", () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockImplementation(() => { throw Error("clock"); });
    const failure = new Error("game failure");
    const p = context();
    runWithRequestProfile(p, () => {
      expect(() => profileSyncStage("hunt.battle", () => { throw failure; })).toThrow(failure);
    });
    expect(p.stages).toBeUndefined();
  });

  it("동기 예외와 조기 반환을 유지하고 종료된 단계를 중복 집계하지 않는다", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const p = context();
    const failure = new Error("battle");
    runWithRequestProfile(p, () => {
      expect(() => profileSyncStage("hunt.battle", () => { now = 5; throw failure; })).toThrow(failure);
    });
    await runWithRequestProfile(p, () => profileAsyncSequence("hunt.prepare", async () => {
      now = 10;
      return { ok: false };
    }));
    expect(p.stages).toEqual({
      "hunt.battle": { count: 1, errors: 1, totalMs: 5, maxMs: 5 },
      "hunt.prepare": { count: 1, errors: 0, totalMs: 5, maxMs: 5 },
    });
  });
});
