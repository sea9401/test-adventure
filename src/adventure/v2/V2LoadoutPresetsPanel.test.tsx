import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { diagnoseLoadoutPreset } from "./loadoutPresetDiagnostics";
import {
  LoadoutPresetAdjustment,
  LoadoutPresetSpStatus,
} from "./V2LoadoutPresetsPanel";

const library = [
  { skillId: "skill-a", name: "만독지배", spCost: 30 },
  { skillId: "skill-b", name: "맹독 IV", spCost: 20 },
  { skillId: "skill-c", name: "부식 IV", spCost: 17 },
];

describe("프리셋 SP 상태 표시", () => {
  it("현재 필요 SP와 보유 SP 및 초과분을 함께 보여준다", () => {
    const diagnosis = diagnoseLoadoutPreset(
      ["skill-a", "skill-b", "skill-c"],
      library,
      60,
    );

    const html = renderToStaticMarkup(
      <LoadoutPresetSpStatus diagnosis={diagnosis} />,
    );

    expect(html).toContain("필요 SP 67 / 보유 SP 60");
    expect(html).toContain("7 SP 초과");
  });

  it("조정 화면에서 스킬별 현재 비용과 적용 불가 사유를 보여준다", () => {
    const savedDiagnosis = diagnoseLoadoutPreset(
      ["skill-a", "v2_skill_recover", "legacy_deleted_skill"],
      library,
      60,
    );
    const draftDiagnosis = diagnoseLoadoutPreset(
      ["skill-a", "v2_skill_recover", "legacy_deleted_skill"],
      library,
      60,
    );

    const html = renderToStaticMarkup(
      <LoadoutPresetAdjustment
        savedDiagnosis={savedDiagnosis}
        draftDiagnosis={draftDiagnosis}
        draftSkills={["skill-a", "v2_skill_recover", "legacy_deleted_skill"]}
        autoRemoved={[]}
        busy={false}
        onToggleSkill={vi.fn()}
        onAutoFit={vi.fn()}
        onApply={vi.fn()}
        onApplyAndSave={vi.fn()}
      />,
    );

    expect(html).toContain("만독지배");
    expect(html).toContain("30 SP");
    expect(html).toContain("회복");
    expect(html).toContain("현재 미습득");
    expect(html).toContain("legacy_deleted_skill");
    expect(html).toContain("더 이상 존재하지 않는 스킬");
    expect(html).toContain("자동 맞춤");
    expect(html).toContain("조정한 구성으로 적용");
    expect(html).toContain("적용 후 프리셋 저장");
  });

  it("자동 맞춤에서 제외될 스킬을 표시한다", () => {
    const savedDiagnosis = diagnoseLoadoutPreset(
      ["skill-a", "skill-b", "skill-c"],
      library,
      60,
    );
    const draftDiagnosis = diagnoseLoadoutPreset(
      ["skill-a", "skill-b"],
      library,
      60,
    );

    const html = renderToStaticMarkup(
      <LoadoutPresetAdjustment
        savedDiagnosis={savedDiagnosis}
        draftDiagnosis={draftDiagnosis}
        draftSkills={["skill-a", "skill-b"]}
        autoRemoved={["skill-c"]}
        busy={false}
        onToggleSkill={vi.fn()}
        onAutoFit={vi.fn()}
        onApply={vi.fn()}
        onApplyAndSave={vi.fn()}
      />,
    );

    expect(html).toContain("자동 맞춤 제외");
    expect(html).toContain("부식 IV · 17 SP");
    expect(html).toContain("조정 후 50 / 60 SP");
  });
});
