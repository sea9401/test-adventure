import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  DEFERRED_REPLAY_UNAVAILABLE_MESSAGE,
  ReplayBattleScene,
} from "./ReplayBattleScene";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const payload: ReplayPayload = {
  enemy: { name: "훈련용 적", hp: 100 },
  playerMaxHp: 100,
  playerMaxMp: 0,
  log: [
    { kind: "info", text: "전투가 시작됐다." },
    {
      kind: "hp_bar",
      text: "",
      playerHp: 90,
      playerMaxHp: 100,
      enemyHp: 0,
      enemyMaxHp: 100,
    },
  ],
};

const commonProps = {
  payload,
  playerName: "모험가",
  gender: "male1" as const,
  exp: 0,
  maxExp: 1,
};

describe("전투 로그 표시 방식", () => {
  it("만료되거나 사라진 임시 로그를 명확하게 안내한다", () => {
    expect(DEFERRED_REPLAY_UNAVAILABLE_MESSAGE).toBe(
      "전투 기록 보관 시간이 지났거나 찾을 수 없습니다.",
    );
  });

  it("결과 화면에서는 전체 로그 대신 전용 페이지 이동 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(<ReplayBattleScene {...commonProps} />);

    expect(html).toContain("전체 전투 로그 보기");
    expect(html).not.toContain("전투가 시작됐다.");
  });

  it("전용 페이지에서는 전체 로그를 자연 흐름으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ReplayBattleScene {...commonProps} presentation="page" />,
    );

    expect(html).toContain("전투가 시작됐다.");
    expect(html).toContain('data-battle-log-viewport="page"');
    expect(html).not.toContain("h-[58svh]");
  });

  it("payload 전투 스냅샷만으로 캐릭터 상세와 상대 비교를 같은 양식으로 표시한다", () => {
    const detailedPayload: ReplayPayload = {
      ...payload,
      enemy: {
        ...payload.enemy,
        atk: 80,
        def: 70,
        magicDef: 60,
        spd: 30,
        accuracy: 15,
        evasionPct: 10,
        statusDamageReductionPct: 25,
      },
      playerCombat: {
        atk: 100,
        def: 90,
        magicDef: 75,
        spd: 40,
        accuracy: 20,
        evasionPct: 12,
        evaRating: 12,
        statusDamageReductionPct: 8,
        primaryAttack: "physical",
        magicBarrierMax: 50,
        magicBarrierAbsorbPct: 20,
        magicBarrierEfficiencyPct: 10,
      },
      ruleset: "pve",
      maxHpDamageMult: 0.8,
    };
    const html = renderToStaticMarkup(
      <ReplayBattleScene
        {...commonProps}
        payload={detailedPayload}
        presentation="page"
      />,
    );

    expect(html).toContain("마방");
    expect(html).toContain("상태 피해 감소");
    expect(html).toContain("내 공격 피해 유지");
    expect(html).toContain("지속 피해 보정");
    expect(html).toContain("방어 전 피해에서 20% 분리");
  });
});
