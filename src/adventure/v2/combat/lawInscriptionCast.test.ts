import { describe, expect, it } from "vitest";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  removeMissedV2SkillTargetEffects,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";

function input(args: {
  equipped: V2SkillId[];
  mp?: number;
  lawInscription?: boolean;
  lawInscriptions?: V2SkillCastInput["attacker"]["lawInscriptions"];
}): V2SkillCastInput {
  return {
    skills: { learned: args.equipped, equipped: args.equipped },
    cooldowns: {},
    procRoll: 0,
    attacker: {
      mp: args.mp ?? 999,
      atk: 100,
      magicAtk: 100,
      int: 100,
      maxHp: 1_000,
      currentHp: 1_000,
      maxMp: 1_000,
      selfBuffs: {},
      selfDebuffs: {},
      lawInscription: args.lawInscription,
      lawInscriptions: args.lawInscriptions,
    },
    target: {
      def: 0,
      magicDef: 0,
      maxHp: 10_000,
      currentHp: 10_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
  };
}

describe("법칙 각인 공용 시전 해석", () => {
  it("패시브 보유자의 정상 생성 스킬은 장착 재료별 증가를 남기며 빗나가도 유지한다", () => {
    const cast = resolveV2SkillCast(
      input({
        equipped: [
          "v2c_inscriber_release",
          "v2c_mage_acumen",
          "v2c_caster_acumen",
        ],
        lawInscription: true,
      }),
    );
    expect(cast.castSkillId).toBe("v2c_inscriber_release");
    expect(cast.lawInscriptionGain).toEqual({
      assault: 1,
      reflux: 1,
      erosion: 0,
      ward: 0,
    });
    expect(removeMissedV2SkillTargetEffects(cast).lawInscriptionGain).toEqual(
      cast.lawInscriptionGain,
    );

    const inert = resolveV2SkillCast(
      input({
        equipped: ["v2c_inscriber_release", "v2c_mage_acumen"],
      }),
    );
    expect(inert.lawInscriptionGain).toEqual({
      assault: 0,
      reflux: 0,
      erosion: 0,
      ward: 0,
    });
  });

  it("각인 3개 미만과 MP 부족에서는 해방하지 않고 소비 스냅샷을 만들지 않는다", () => {
    const insufficient = resolveV2SkillCast(
      input({
        equipped: ["v2c_lawweaver_release"],
        lawInscriptions: { assault: 2, reflux: 0, erosion: 0, ward: 0 },
      }),
    );
    expect(insufficient.castSkillId).toBeNull();
    expect(insufficient.lawInscriptionsToConsume).toBeUndefined();

    const noMp = resolveV2SkillCast(
      input({
        equipped: ["v2c_lawweaver_release"],
        mp: 199,
        lawInscriptions: { assault: 2, reflux: 1, erosion: 0, ward: 0 },
      }),
    );
    expect(noMp.castSkillId).toBeNull();
    expect(noMp.lawInscriptionsToConsume).toBeUndefined();
  });

  it("유효 해방은 동적 다단 효과를 기존 경로로 계산하고 전량 소비 스냅샷을 남긴다", () => {
    const cast = resolveV2SkillCast(
      input({
        equipped: ["v2c_lawweaver_release"],
        lawInscriptions: { assault: 2, reflux: 2, erosion: 2, ward: 2 },
      }),
    );
    expect(cast.castSkillId).toBe("v2c_lawweaver_release");
    expect(cast.lawInscriptionsToConsume).toEqual({
      assault: 2,
      reflux: 2,
      erosion: 2,
      ward: 2,
    });
    expect(cast.hitDamages).toHaveLength(4);
    expect(cast.enemyDamage).toBeGreaterThan(0);
    expect(cast.manaRestored).toBe(80);
    expect(cast.enemyMagicVulnToApply).toEqual({ pct: 14, turns: 3 });
    expect(cast.shieldToApply).toEqual({ hp: 0, mp: 140, turns: 3 });
    expect(cast.selfHasteToApply).toEqual({ pct: 35 });
    expect(cast.lawInscriptionComplete).toBe(true);
  });
});
