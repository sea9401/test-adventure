// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCombatPattern,
  parseCombatPresets,
  type V2CombatPattern,
  type V2CombatPreset,
} from "./combat/combatPattern";
import { V2CombatPatternView } from "./V2CombatPatternView";

const declarations = [
  "v2c_grandchampion_hour",
  "v2c_undefeated_momentum",
  "v2c_contender_insight",
  "v2c_duelist_declaration",
];
const declarationNames = ["챔피언의 시간", "무패의 기세", "빈틈 간파", "결투 선언"];
const savedPattern: V2CombatPattern = {
  blocks: declarations.map((skillId) => ({
    condition: { kind: "always" },
    action: { kind: "skill", skillId },
  })),
};

// HTTP 경계만 대체한다. 실제 에디터와 저장 API의 파서를 사용하고,
// 화면 재진입 시 직전 요청으로 저장된 패턴·프리셋을 다시 제공한다.
function serveSkills({
  equipped = declarations,
  pattern = savedPattern,
}: {
  equipped?: string[];
  pattern?: V2CombatPattern | null;
} = {}) {
  const skills = {
    equipped,
    pattern,
    presets: [] as V2CombatPreset[],
  };
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v2/me/state" && !init?.method) {
      return Response.json({ skills });
    }
    if (init?.method !== "POST") throw new Error(`Unexpected request: ${url}`);
    const body = JSON.parse(String(init.body));
    requests.push({ url, body });
    if (url === "/api/v2/me/combat-pattern") {
      skills.pattern = parseCombatPattern(body);
      return Response.json({ ok: true, pattern: skills.pattern });
    }
    if (url === "/api/v2/me/combat-pattern/presets") {
      skills.presets = parseCombatPresets(body.presets);
      return Response.json({ ok: true, presets: skills.presets });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
  return { requests };
}

async function openEditor() {
  const view = render(<V2CombatPatternView onBack={vi.fn()} embedded />);
  await screen.findByRole("button", { name: "+ 블록 추가" });
  return view;
}

function patternRows() {
  return screen.getAllByRole("listitem").filter((row) =>
    within(row).queryByText(/^우선순위 /),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("결투가 패턴 저장과 화면 재진입 (#687)", () => {
  it("네 선언의 순서를 편집·저장하고 프리셋을 적용해도 재진입 시 모든 블록을 보존한다", async () => {
    const { requests } = serveSkills();
    let view = await openEditor();

    expect(patternRows()).toHaveLength(4);
    declarationNames.forEach((name, index) => {
      expect(within(patternRows()[index]).getByRole("button", { name: new RegExp(name) })).toBeTruthy();
      expect(within(patternRows()[index]).getByRole("button", { name: "항상" })).toBeTruthy();
    });
    expect(requests).toEqual([]);
    expect(screen.getAllByText(/상위 선언 연계 중/)).toHaveLength(3);

    fireEvent.click(within(patternRows()[0]).getByRole("button", { name: "↓" }));
    await screen.findByText("✓ 저장됨", {}, { timeout: 2000 });
    const reordered = {
      blocks: [savedPattern.blocks[1], savedPattern.blocks[0], ...savedPattern.blocks.slice(2)],
    };
    expect(requests).toEqual([
      { url: "/api/v2/me/combat-pattern", body: reordered },
    ]);

    fireEvent.change(screen.getByPlaceholderText("현재 패턴 이름 (예: 보스용)"), {
      target: { value: "결투가" },
    });
    fireEvent.click(screen.getByRole("button", { name: "프리셋으로 저장" }));
    await screen.findByText("✓ 프리셋 '결투가' 저장");
    expect(requests.at(-1)).toEqual({
      url: "/api/v2/me/combat-pattern/presets",
      body: { presets: [{ name: "결투가", pattern: reordered }] },
    });

    view.unmount();
    view = await openEditor();
    expect(patternRows()).toHaveLength(4);
    expect(within(patternRows()[0]).getByRole("button", { name: /무패의 기세/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    await screen.findByText("✓ '결투가' 적용됨");
    expect(requests.at(-1)).toEqual({ url: "/api/v2/me/combat-pattern", body: reordered });

    view.unmount();
    await openEditor();
    expect(patternRows()).toHaveLength(4);
    expect(within(patternRows()[0]).getByRole("button", { name: /무패의 기세/ })).toBeTruthy();
  });

  it("하위 선언이 포함된 교대 블록도 조건과 두 스킬을 보존하고 전투 제외를 안내한다", async () => {
    const pattern: V2CombatPattern = {
      blocks: [{
        condition: { kind: "turn", op: "atLeast", value: 3 },
        action: {
          kind: "alternate",
          firstSkillId: "v2c_undefeated_momentum",
          secondSkillId: "v2c_grandchampion_hour",
        },
      }],
    };
    const { requests } = serveSkills({ pattern });
    await openEditor();

    expect(patternRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /무패의 기세/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /챔피언의 시간/ })).toBeTruthy();
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("3");
    expect(screen.getByText(/이 블록은 전투에서 건너뜁니다/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("현재 패턴 이름 (예: 보스용)"), {
      target: { value: "교대" },
    });
    fireEvent.click(screen.getByRole("button", { name: "프리셋으로 저장" }));
    await screen.findByText("✓ 프리셋 '교대' 저장");
    expect(requests.at(-1)?.body).toEqual({ presets: [{ name: "교대", pattern }] });
  });

  it("미장착 선언 블록은 보존하되 상위 선언에 효과가 합쳐진다고 안내하지 않는다", async () => {
    serveSkills({ equipped: [declarations[0]] });
    await openEditor();

    expect(patternRows()).toHaveLength(4);
    expect(screen.getAllByText(/미장착 스킬 —/)).toHaveLength(3);
    expect(screen.queryByText(/상위 선언 연계 중/)).toBeNull();
  });

  it.each([null, { blocks: [] }])("미설정·빈 패턴 %j는 최고 선언의 스마트 기본값을 표시한다", async (pattern) => {
    const { requests } = serveSkills({ pattern });
    await openEditor();

    expect(patternRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /챔피언의 시간/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "없을 때", checked: true })).toBeTruthy();
    expect(screen.queryByText(/상위 선언 연계 중/)).toBeNull();
    expect(requests).toEqual([]);
  });
});
