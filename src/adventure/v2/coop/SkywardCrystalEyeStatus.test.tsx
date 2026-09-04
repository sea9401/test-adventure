import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkywardCrystalEyeStatus } from "./SkywardCrystalEyeStatus";

describe("SkywardCrystalEyeStatus", () => {
  it("남은 조준·붕괴·예상 위력·핵 노출·직전 포격을 표시한다", () => {
    const html = renderToStaticMarkup(
      <SkywardCrystalEyeStatus status={{
        crystalEyeAimTicksRemaining: 640,
        crystalEyeDisruptionStacks: 17,
        crystalEyeProjectedPowerPct: 80,
        crystalEyeBasePowerPct: 390,
        crystalEyeCoreExposed: true,
        crystalEyeCoreExposureTicksRemaining: 180,
        crystalEyeArtilleryCount: 2,
        crystalEyeLastArtilleryStacks: 12,
        crystalEyeLastArtilleryPowerPct: 70,
        crystalEyeLastArtilleryDamage: 1234,
      }} />,
    );

    expect(html).toContain("천공 포격까지 640틱");
    expect(html).toContain("조준 붕괴 17 / 40");
    expect(html).toContain("현재 예상 포격 위력 80% · 기본 계수 390%");
    expect(html).toContain("수정 핵 노출 180틱 · 받는 피해 +25%");
    expect(html).toContain("직전 포격 12중첩 · 위력 70% · 실제 피해 1,234");
    expect(html).toContain('aria-valuenow="17"');
  });

  it("직전 포격이 없을 때 준비 안내만 표시한다", () => {
    const html = renderToStaticMarkup(
      <SkywardCrystalEyeStatus status={{
        crystalEyeAimTicksRemaining: 900,
        crystalEyeDisruptionStacks: 0,
        crystalEyeProjectedPowerPct: 100,
        crystalEyeCoreExposed: false,
        crystalEyeCoreExposureTicksRemaining: 0,
        crystalEyeArtilleryCount: 0,
        crystalEyeLastArtilleryStacks: null,
        crystalEyeLastArtilleryPowerPct: null,
        crystalEyeLastArtilleryDamage: null,
      }} />,
    );

    expect(html).toContain("연타와 치명타로 포격 위력을 낮출 수 있습니다.");
    expect(html).toContain("현재 예상 포격 위력 100% · 기본 계수 330%");
    expect(html).not.toContain("직전 포격");
    expect(html).not.toContain("수정 핵 노출");
  });
});
