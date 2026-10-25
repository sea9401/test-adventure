// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import type { CombatLoadoutPreset } from "@/adventure/data/v2/combatLoadoutPresets";
import {
  CombatLoadoutPresetList,
  type CombatLoadoutSpSummary,
  applyResultMessage,
  firstEmptyPresetSlot,
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

function renderList(
  presets: Array<CombatLoadoutPreset | null>,
  activeSlot: number | null = null,
  sp: CombatLoadoutSpSummary | null = null,
) {
  return renderToStaticMarkup(
    <CombatLoadoutPresetList
      presets={presets}
      activeSlot={activeSlot}
      sp={sp}
      busySlot={null}
      draftName=""
      onDraftNameChange={noop}
      onSave={noop}
      onApply={noop}
      onDelete={noop}
      onOverwrite={noop}
      onRename={noop}
    />,
  );
}

afterEach(cleanup);

describe("첫 빈 프리셋 칸", () => {
  it("비어 있는 첫 칸 번호를 돌려준다", () => {
    expect(firstEmptyPresetSlot([saved, null, saved, null, null])).toBe(1);
  });

  it("열 칸이 모두 차면 null", () => {
    expect(firstEmptyPresetSlot(Array.from({ length: 10 }, () => saved))).toBeNull();
  });
});

describe("통합 전투 프리셋 화면", () => {
  it("저장 카드 하나와 저장된 프리셋 행을 보여 주고 빈 칸은 개수로 접는다", () => {
    const html = renderList([null, saved, null, null, null], 1);

    expect(html).toContain("현재 세팅 저장");
    expect(html).toContain("보스 사냥");
    expect(html).toContain("적용 중");
    expect(html).toContain("스킬 2 · 패턴 3 · 장비 6/6");
    expect(html).toContain("빈 칸 9개");
    expect(html).not.toContain("빈 프리셋");
    expect(html).toContain('aria-label="보스 사냥 프리셋 적용"');
    expect(html).toContain('aria-label="보스 사냥 프리셋을 현재 세팅으로 덮어쓰기"');
    expect(html).toContain('aria-label="보스 사냥 프리셋 삭제"');
  });

  it("최대 SP와 현재 장착 SP, 프리셋별 사용 SP를 보여 준다", () => {
    const container = document.createElement("div");
    container.innerHTML = renderList([saved, saved, null], null, {
      budget: 1200,
      currentUsed: 1100,
      presetUsed: [1150, 1300, null],
    });
    const text = container.textContent ?? "";

    expect(text).toContain("장착 SP 1,100 / 최대 1,200");
    expect(text).toContain("스킬 2 · SP 1,150/1,200 · 패턴 3 · 장비 6/6");
    expect(text).toContain("SP 1,300/1,200 (100 초과)");
  });

  it("SP 정보가 없으면 SP 표기를 생략한다", () => {
    const html = renderList([saved], null, null);

    expect(html).not.toContain("SP");
  });

  it("저장된 프리셋이 없으면 빈 상태를 안내한다", () => {
    const html = renderList([null, null, null, null, null]);

    expect(html).toContain("저장한 프리셋이 없습니다");
    expect(html).not.toContain("빈 칸 10개");
  });

  it("열 칸이 모두 차면 저장을 막고 덮어쓰기·삭제를 안내한다", () => {
    const html = renderList(Array.from({ length: 10 }, () => saved));
    const container = document.createElement("div");
    container.innerHTML = html;
    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("현재 세팅 저장"),
    );

    expect(saveButton?.disabled).toBe(true);
    expect(html).toContain("빈 칸이 없습니다. 아래 프리셋을 덮어쓰거나 삭제하세요.");
    expect(html).toContain('aria-label="보스 사냥 프리셋을 현재 세팅으로 덮어쓰기"');
  });

  it("카드와 중첩 요약에 공용 불투명 surface를 사용한다", () => {
    const html = renderList([null, saved, null, null, null]);

    expect(html).toContain(SURFACE_CARD.split(" ")[0]);
    expect(html).not.toMatch(/bg-[^\s"]+\/40/);
  });
});

describe("프리셋 이름 변경", () => {
  function renderInteractive(onRename = vi.fn()) {
    render(
      <CombatLoadoutPresetList
        presets={[null, saved]}
        activeSlot={null}
        sp={null}
        busySlot={null}
        draftName=""
        onDraftNameChange={noop}
        onSave={noop}
        onApply={noop}
        onDelete={noop}
        onOverwrite={noop}
        onRename={onRename}
      />,
    );
    return onRename;
  }

  it("이름 변경을 누르면 현재 이름이 채워진 입력칸이 열리고 저장하면 새 이름을 넘긴다", () => {
    const onRename = renderInteractive();

    fireEvent.click(screen.getByRole("button", { name: "보스 사냥 프리셋 이름 변경" }));
    const input = screen.getByRole("textbox", { name: "보스 사냥 프리셋 새 이름" });
    expect((input as HTMLInputElement).value).toBe("보스 사냥");

    fireEvent.change(input, { target: { value: "필드 사냥" } });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));

    expect(onRename).toHaveBeenCalledWith(1, "필드 사냥");
    expect(screen.queryByRole("textbox", { name: "보스 사냥 프리셋 새 이름" })).toBeNull();
  });

  it("엔터로 저장하고 Esc로 취소한다", () => {
    const onRename = renderInteractive();

    fireEvent.click(screen.getByRole("button", { name: "보스 사냥 프리셋 이름 변경" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "보스 사냥 프리셋 새 이름" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("textbox", { name: "보스 사냥 프리셋 새 이름" })).toBeNull();
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "보스 사냥 프리셋 이름 변경" }));
    const input = screen.getByRole("textbox", { name: "보스 사냥 프리셋 새 이름" });
    fireEvent.change(input, { target: { value: "레이드" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(1, "레이드");
  });

  it("빈 이름이나 같은 이름이면 저장 버튼을 막는다", () => {
    renderInteractive();

    fireEvent.click(screen.getByRole("button", { name: "보스 사냥 프리셋 이름 변경" }));
    const submit = screen.getByRole("button", { name: "이름 저장" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "보스 사냥 프리셋 새 이름" }), {
      target: { value: "   " },
    });
    expect(submit.disabled).toBe(true);
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
