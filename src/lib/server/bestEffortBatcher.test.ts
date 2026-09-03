import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBestEffortBatcher } from "./bestEffortBatcher";

describe("createBestEffortBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("지연 시간 안에 들어온 항목을 순서대로 한 번에 쓴다", async () => {
    const writeBatch = vi.fn(async (_entries: readonly number[]) => undefined);
    const batcher = createBestEffortBatcher({
      writeBatch,
      maxBatchSize: 100,
      flushDelayMs: 25,
      onError: vi.fn(),
    });

    batcher.enqueue(1);
    batcher.enqueue(2);
    await vi.advanceTimersByTimeAsync(24);
    expect(writeBatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writeBatch).toHaveBeenCalledOnce();
    expect(writeBatch).toHaveBeenCalledWith([1, 2]);
  });

  it("크기 상한에 도달하면 타이머를 기다리지 않고 플러시한다", async () => {
    const writeBatch = vi.fn(async (_entries: readonly string[]) => undefined);
    const batcher = createBestEffortBatcher({
      writeBatch,
      maxBatchSize: 2,
      flushDelayMs: 25,
      onError: vi.fn(),
    });

    batcher.enqueue("first");
    batcher.enqueue("second");
    await batcher.flush();

    expect(writeBatch).toHaveBeenCalledOnce();
    expect(writeBatch).toHaveBeenCalledWith(["first", "second"]);
  });

  it("플러시 중 들어온 항목은 다음 직렬 배치에서 쓴다", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const writeBatch = vi
      .fn<(entries: readonly number[]) => Promise<void>>()
      .mockImplementationOnce(async () => firstWrite)
      .mockResolvedValue(undefined);
    const batcher = createBestEffortBatcher({
      writeBatch,
      maxBatchSize: 2,
      flushDelayMs: 25,
      onError: vi.fn(),
    });

    batcher.enqueue(1);
    batcher.enqueue(2);
    await Promise.resolve();
    batcher.enqueue(3);
    batcher.enqueue(4);

    expect(writeBatch).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await batcher.flush();

    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(writeBatch).toHaveBeenNthCalledWith(1, [1, 2]);
    expect(writeBatch).toHaveBeenNthCalledWith(2, [3, 4]);
  });

  it("실패한 best-effort 배치를 보고하고 다음 배치를 계속 처리한다", async () => {
    const failure = new Error("database unavailable");
    const writeBatch = vi
      .fn<(entries: readonly string[]) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const batcher = createBestEffortBatcher({
      writeBatch,
      maxBatchSize: 1,
      flushDelayMs: 25,
      onError,
    });

    batcher.enqueue("lost-best-effort-entry");
    await batcher.flush();
    expect(onError).toHaveBeenCalledWith(failure, ["lost-best-effort-entry"]);

    batcher.enqueue("next-entry");
    await batcher.flush();
    expect(writeBatch).toHaveBeenNthCalledWith(2, ["next-entry"]);
  });

  it("대기 중인 항목과 처리 중인 항목 수를 스냅샷으로 제공한다", async () => {
    let release: (() => void) | undefined;
    const writeBatch = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const batcher = createBestEffortBatcher({
      writeBatch,
      maxBatchSize: 2,
      flushDelayMs: 25,
      onError: vi.fn(),
    });

    batcher.enqueue(1);
    expect(batcher.snapshot()).toEqual({ pending: 1, inFlight: 0 });
    batcher.enqueue(2);
    await Promise.resolve();
    expect(batcher.snapshot()).toEqual({ pending: 0, inFlight: 2 });
    batcher.enqueue(3);
    expect(batcher.snapshot()).toEqual({ pending: 1, inFlight: 2 });

    release?.();
    await batcher.flush();
    expect(batcher.snapshot()).toEqual({ pending: 0, inFlight: 0 });
  });
});
