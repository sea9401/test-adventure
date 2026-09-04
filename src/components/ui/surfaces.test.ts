import { describe, expect, it } from "vitest";
import { SURFACE_ACCENT } from "./surfaces";

describe("shared surface tokens", () => {
  it("라이트 강조색은 유지하고 다크모드에서는 중립 불투명 표면을 사용한다", () => {
    expect(SURFACE_ACCENT).toContain("bg-amber-50");
    expect(SURFACE_ACCENT).toContain("dark:bg-zinc-800");
    expect(SURFACE_ACCENT).not.toMatch(/dark:bg-amber-/);
  });
});
