import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackingThreatMeter } from "./TrackingThreatMeter";

describe("TrackingThreatMeter", () => {
  it.each([
    [24, "분석 중"],
    [70, "추적 섬멸 임박"],
    [100, "추적 섬멸 준비"],
  ])("위협 %i에서 %s 상태를 표시한다", (value, label) => {
    const html = renderToStaticMarkup(
      <TrackingThreatMeter value={value} max={100} />,
    );

    expect(html).toContain("추적 위협");
    expect(html).toContain(`${value} / 100`);
    expect(html).toContain(label);
    expect(html).toContain(`aria-valuenow=\"${value}\"`);
  });

  it("추적 메커니즘이 없는 보스에는 아무것도 그리지 않는다", () => {
    expect(
      renderToStaticMarkup(<TrackingThreatMeter value={0} max={0} />),
    ).toBe("");
  });
});
