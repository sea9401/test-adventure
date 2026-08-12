import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  isRoadmapDragGesture,
  JobRoadmapDetails,
  ROADMAP_DRAG_THRESHOLD_PX,
  RoadmapScroller,
} from "./JobRoadmapDialog";

describe("RoadmapScroller", () => {
  it("distinguishes a job-card click from an intentional drag", () => {
    expect(isRoadmapDragGesture(100, 100)).toBe(false);
    expect(
      isRoadmapDragGesture(100, 100 + ROADMAP_DRAG_THRESHOLD_PX - 1),
    ).toBe(false);
    expect(
      isRoadmapDragGesture(100, 100 + ROADMAP_DRAG_THRESHOLD_PX),
    ).toBe(true);
    expect(
      isRoadmapDragGesture(100, 100 - ROADMAP_DRAG_THRESHOLD_PX),
    ).toBe(true);
  });

  it("provides visible zoom controls alongside horizontal navigation", () => {
    const html = renderToStaticMarkup(
      <RoadmapScroller>
        <div>전직 계보</div>
      </RoadmapScroller>,
    );

    expect(html).toContain("로드맵 축소, 현재 100%");
    expect(html).toContain("확대/축소 초기화, 현재 100%");
    expect(html).toContain("로드맵 확대, 현재 100%");
    expect(html).toContain("로드맵 왼쪽으로 이동");
    expect(html).toContain("로드맵 오른쪽으로 이동");
    expect(html).toContain("shrine-job-roadmap-canvas");
  });
});

describe("JobRoadmapDetails", () => {
  const squireJob = {
    id: "squire",
    name: "견습 기사",
    tier: 2,
    condition: "견습 병사 숙련도 1,000",
    cumLevel: 320,
    bonus: "힘 +5 · 민첩 +2",
    signatureSkills: [
      {
        id: "v2c_squire_cleave",
        name: "돌격",
        kind: "active" as const,
      },
      {
        id: "v2c_squire_might",
        name: "근력 II",
        kind: "passive" as const,
      },
    ],
  };

  it("offers advancement for an eligible unlocked job", () => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={{ ...squireJob, unlocked: true }}
        currentJobId="warrior"
        goalJobId={null}
        atLevelCap
        currentJobSelectable={false}
        onSetGoal={() => {}}
        onPickJob={() => {}}
      />,
    );

    const button = html.match(
      /<button[^>]*aria-label="견습 기사\(으\)로 전직"[^>]*>/,
    )?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/\sdisabled(?:=|>)/);
    expect(html).toContain(">전직</button>");
  });

  it("offers re-advancement for the current job when its level gate is met", () => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={{ ...squireJob, unlocked: true }}
        currentJobId="squire"
        goalJobId={null}
        atLevelCap
        currentJobSelectable
        onSetGoal={() => {}}
        onPickJob={() => {}}
      />,
    );

    const button = html.match(
      /<button[^>]*aria-label="견습 기사 재전직"[^>]*>/,
    )?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/\sdisabled(?:=|>)/);
    expect(html).toContain(">재전직</button>");
  });

  it.each([
    {
      label: "locked",
      job: { ...squireJob, unlocked: false },
      atLevelCap: true,
      expectedReason: "조건 부족",
    },
    {
      label: "below the advancement level",
      job: { ...squireJob, unlocked: true },
      atLevelCap: false,
      expectedReason: "Lv 100 필요",
    },
  ])(
    "disables advancement when the selected job is $label",
    ({ job, atLevelCap, expectedReason }) => {
      const html = renderToStaticMarkup(
        <JobRoadmapDetails
          job={job}
          currentJobId="warrior"
          goalJobId={null}
          atLevelCap={atLevelCap}
          currentJobSelectable={false}
          onSetGoal={() => {}}
          onPickJob={() => {}}
        />,
      );

      const button = html.match(
        new RegExp(
          `<button[^>]*aria-label="견습 기사 전직: ${expectedReason}"[^>]*>`,
        ),
      )?.[0];
      expect(button).toMatch(/\sdisabled(?:=|>)/);
      expect(html).toContain(`>${expectedReason}</button>`);
    },
  );

  it("shows expandable skill details for an unlocked job", () => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={{
          ...squireJob,
          unlocked: true,
        }}
        currentJobId="warrior"
        goalJobId={null}
        onSetGoal={() => {}}
      />,
    );

    expect(html).toContain("견습 기사");
    expect(html).toContain("2차 직업");
    expect(html).toContain("내 숙련도");
    expect(html).toContain("수행 성장");
    expect(html).toContain("힘 +2");
    expect(html).toContain("직업 보너스");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("돌격");
    expect(html).toContain("액티브");
    expect(html).toContain("말을 몰듯 단숨에 파고들어 베어낸다.");
    expect(html).toContain("근력 II");
    expect(html).toContain("패시브");
    expect(html).toContain("거듭된 단련. 힘이 비례해 오른다.");
  });

  it.each([
    {
      label: "a previously visited job",
      job: { ...squireJob, unlocked: false, visited: true },
      currentJobId: "warrior",
    },
    {
      label: "the current job",
      job: { ...squireJob, unlocked: false, visited: false },
      currentJobId: "squire",
    },
  ])("shows skill details for $label", ({ job, currentJobId }) => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={job}
        currentJobId={currentJobId}
        goalJobId={null}
        onSetGoal={() => {}}
      />,
    );

    expect(html).toContain("돌격");
    expect(html).toContain("말을 몰듯 단숨에 파고들어 베어낸다.");
  });

  it("hides skill names and effects for a locked, unvisited job", () => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={{ ...squireJob, unlocked: false, visited: false }}
        currentJobId="warrior"
        goalJobId={null}
        onSetGoal={() => {}}
      />,
    );

    expect(html).toContain("직업을 해금하면 스킬 정보를 확인할 수 있습니다.");
    expect(html).not.toContain("돌격");
    expect(html).not.toContain("근력 II");
    expect(html).not.toContain("말을 몰듯 단숨에 파고들어 베어낸다.");
  });

  it("keeps unrevealed unlock conditions hidden in the preview", () => {
    const html = renderToStaticMarkup(
      <JobRoadmapDetails
        job={{
          id: "swordsaint",
          name: "검성",
          tier: 6,
          unlocked: false,
          condition: "검호 숙련도 35,000",
          conditionRevealed: false,
        }}
        currentJobId="warrior"
        goalJobId={null}
        onSetGoal={() => {}}
      />,
    );

    expect(html).toContain("선행 직업을 해금하면 조건이 공개됩니다.");
    expect(html).not.toContain("검호 숙련도 35,000");
  });
});
