import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createProfilerAggregator } from "./aggregate";
import { installHttpRequestInstrumentation } from "./httpInstrumentation";
import { currentRequestProfile } from "./requestContext";

class FakeServer extends EventEmitter {}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  writableFinished = false;
  socket = { bytesWritten: 100 };
}

describe("installHttpRequestInstrumentation", () => {
  it("요청 컨텍스트에서 수행된 작업을 응답 완료 시 한 번 집계한다", () => {
    const aggregator = createProfilerAggregator({ now: () => 0 });
    const timestamps = [BigInt(0), BigInt(50_000_000)];
    const installed = installHttpRequestInstrumentation(aggregator, {
      serverPrototype: FakeServer.prototype,
      nowNs: () => timestamps.shift() ?? BigInt(50_000_000),
    });
    const installedAgain = installHttpRequestInstrumentation(aggregator, {
      serverPrototype: FakeServer.prototype,
    });
    const server = new FakeServer();
    const response = new FakeResponse();
    let observedFeature: string | undefined;

    server.on("request", () => {
      observedFeature = currentRequestProfile()?.feature;
    });
    server.emit(
      "request",
      { method: "GET", url: "/api/chat?room=private", socket: response.socket },
      response,
    );
    response.statusCode = 503;
    response.socket.bytesWritten = 350;
    response.writableFinished = true;
    response.emit("finish");
    response.emit("close");

    expect(installed).toBe(true);
    expect(installedAgain).toBe(false);
    expect(observedFeature).toBe("chat");
    expect(aggregator.snapshot().current.features.chat).toMatchObject({
      requests: 1,
      errors: 1,
      responseBytes: 250,
      durationMs: { average: 50, max: 50 },
    });
  });

  it("finish 전에 연결이 닫히면 중단 오류로 한 번 기록한다", () => {
    class ClosingServer extends EventEmitter {}
    const aggregator = createProfilerAggregator({ now: () => 0 });
    const timestamps = [BigInt(0), BigInt(10_000_000)];
    installHttpRequestInstrumentation(aggregator, {
      serverPrototype: ClosingServer.prototype,
      nowNs: () => timestamps.shift() ?? BigInt(10_000_000),
    });
    const server = new ClosingServer();
    const response = new FakeResponse();

    server.emit(
      "request",
      { method: "POST", url: "/api/v2/dungeon/hunt", socket: response.socket },
      response,
    );
    response.emit("close");
    response.emit("finish");

    expect(aggregator.snapshot().current.features.combat).toMatchObject({
      requests: 1,
      errors: 1,
    });
  });

  it("원래 request listener가 throw해도 요청을 다시 실행하지 않는다", () => {
    class ThrowingServer extends EventEmitter {}
    const aggregator = createProfilerAggregator({ now: () => 0 });
    installHttpRequestInstrumentation(aggregator, {
      serverPrototype: ThrowingServer.prototype,
    });
    const server = new ThrowingServer();
    const response = new FakeResponse();
    const failure = new Error("handler failure");
    let calls = 0;
    server.on("request", () => {
      calls += 1;
      throw failure;
    });

    expect(() =>
      server.emit(
        "request",
        { method: "GET", url: "/api/chat", socket: response.socket },
        response,
      ),
    ).toThrow(failure);
    expect(calls).toBe(1);
  });
});
