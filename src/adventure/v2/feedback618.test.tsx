import { describe, expect, it } from "vitest";
import { skillLibraryTags } from "./skillLibraryPresentation";
import { V2_SKILLS } from "../data/v2/v2Skills";
import { signatureLabel, V2_EQUIPMENT } from "../data/v2/v2Equipment";

describe("건의 618 효과 설명", () => {
  it("간략 HP 패시브는 VIT 분류 대신 실제 HP 효과를 표시한다", () => {
    const skill = Object.values(V2_SKILLS).find(s => s.passive?.maxHpPct)!;
    expect(skillLibraryTags(skill.id).join(" ")).toContain("HP");
    expect(skillLibraryTags(skill.id).join(" ")).not.toContain("VIT");
  });
  it("반중력 인장은 반발을 방출할 장비와 발동 조건을 설명한다", () => {
    const label = signatureLabel(V2_EQUIPMENT.v2_sky_sig_antigravity_ring.signature!);
    expect(label).toContain("붕괴성의 흉갑");
    expect(label).toContain("직접 공격");
  });
});
