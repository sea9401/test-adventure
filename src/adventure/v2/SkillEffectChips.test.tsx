import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillEffectChips } from "./SkillEffectChips";

describe("출혈 사냥 스킬 효과 칩", () => {
  it("원시 포식의 조건·관통·실제 피해 회복·가속을 한 번씩 표시한다", () => {
    const html = renderToStaticMarkup(
      <SkillEffectChips skillId="v2c_primalpredator_primalfeast" />,
    );
    for (const text of [
      "출혈 10중첩 이상",
      "이 스킬 방어 관통 +12%p",
      "실제 피해의 18% HP 회복",
      "정상 시전 시 다음 행동 속도 +15%",
    ]) {
      expect(html.match(new RegExp(text.replace(/[+%]/g, "\\$&"), "g"))).toHaveLength(1);
    }
  });

  it("야수의 정점의 직접 물리 피해와 출혈 연장을 중복 없이 표시한다", () => {
    const html = renderToStaticMarkup(
      <SkillEffectChips skillId="v2c_primalpredator_apex" />,
    );
    expect(html.match(/직접 물리 스킬 피해 \+12%/g)).toHaveLength(1);
    expect(html.match(/30% 확률로 출혈 지속 \+1 \(최대 4회\)/g)).toHaveLength(1);
  });
});
