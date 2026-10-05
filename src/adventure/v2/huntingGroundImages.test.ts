import { describe, expect, it, vi } from "vitest";
import {
  HUNTING_GROUND_IMAGES_HIDDEN_CLASS,
  HUNTING_GROUND_IMAGES_STORAGE_KEY,
  huntingGroundImagesInitScript,
  parseStoredHuntingGroundImagesHidden,
} from "./huntingGroundImages";

function runInitScript(getItem: (key: string) => string | null) {
  const add = vi.fn();
  const localStorage = { getItem: vi.fn(getItem) };
  const document = { documentElement: { classList: { add } } };
  new Function("localStorage", "document", huntingGroundImagesInitScript())(
    localStorage,
    document,
  );
  return { add, localStorage };
}

describe("사냥터 그림 표시 설정", () => {
  it("숨김 저장값일 때만 숨김으로 복원하고 기본은 표시한다", () => {
    expect(parseStoredHuntingGroundImagesHidden("hidden")).toBe(true);
    expect(parseStoredHuntingGroundImagesHidden(null)).toBe(false);
    expect(parseStoredHuntingGroundImagesHidden("shown")).toBe(false);
  });

  it("초기화 스크립트는 숨김 저장값일 때만 루트에 숨김 클래스를 붙인다", () => {
    const hidden = runInitScript(() => "hidden");
    expect(hidden.localStorage.getItem).toHaveBeenCalledWith(
      HUNTING_GROUND_IMAGES_STORAGE_KEY,
    );
    expect(hidden.add).toHaveBeenCalledWith(HUNTING_GROUND_IMAGES_HIDDEN_CLASS);
    expect(runInitScript(() => null).add).not.toHaveBeenCalled();
  });

  it("저장소 접근이 막혀도 예외 없이 그림을 표시한다", () => {
    const blocked = () =>
      runInitScript(() => {
        throw new Error("SecurityError");
      });
    expect(blocked).not.toThrow();
    expect(blocked().add).not.toHaveBeenCalled();
  });
});
