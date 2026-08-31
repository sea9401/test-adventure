import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { CombatLoadoutPreset } from "@/adventure/data/v2/combatLoadoutPresets";
import {
  CombatLoadoutPresetSlots,
  applyResultMessage,
} from "./V2CombatLoadoutPresetsView";

const saved: CombatLoadoutPreset = {
  name: "보스 사냥",
  savedAt: "2026-08-12T01:02:03.000Z",
  skills: ["v2c_warrior_strike", "v2c_warrior_might"],
  pattern: {
    blocks: [
      {
        condition: { kind: "always" },
        action: { kind: "skill", skillId: "v2c_warrior_strike" },
      },
      {
        condition: { kind: "self_hp", op: "below", pct: 50 },
        action: { kind: "role", role: "heal" },
      },
      {
        condition: { kind: "enemy_hp", op: "below", pct: 25 },
        action: { kind: "role", role: "main_attack" },
      },
    ],
  },
  equipment: {
    weapon: "w",
    armor: "a",
    gloves: "g",
    boots: "b",
    ring: "r",
    necklace: "n",
  },
};

const noop = vi.fn();

describe("통합 전투 프리셋 5칸 화면", () => {
  it("빈 슬롯과 저장·활성 슬롯을 항상 다섯 칸으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <CombatLoadoutPresetSlots
        presets={[null, saved, null, null, null]}
        activeSlot={1}
        busySlot={null}
        draftNames={["", "", "", "", ""]}
        onDraftNameChange={noop}
        onSave={noop}
        onApply={noop}
        onDelete={noop}
        onOverwrite={noop}
      />,
    );

    for (let slot = 1; slot <= 5; slot += 1) {
      expect(html).toContain(`슬롯 ${slot}`);
    }
    expect(html).toContain("보스 사냥");
    expect(html).toContain("적용 중");
    expect(html).toContain("스킬 2");
    expect(html).toContain("전투패턴 3");
    expect(html).toContain("장비 6/6");
    expect(html).toContain("현재 세팅 저장");
    expect(html).toContain("적용");
    expect(html).toContain("현재 세팅으로 덮어쓰기");
    expect(html).toContain("삭제");
  });

  it("카드와 중첩 요약에 공용 불투명 surface를 사용한다", () => {
    const html = renderToStaticMarkup(
      <CombatLoadoutPresetSlots
        presets={[null, saved, null, null, null]}
        activeSlot={null}
        busySlot={null}
        draftNames={["", "", "", "", ""]}
        onDraftNameChange={noop}
        onSave={noop}
        onApply={noop}
        onDelete={noop}
        onOverwrite={noop}
      />,
    );

    expect(html).toContain(SURFACE_CARD.split(" ")[0]);
    expect(html).toContain(SURFACE_INSET.split(" ")[0]);
    expect(html).not.toMatch(/bg-[^\s"]+\/40/);
  });
});

describe("통합 프리셋 적용 안내", () => {
  it("세 구성을 함께 적용한 성공을 안내한다", () => {
    expect(
      applyResultMessage("사냥", { skillIds: [], equipmentIids: [] }),
    ).toBe("'사냥' 프리셋의 스킬·전투패턴·장비를 적용했어요.");
  });

  it("사용할 수 없어 제외된 스킬과 장비 수를 함께 안내한다", () => {
    expect(
      applyResultMessage("사냥", {
        skillIds: ["old"],
        equipmentIids: ["gone"],
      }),
    ).toBe(
      "'사냥' 프리셋을 적용했어요. 사용할 수 없는 스킬 1개와 장비 1개는 제외했어요.",
    );
  });
});
