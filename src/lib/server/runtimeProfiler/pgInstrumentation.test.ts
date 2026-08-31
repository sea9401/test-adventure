import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createRequestProfile,
  runWithRequestProfile,
} from "./requestContext";
import {
  instrumentPgPool,
  readInstrumentedPoolMetrics,
} from "./pgInstrumentation";

class FakePool extends EventEmitter {
  totalCount = 4;
  idleCount = 2;
  waitingCount = 1;
}

function context() {
  return createRequestProfile({
    feature: "combat",
    method: "POST",
    startedAtNs: BigInt(0),
    socketBytesAtStart: 0,
  });
}

describe("instrumentPgPool", () => {
  it("Promise 쿼리 성공 시간을 현재 요청에 한 번 귀속한다", async () => {
    const pool = new FakePool();
    const client = { query: async () => ({ rows: [{ value: 1 }] }) };
    const timestamps = [BigInt(0), BigInt(20_000_000)];
    instrumentPgPool(pool, {
      nowNs: () => timestamps.shift() ?? BigInt(20_000_000),
    });
    pool.emit("connect", client);
    const request = context();

    await runWithRequestProfile(request, () => client.query());

    expect(request.database).toMatchObject({
      queryCount: 1,
      errorCount: 0,
      totalDurationMs: 20,
      maxDurationMs: 20,
    });
    expect(request.database.durationBucketCounts).toEqual([
      0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("callback 쿼리 실패를 기록하면서 callback 계약을 보존한다", async () => {
    const pool = new FakePool();
    const failure = new Error("query failed");
    const client = {
      query(_text: string, callback: (error: Error) => void) {
        callback(failure);
      },
    };
    const timestamps = [BigInt(0), BigInt(30_000_000)];
    instrumentPgPool(pool, {
      nowNs: () => timestamps.shift() ?? BigInt(30_000_000),
    });
    pool.emit("connect", client);
    const request = context();

    const callbackError = await new Promise<Error | null>((resolve) => {
      runWithRequestProfile(request, () => {
        client.query("select 1", (error) => resolve(error));
      });
    });

    expect(callbackError).toBe(failure);
    expect(request.database).toMatchObject({
      queryCount: 1,
      errorCount: 1,
      totalDurationMs: 30,
    });
  });

  it("Query 이벤트가 여러 번 와도 완료를 한 번만 기록한다", () => {
    const pool = new FakePool();
    const query = new EventEmitter();
    const client = { query: () => query };
    const timestamps = [BigInt(0), BigInt(40_000_000), BigInt(90_000_000)];
    instrumentPgPool(pool, {
      nowNs: () => timestamps.shift() ?? BigInt(90_000_000),
    });
    pool.emit("connect", client);
    const request = context();

    runWithRequestProfile(request, () => client.query());
    query.emit("end");
    query.emit("error", new Error("late event"));

    expect(request.database).toMatchObject({
      queryCount: 1,
      errorCount: 0,
      totalDurationMs: 40,
    });
  });

  it("동기 throw를 기록하고 같은 오류를 다시 던진다", () => {
    const pool = new FakePool();
    const failure = new Error("sync failure");
    const client = {
      query() {
        throw failure;
      },
    };
    const timestamps = [BigInt(0), BigInt(15_000_000)];
    instrumentPgPool(pool, {
      nowNs: () => timestamps.shift() ?? BigInt(15_000_000),
    });
    pool.emit("connect", client);
    const request = context();

    expect(() =>
      runWithRequestProfile(request, () => client.query()),
    ).toThrow(failure);
    expect(request.database).toMatchObject({
      queryCount: 1,
      errorCount: 1,
      totalDurationMs: 15,
    });
  });

  it("계측한 풀의 현재 포화 수치를 읽는다", () => {
    const pool = new FakePool();
    instrumentPgPool(pool);

    expect(readInstrumentedPoolMetrics()).toEqual({
      total: 4,
      idle: 2,
      waiting: 1,
    });
  });

  it("Pool 후크 설치 실패를 DB 생성 경로로 전파하지 않는다", () => {
    const failure = new Error("listener rejected");
    const onError = vi.fn();
    const pool = {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      on() {
        throw failure;
      },
    };

    expect(() => instrumentPgPool(pool, { onError })).not.toThrow();
    expect(instrumentPgPool(pool, { onError })).toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
