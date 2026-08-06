import { describe, expect, it } from "vitest";
import {
  BACKGROUND_HIDDEN_MODE_STORED_VALUE,
  DISCREET_MODE_STORED_VALUE,
  TERMINAL_MODE_STORED_VALUE,
  parseStoredDisplayMode,
  storedValueForDisplayMode,
} from "./discreetMode";

describe("displayMode", () => {
  it("네 가지 화면 모드의 저장값을 복원한다", () => {
    expect(parseStoredDisplayMode(TERMINAL_MODE_STORED_VALUE)).toBe(
      "terminal",
    );
    expect(parseStoredDisplayMode(DISCREET_MODE_STORED_VALUE)).toBe(
      "discreet",
    );
    expect(parseStoredDisplayMode(BACKGROUND_HIDDEN_MODE_STORED_VALUE)).toBe(
      "background-hidden",
    );
    expect(parseStoredDisplayMode(null)).toBe("default");
  });

  it("알 수 없는 예전 저장값은 기본 모드로 처리한다", () => {
    expect(parseStoredDisplayMode("off")).toBe("default");
    expect(parseStoredDisplayMode("true")).toBe("default");
  });

  it("기본 모드는 저장값을 제거하고 나머지 모드는 고유 값을 저장한다", () => {
    expect(storedValueForDisplayMode("default")).toBeNull();
    expect(storedValueForDisplayMode("background-hidden")).toBe(
      BACKGROUND_HIDDEN_MODE_STORED_VALUE,
    );
    expect(storedValueForDisplayMode("discreet")).toBe(
      DISCREET_MODE_STORED_VALUE,
    );
    expect(storedValueForDisplayMode("terminal")).toBe(
      TERMINAL_MODE_STORED_VALUE,
    );
  });
});
