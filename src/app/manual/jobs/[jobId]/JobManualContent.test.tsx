import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { buildJobManualEntry } from "../../jobManualModel";
import { JobManualContent } from "./JobManualContent";

function renderJob(jobId: string): string {
  const entry = buildJobManualEntry(jobId);
  if (!entry) throw new Error(`missing fixture job ${jobId}`);
  return renderToStaticMarkup(<JobManualContent entry={entry} />);
}

describe("JobManualContent", () => {
  it("renders full primordial variants and equipped synergies", () => {
    const html = renderJob("primordialmage");

    expect(html).toContain("선행 필수 직업");
    expect(html).toContain("후행 가능 직업");
    expect(html).toContain("태초회귀");
    expect(html).toContain("개벽·오원소 회귀");
    expect(html).toContain("필요 장착 스킬");
    expect(html).toContain("장착 시너지");
    expect(html).toContain("홍련술");
    expect(html).toContain("오원소 폭주");
  });

  it("links every side of hybrid prerequisites", () => {
    const html = renderJob("templar");

    expect(html).toContain("복합");
    expect(html).toContain('href="/manual/jobs/paladin"');
    expect(html).toContain('href="/manual/jobs/acolyte"');
    expect(html).toContain('href="/manual/jobs/crusader"');
  });

  it("keeps tier seven PvP details visible", () => {
    const html = renderJob("primordialsage");

    expect(html).toContain("7차");
    expect(html).toContain("완전식");
    expect(html).toContain("PvP");
  });

  it("renders lifestyle and root jobs without unlock-state gating", () => {
    const chef = renderJob("legendarychef");
    const adventurer = renderJob("none");

    expect(chef).toContain("생활");
    expect(chef).toContain("요리 Lv 50");
    expect(chef).toContain("비전의 레시피");
    expect(adventurer).toContain("모험가");
    expect(adventurer).toContain("선행 직업 없음");
    expect(adventurer).toContain("강인함");
  });

  it("uses approved opaque surfaces and no locked-card opacity", () => {
    const html = renderJob("primordialmage");

    expect(html).toContain(SURFACE_CARD);
    expect(html).toContain(SURFACE_INSET);
    expect(html).not.toContain("opacity-");
  });
});
