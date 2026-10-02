import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_STYLE,
  GILDED_STYLE_CLASS,
  UI_STYLE_STORAGE_KEY,
  parseStoredUiStyle,
  uiStyleInitScript,
} from "./uiStyle";

function runInitScript(getItem: (key: string) => string | null) {
  const add = vi.fn();
  const localStorage = { getItem: vi.fn(getItem) };
  const document = { documentElement: { classList: { add } } };
  new Function("localStorage", "document", uiStyleInitScript())(
    localStorage,
    document,
  );
  return { add, localStorage };
}

describe("uiStyle", () => {
  it("저장된 두 스타일 값을 그대로 복원한다", () => {
    expect(parseStoredUiStyle("gilded")).toBe("gilded");
    expect(parseStoredUiStyle("classic")).toBe("classic");
  });

  it("저장값이 없거나 알 수 없으면 기본 스타일인 클래식을 쓴다", () => {
    expect(DEFAULT_UI_STYLE).toBe("classic");
    expect(parseStoredUiStyle(null)).toBe("classic");
    expect(parseStoredUiStyle("true")).toBe("classic");
    expect(parseStoredUiStyle("")).toBe("classic");
  });

  it("초기화 스크립트는 금빛 저장값일 때만 루트에 금빛 클래스를 붙인다", () => {
    const gilded = runInitScript(() => "gilded");
    expect(gilded.localStorage.getItem).toHaveBeenCalledWith(
      UI_STYLE_STORAGE_KEY,
    );
    expect(gilded.add).toHaveBeenCalledWith(GILDED_STYLE_CLASS);
    expect(GILDED_STYLE_CLASS).toBe("ui-skin-gilded");
    expect(UI_STYLE_STORAGE_KEY).toBe("ui-style.v1");

    expect(runInitScript(() => null).add).not.toHaveBeenCalled();
    expect(runInitScript(() => "classic").add).not.toHaveBeenCalled();
    expect(runInitScript(() => "true").add).not.toHaveBeenCalled();
  });

  it("저장소 접근이 막혀도 예외 없이 클래식으로 남는다", () => {
    const blocked = () =>
      runInitScript(() => {
        throw new Error("SecurityError");
      });
    expect(blocked).not.toThrow();
    expect(blocked().add).not.toHaveBeenCalled();
  });
});
