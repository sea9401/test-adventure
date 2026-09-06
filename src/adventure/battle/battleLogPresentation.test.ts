import { describe, expect, it } from "vitest";
import { additionalActionDamage, compactDurationEffect } from "./battleLogPresentation";

describe("전투 로그 표시용 변환", () => {
  it("같은 주체의 명시적인 추가 피해만 합산한다", () => {
    expect(additionalActionDamage({ kind: "player_attack", effect: "extra_damage", text: "[교차·추격] 6499 추가 피해." }, "player")).toBe(6499);
    expect(additionalActionDamage({ kind: "enemy_attack", effect: "extra_damage", text: "[추가타] 200 추가 피해." }, "player")).toBeNull();
    expect(additionalActionDamage({ kind: "player_attack", effect: "status_damage", text: "[출혈] 200 피해를 입었다." }, "player")).toBeNull();
    expect(additionalActionDamage({ kind: "enemy_attack", text: "[반사] 200 반사 피해." }, "enemy")).toBeNull();
  });

  it("옛 PvE 추격은 읽되 방어 전 값인 옛 PvP 추격은 합산하지 않는다", () => {
    expect(additionalActionDamage({ kind: "player_attack", text: "[교차·추격] 6499 추가 피해." }, "player")).toBe(6499);
    expect(additionalActionDamage({ kind: "player_attack", side: "p1", text: "[교차·추격] 6499 추가 피해." }, "player")).toBeNull();
    expect(additionalActionDamage({ kind: "enemy_attack", side: "p2", text: "[교차·추격] 6499 추가 피해.", additionalHpDamage: 4200 }, "enemy")).toBe(4200);
    expect(additionalActionDamage({ kind: "enemy_attack", side: "p2", text: "[교차·추격] 6499 추가 피해.", additionalHpDamage: 0 }, "enemy")).toBe(0);
  });

  it("기록된 행동 수와 대상/효과 수치를 유지하고 즉시 효과에는 행동 수를 만들지 않는다", () => {
    expect(compactDurationEffect("공격력 +20% (3행동)")).toBe("공격력 +20% · 3행동");
    expect(compactDurationEffect("적 지속/저주 피해 +28% (적 행동 2회)")).toBe("적 지속/저주 피해 +28% · 적 2행동");
    expect(compactDurationEffect("행동 가속 15%")).toBeNull();
    expect(compactDurationEffect("다음 공격 2회 회피")).toBeNull();
  });
});
