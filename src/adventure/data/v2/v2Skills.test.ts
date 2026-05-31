import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_STARTER_SKILL_IDS,
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillId,
} from "./v2Skills";

describe("v2Skills 카탈로그", () => {
  it("스타터 6종 모두 카탈로그에 정의되어 있다", () => {
    for (const id of V2_STARTER_SKILL_IDS) {
      expect(V2_SKILLS[id]).toBeDefined();
      expect(V2_SKILLS[id].tier).toBe(1);
    }
  });

  it("카탈로그 entry 의 id 와 key 가 일치", () => {
    for (const [key, def] of Object.entries(V2_SKILLS)) {
      expect(def.id).toBe(key);
    }
  });

  it("MP cost / cooldown 은 음수 아님", () => {
    for (const def of Object.values(V2_SKILLS)) {
      expect(def.mpCost).toBeGreaterThanOrEqual(0);
      expect(def.cooldown).toBeGreaterThanOrEqual(0);
    }
  });

  it("스타터 6종은 6개 스탯 각각 1개씩", () => {
    const stats = new Set(
      V2_STARTER_SKILL_IDS.map((id) => V2_SKILLS[id].stat),
    );
    expect(stats.size).toBe(6);
    expect(stats).toEqual(
      new Set(["str", "dex", "vit", "spd", "luk", "int"]),
    );
  });

  it("마법 탄(tier1 학습형 INT) — magic 스케일·학습형·스타터 아님·int 요구", () => {
    const bolt = V2_SKILLS.int_magic_bolt_t1;
    expect(bolt.stat).toBe("int");
    expect(bolt.tier).toBe(1);
    expect(bolt.category).toBe("attack");
    // magic 스케일 damage effect (magicAtk 로 침)
    const dmg = bolt.effects.find((e) => e.kind === "damage");
    expect(dmg).toBeDefined();
    expect(dmg?.kind === "damage" && dmg.scaling).toBe("magic");
    // 스타터 아님 — 비-INT 빌드 자동지급 방지. 학습형 + int 요구치로 게이트.
    expect(V2_STARTER_SKILL_IDS).not.toContain("int_magic_bolt_t1");
    expect(bolt.learn).toBeDefined();
    expect(bolt.learn?.stat?.key).toBe("int");
  });
});

describe("v2SkillSlotsForLevel", () => {
  it("Lv1-33 = 3 슬롯", () => {
    expect(v2SkillSlotsForLevel(1)).toBe(3);
    expect(v2SkillSlotsForLevel(33)).toBe(3);
  });
  it("Lv34-66 = 4 슬롯", () => {
    expect(v2SkillSlotsForLevel(34)).toBe(4);
    expect(v2SkillSlotsForLevel(66)).toBe(4);
  });
  it("Lv67-99 = 5 슬롯", () => {
    expect(v2SkillSlotsForLevel(67)).toBe(5);
    expect(v2SkillSlotsForLevel(99)).toBe(5);
  });
  it("Lv100 = 6 슬롯", () => {
    expect(v2SkillSlotsForLevel(100)).toBe(6);
  });
  it("Lv0 이하는 Lv1 처럼 3 슬롯 (방어적)", () => {
    expect(v2SkillSlotsForLevel(0)).toBe(3);
    expect(v2SkillSlotsForLevel(-5)).toBe(3);
  });
});

describe("parseV2SkillsState", () => {
  it("undefined/null/string 등 비객체 → empty", () => {
    expect(parseV2SkillsState(undefined)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState(null)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState("garbage")).toEqual(emptyV2SkillsState());
  });

  it("valid id 만 남기고 unknown 거른다", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "unknown_id", "v2_skill_dash"],
      equipped: ["v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("중복 id 한 번만 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_strike", "v2_skill_dash"],
      equipped: ["v2_skill_strike", "v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("learned 에 없는 id 는 equipped 에서 제거 (race 보정)", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike", "v2_skill_dash"],
    });
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("equipped 순서 보존 (자동 발동 우선순위)", () => {
    const ids: V2SkillId[] = [
      "v2_skill_dash",
      "v2_skill_strike",
      "v2_skill_recover",
    ];
    const r = parseV2SkillsState({ learned: ids, equipped: ids });
    expect(r.equipped).toEqual(ids);
  });
});

describe("몬스터 상태이상 스킬 (PR-9)", () => {
  const MOB_SKILLS = [
    "mob_venom_bite",
    "mob_chilling_touch",
    "mob_rending_claw",
  ] as const;

  it("3종 monsterOnly + learn 없음(플레이어 미학습) + mpCost 0", () => {
    for (const id of MOB_SKILLS) {
      const s = V2_SKILLS[id];
      expect(s.monsterOnly, `${id} monsterOnly`).toBe(true);
      expect(s.learn, `${id} learn`).toBeUndefined();
      expect(s.mpCost, `${id} mp`).toBe(0);
      // 순수 상태이상 — damage effect 없음, dot/enemyDebuff 만.
      for (const e of s.effects) {
        expect(["dot", "enemyDebuff"]).toContain(e.kind);
      }
    }
  });

  it("스타터/플레이어 학습 목록에 안 섞임 (UI 누출 방지)", () => {
    for (const id of MOB_SKILLS) {
      expect(V2_STARTER_SKILL_IDS).not.toContain(id);
    }
    // 플레이어 학습 가능 스킬(learn 보유)에 monsterOnly 가 하나도 없어야.
    for (const s of Object.values(V2_SKILLS)) {
      if (s.monsterOnly) expect(s.learn).toBeUndefined();
    }
  });
});
