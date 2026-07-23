import { describe, expect, it } from "vitest";
import {
  DISCREET_MODE_STORED_VALUE,
  isDiscreetModeStored,
} from "./discreetMode";

describe("discreetMode", () => {
  it("저장값이 on일 때만 은신 모드를 복원한다", () => {
    expect(isDiscreetModeStored(DISCREET_MODE_STORED_VALUE)).toBe(true);
    expect(isDiscreetModeStored(null)).toBe(false);
    expect(isDiscreetModeStored("off")).toBe(false);
    expect(isDiscreetModeStored("true")).toBe(false);
  });
});
