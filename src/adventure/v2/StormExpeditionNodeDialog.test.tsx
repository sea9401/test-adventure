import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stormExpeditionMapNode } from "@/adventure/data/v2/stormExpeditionMap";
import { StormExpeditionNodeDialog } from "./StormExpeditionNodeDialog";

const node = (id: Parameters<typeof stormExpeditionMapNode>[0]) => {
  const found = stormExpeditionMapNode(id);
  if (!found) throw new Error(`missing fixture node: ${String(id)}`);
  return found;
};

const common = {
  open: true,
  busy: false,
  onAction: vi.fn(),
  onClose: vi.fn(),
};

describe("StormExpeditionNodeDialog", () => {
  it("전투 노드에서 적·남은 연전·예상 보상과 전투 시작을 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionNodeDialog
        {...common}
        model={{
          kind: "battle",
          node: node("gale_outer"),
          encounterIndex: 1,
          encounterCount: 2,
          enemyName: "칼날 기류",
          rewardLines: ["골드 12,000G", "항로 재료"],
          skipReplay: false,
        }}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("칼날 기류");
    expect(html).toContain("2 / 2전");
    expect(html).toContain("골드 12,000G");
    expect(html).toContain("전투 시작");
    expect(html).toContain("min-h-11");
    expect(html).toContain("bg-white");
  });

  it("정비 노드에서는 서버가 제시한 선택지만 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionNodeDialog
        {...common}
        model={{
          kind: "choice",
          node: node("supply"),
          choiceKind: "supply",
          hp: 60,
          maxHp: 100,
          mp: 90,
          maxMp: 100,
          choices: [
            { id: "field_rations", name: "응급 식량", description: "최대 HP의 15% 회복" },
            { id: "storm_oil", name: "폭풍 연마유", description: "다음 전투 공격력 증가" },
          ],
        }}
      />,
    );

    expect(html).toContain("HP 60 / 100");
    expect(html).toContain("응급 식량");
    expect(html).toContain("폭풍 연마유");
    expect(html).not.toContain("떠밀려온 금고");
  });

  it("위험 이벤트에서 이익·대가와 수락·지나치기를 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionNodeDialog
        {...common}
        model={{
          kind: "risk",
          node: node("supply"),
          title: "균열 상자",
          benefit: "항로 재료 2개 획득",
          cost: "다음 적 공격력 20% 증가",
        }}
      />,
    );
    expect(html).toContain("이익 · 항로 재료 2개 획득");
    expect(html).toContain("대가 · 다음 적 공격력 20% 증가");
    expect(html).toContain("지나치기");
    expect(html).toContain("위험 감수");
  });

  it("이동 가능한 노드에서는 이동 확인 버튼을 제공한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionNodeDialog
        {...common}
        model={{ kind: "move", node: node("thunder_middle"), routeName: "뇌운 항로", disabledReason: null }}
      />,
    );
    expect(html).toContain("뇌운 항로");
    expect(html).toContain("이 경로로 이동");
  });

  it.each([
    [{ kind: "completed", node: node("gale_outer"), summary: ["2연전 완료", "골드 획득"] } as const, "완료한 체크포인트"],
    [{ kind: "locked", node: node("storm_heart"), reason: "앞선 체크포인트를 완료해야 합니다." } as const, "잠긴 체크포인트"],
  ])("완료·잠김 노드는 %s 안내만 하고 진행 버튼을 제공하지 않는다", (model, expected) => {
    const html = renderToStaticMarkup(<StormExpeditionNodeDialog {...common} model={model} />);
    expect(html).toContain(expected);
    expect(html).not.toContain("전투 시작");
    expect(html).not.toContain("이 경로로 이동");
  });

  it("서버 요청 중에는 닫기와 행동 버튼을 잠근다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionNodeDialog
        {...common}
        busy
        model={{ kind: "move", node: node("supply"), routeName: null, disabledReason: null }}
      />,
    );
    expect(html).toMatch(/>닫기<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>닫기<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>이동 처리 중/);
  });
});
