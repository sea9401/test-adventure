import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MasteryTowerStartPicker,
  selectMasteryTowerStartFloor,
} from "./V2MasteryTowerView";

describe("숙련의 탑 시작 위치 선택", () => {
  it("첫 진입은 최근 체크포인트를 기본 선택하고 이후 유효한 선택은 유지한다", () => {
    const options = [
      { floor: 1, checkpointFloor: null },
      { floor: 31, checkpointFloor: 30 },
    ];

    expect(selectMasteryTowerStartFloor(options, null)).toBe(31);
    expect(selectMasteryTowerStartFloor(options, 1)).toBe(1);
    expect(
      selectMasteryTowerStartFloor(
        [{ floor: 1, checkpointFloor: null }],
        31,
      ),
    ).toBe(1);
  });

  it("1층과 최근 체크포인트 중 선택한 시작 위치를 표시한다", () => {
    const html = renderToStaticMarkup(
      <MasteryTowerStartPicker
        options={[
          { floor: 1, checkpointFloor: null },
          { floor: 31, checkpointFloor: 30 },
        ]}
        selectedFloor={31}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("1층부터");
    expect(html).toContain("30층 체크포인트 돌파");
    expect(html).toContain("31층부터 시작");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("bg-zinc-50");
    expect(html).toContain("dark:bg-zinc-950");
  });

  it("체크포인트가 없으면 1층 시작만 표시한다", () => {
    const html = renderToStaticMarkup(
      <MasteryTowerStartPicker
        options={[{ floor: 1, checkpointFloor: null }]}
        selectedFloor={1}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("1층부터");
    expect(html).not.toContain("체크포인트 돌파");
  });
});
