import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  advanceClassErrorLabel,
  formatLifeResourceRejobMessage,
  V2JobLadder,
} from "./V2JobLadder";

describe("formatLifeResourceRejobMessage", () => {
  it("새 Lv.1 HP·MP와 앞으로의 레벨업 범위를 성공 메시지에 붙인다", () => {
    expect(
      formatLifeResourceRejobMessage("✓ 병사 재전직 완료", {
        maxHp: 142,
        maxMp: 81,
        hpPerLevel: { min: 8, max: 12 },
        mpPerLevel: { min: 3, max: 5 },
      }),
    ).toBe(
      "✓ 병사 재전직 완료 · 새 생애 HP 142 / MP 81 · 레벨업 HP +8~12, MP +3~5",
    );
  });

  it("응답 필드가 없거나 손상됐으면 기존 메시지를 그대로 둔다", () => {
    expect(formatLifeResourceRejobMessage("✓ 전직 완료", undefined)).toBe(
      "✓ 전직 완료",
    );
    expect(
      formatLifeResourceRejobMessage("✓ 전직 완료", { maxHp: 120 }),
    ).toBe("✓ 전직 완료");
  });
});

describe("V2JobLadder production-job guidance", () => {
  it("수인 단일 계보와 바로 아래 직업 숙련도 조건을 표시한다", () => {
    const names = [
      "야수전사",
      "추적자",
      "혈흔추적자",
      "포식자",
      "원시 포식자",
    ];
    const ids = [
      "beastwarrior",
      "tracker",
      "bloodtracker",
      "predator",
      "primalpredator",
    ];
    const requirements = [1000, 2500, 4500, 18000, 35000];

    for (const [index, name] of names.entries()) {
      const parentName = index === 0 ? "수인" : names[index - 1];
      const condition = `${parentName} 숙련도 ${requirements[index]}`;
      const html = renderToStaticMarkup(
        <V2JobLadder
          level={100}
          currentJobName={parentName}
          currentJobId={index === 0 ? "beastkin" : ids[index - 1]}
          atLevelCap
          revisitExpedited={false}
          rejobRequiredLevel={100}
          jobs={[
            {
              id: ids[index],
              name,
              tier: (index + 2) as 2 | 3 | 4 | 5 | 6,
              unlocked: true,
              condition,
            },
          ]}
          onChanged={() => {}}
        />,
      );

      expect(html).toContain(name);
      expect(html).toContain(condition);
    }
  });

  it("describes a level-one internal gate as no character-level requirement", () => {
    const html = renderToStaticMarkup(
      <V2JobLadder
        level={42}
        currentJobName="농부"
        currentJobId="farmer"
        atLevelCap
        revisitExpedited={false}
        rejobRequiredLevel={1}
        jobs={[
          {
            id: "horticulturist",
            name: "원예가",
            tier: 3,
            unlocked: false,
            condition: "농부 전직, 농사 Lv 10",
          },
        ]}
        onChanged={() => {}}
      />,
    );

    expect(html).toContain("생산직 전직에는 캐릭터 레벨 제한이 없어요.");
    expect(html).toContain("생활 숙련 조건만 충족하면 바로 전직할 수");
    expect(html).toContain("전직 로드맵");
    expect(html).not.toContain("Lv 1 도달");
  });

  it("allows leaving a revisited combat job immediately but not repeating that job", () => {
    const html = renderToStaticMarkup(
      <V2JobLadder
        level={1}
        currentJobName="병사"
        currentJobId="warrior"
        atLevelCap
        revisitExpedited
        rejobRequiredLevel={100}
        jobs={[
          {
            id: "warrior",
            name: "병사",
            tier: 1,
            unlocked: true,
            condition: "기본 직업",
          },
          {
            id: "mage",
            name: "마법사",
            tier: 1,
            unlocked: true,
            condition: "기본 직업",
          },
        ]}
        onChanged={() => {}}
      />,
    );

    expect(html).toContain("이전에 수련한 직업이라 전직 레벨 제한이 없어요.");
    expect(html).toContain("놓친 스킬을 배운 뒤 바로 다른 직업으로 이동할 수");
    expect(html).not.toContain("생산직 전직에는 캐릭터 레벨 제한이 없어요.");
    expect(html).toContain("Lv 100 필요");
  });
});

describe("advanceClassErrorLabel", () => {
  it.each([
    [
      { error: "tier7_prerequisite_proficiency" },
      "두 선행 6차 숙련도가 각각 100,000 필요해요",
    ],
    [
      { error: "tier7_current_job" },
      "선행 6차 직업으로 Lv.100을 달성한 뒤 전직할 수 있어요",
    ],
    [
      { error: "tier7_material_shortage", required: 30 },
      "폭풍 기원의 파편 30개가 필요해요",
    ],
    [
      { error: "level_too_low", required: 100 },
      "전투 Lv 100 도달 후 전직할 수 있어요",
    ],
  ])("maps %o to actionable Korean copy", (payload, expected) => {
    expect(advanceClassErrorLabel(payload, 400)).toBe(expected);
  });
});
