import { describe, expect, it } from "vitest";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "./surfaces";

describe("shared surface tokens", () => {
  it("라이트 강조색은 유지하고 다크모드에서는 중립 불투명 표면을 사용한다", () => {
    expect(SURFACE_ACCENT).toContain("bg-amber-50");
    expect(SURFACE_ACCENT).toContain("dark:bg-zinc-800");
    expect(SURFACE_ACCENT).not.toMatch(/dark:bg-amber-/);
  });

  it("화면 스타일이 재질을 덧입힐 수 있게 표면마다 훅 클래스를 단다", () => {
    expect(SURFACE_CARD.split(" ")).toContain("ui-surface-card");
    expect(SURFACE_INSET.split(" ")).toContain("ui-surface-inset");
    expect(SURFACE_ACCENT.split(" ")).toContain("ui-surface-accent");
  });
});
