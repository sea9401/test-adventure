import { performance } from "node:perf_hooks";
import { currentRequestProfile } from "./requestContext";
import {
  isProfileCounter,
  isProfileStage,
  type ProfileCounter,
  type ProfileStage,
} from "./stageMetrics";

const noop = () => {};

function beginStage(name: ProfileStage): (failed?: boolean) => void {
  try {
    const profile = currentRequestProfile();
    if (!profile || !isProfileStage(name)) return noop;
    const started = performance.now();
    let ended = false;
    return (failed = false) => {
      if (ended) return;
      ended = true;
      try {
        const duration = Math.max(0, performance.now() - started);
        if (!Number.isFinite(duration)) return;
        const stages = profile.stages ??= {};
        const value = stages[name] ??= { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
        value.count += 1;
        value.errors += Number(failed);
        value.totalMs += duration;
        value.maxMs = Math.max(value.maxMs, duration);
      } catch {
        // 계측 실패는 원래 요청에 전파하지 않는다.
      }
    };
  } catch {
    return noop;
  }
}

export function profileSyncStage<T>(name: ProfileStage, callback: () => T): T {
  const finish = beginStage(name);
  let failed = false;
  try {
    return callback();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    finish(failed);
  }
}

export async function profileAsyncStage<T>(
  name: ProfileStage,
  callback: () => PromiseLike<T>,
): Promise<T> {
  const finish = beginStage(name);
  let failed = false;
  try {
    return await callback();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    finish(failed);
  }
}

// 조기 반환이나 오류가 발생해도 현재 단계는 반드시 종료한다.
export async function profileAsyncSequence<T>(
  initial: ProfileStage,
  callback: (enter: (next: ProfileStage) => void) => Promise<T>,
): Promise<T> {
  let finish = beginStage(initial);
  let closed = false;
  const enter = (next: ProfileStage) => {
    if (closed) return;
    finish();
    finish = beginStage(next);
  };
  let failed = false;
  try {
    return await callback(enter);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    closed = true;
    finish(failed);
  }
}

export function recordProfileCounter(name: ProfileCounter, amount = 1): void {
  try {
    const profile = currentRequestProfile();
    if (!profile || !isProfileCounter(name) || !Number.isFinite(amount) || amount < 0) return;
    const counters = profile.counters ??= {};
    counters[name] = (counters[name] ?? 0) + Math.floor(amount);
  } catch {
    // 계측 실패는 원래 요청에 전파하지 않는다.
  }
}
