import { describe, expect, it, vi } from "vitest";
import {
  experienceProgressUpdate,
  recoveryChargesUpdate,
  type RecoveryChargesUpdate,
} from "./recoveryChargesSync";

describe("recoveryChargesUpdate", () => {
  it("사냥 후 HP·MP 충전약 잔량을 공용 상태 패치로 만든다", () => {
    expect(recoveryChargesUpdate(8_000, 3_000)).toEqual({
      hpCharges: 8_000,
      mpCharges: 3_000,
    });
  });

  it("0 잔량은 유효한 최신값으로 유지하고 생략된 값은 덮어쓰지 않는다", () => {
    expect(recoveryChargesUpdate(0, undefined)).toEqual({ hpCharges: 0 });
    expect(recoveryChargesUpdate(null, 0)).toEqual({ mpCharges: 0 });
    expect(recoveryChargesUpdate(null, undefined)).toBeNull();
  });

  it("공용 상태가 갱신되어 화면 재진입에도 최신 잔량을 제공한다", () => {
    let sharedCharges: Required<RecoveryChargesUpdate> = {
      hpCharges: 10_000,
      mpCharges: 5_000,
    };
    const applyResourcePatch = vi.fn((update: RecoveryChargesUpdate) => {
      sharedCharges = { ...sharedCharges, ...update };
    });

    const update = recoveryChargesUpdate(8_000, 4_000);
    if (update) applyResourcePatch(update);

    const reenteredPageInitialCharges = { ...sharedCharges };
    expect(applyResourcePatch).toHaveBeenCalledWith({
      hpCharges: 8_000,
      mpCharges: 4_000,
    });
    expect(reenteredPageInitialCharges).toEqual({
      hpCharges: 8_000,
      mpCharges: 4_000,
    });
  });
});

describe("experienceProgressUpdate", () => {
  it("사냥 후 경험치를 공용 상태에 반영해 화면 재진입 초기값을 최신값으로 유지한다", () => {
    let sharedProgress = { exp: 120, expToNext: 1_000 };
    const update = experienceProgressUpdate(460, 1_000);
    if (update) sharedProgress = { ...sharedProgress, ...update };

    expect(sharedProgress).toEqual({ exp: 460, expToNext: 1_000 });
  });
});
