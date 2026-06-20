// 무승 연환각(v2c_warmonk_kick) = vit 스케일링 회귀 가드. 코드포인트: hits(4, 0.4, 50, "vit").
//   나한권과 같은 엔진 분기(damageWith vit)지만 무승 킷이 직접 발동되는 골든이 없어 직접 커버.
import { describe, it, expect } from "vitest";
import { V2_SKILLS } from "./v2Skills";
import { resolveV2SkillCast, type V2SkillCastInput } from "@/adventure/v2/combat/combatShared";

const KICK = "v2c_warmonk_kick";

function cast(vit: number): ReturnType<typeof resolveV2SkillCast> {
  const input: V2SkillCastInput = {
    skills: { learned: [KICK], equipped: [KICK] } as V2SkillCastInput["skills"],
    cooldowns: {},
    procRoll: 0, // 확정 발동
    attacker: {
      mp: 999, atk: 10, maxHp: 1000, currentHp: 1000, maxMp: 100,
      vit, selfBuffs: {}, selfDebuffs: {},
    },
    target: { def: 0, maxHp: 100000, currentHp: 100000, selfBuffs: {}, selfDebuffs: {} },
  } as never;
  return resolveV2SkillCast(input);
}

describe("무승 연환각 — vit 스케일링", () => {
  it("효과 4타 전부 scaling=vit (데이터)", () => {
    const effs = V2_SKILLS[KICK].effects;
    expect(effs.length).toBe(4);
    for (const e of effs) {
      expect(e.kind).toBe("damage");
      expect((e as { scaling?: string }).scaling).toBe("vit");
    }
  });

  it("데미지가 atk 가 아니라 vit 로 스케일 (vit↑ → 딜↑)", () => {
    const lowVit = cast(20).enemyDamage; // atk 10 고정, vit 만 변화
    const highVit = cast(400).enemyDamage;
    expect(cast(400).castSkillId).toBe(KICK);
    // atk 스케일이면 vit 변화에 불변일 것 — vit 가 딜을 끌어올리면 vit 스케일 입증.
    expect(highVit).toBeGreaterThan(lowVit * 3);
  });
});
