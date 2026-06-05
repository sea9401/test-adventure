import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_STARTER_SKILL_IDS,
  V2_ELEMENTAL_SKILLS_BY_CLASS,
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  describeV2Skill,
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
  // 스킬 재설계 — 스킬칸 3~4 (Lv1-49: 3, Lv50+: 4).
  it("Lv1-49 = 3 슬롯", () => {
    expect(v2SkillSlotsForLevel(1)).toBe(3);
    expect(v2SkillSlotsForLevel(49)).toBe(3);
  });
  it("Lv50+ = 4 슬롯", () => {
    expect(v2SkillSlotsForLevel(50)).toBe(4);
    expect(v2SkillSlotsForLevel(100)).toBe(4);
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

describe("스킬 속성 전면 태깅", () => {
  it("모든 데미지 스킬은 element 보유 (몹 상태스킬 제외)", () => {
    for (const s of Object.values(V2_SKILLS)) {
      if (s.monsterOnly) continue;
      const hasDamage = s.effects.some((e) => e.kind === "damage");
      if (hasDamage) {
        expect(s.element, `${s.id} 데미지 스킬인데 element 없음`).toBeTruthy();
      }
    }
  });

  it("힐/버프 전용 스킬엔 element 불필요 (데미지 없으면 미부여 허용)", () => {
    // 회복(v2_skill_recover) 은 데미지 없음 → element 없어도 됨.
    expect(V2_SKILLS.v2_skill_recover.effects.some((e) => e.kind === "damage")).toBe(false);
  });
});

describe("describeV2Skill — 상세 옵션 칩", () => {
  it("모든 스킬에서 예외 없이 문자열 배열 반환 + 'undefined' 미포함", () => {
    for (const def of Object.values(V2_SKILLS)) {
      const chips = describeV2Skill(def);
      expect(Array.isArray(chips)).toBe(true);
      for (const c of chips) {
        expect(typeof c).toBe("string");
        // 스탯 라벨 누락 등으로 칩에 "undefined" 가 새지 않아야(방어).
        expect(c.includes("undefined"), `${def.id}: ${c}`).toBe(false);
      }
    }
  });

  it("공격 스킬은 피해 배율 칩 + 속성 칩(무속성 제외)을 포함", () => {
    const chips = describeV2Skill(V2_SKILLS.v2_skill_fireball); // 화염구: 불, coef 1.4 (마법)
    expect(chips.some((c) => c.includes("공격력×1.4"))).toBe(true);
    expect(chips).toContain("속성 불");
  });

  it("디버프 스킬은 적 스탯 감소 칩 + MP 칩", () => {
    const chips = describeV2Skill(V2_SKILLS.str_intimidating_roar_t2);
    expect(chips.some((c) => c.startsWith("적 힘 −"))).toBe(true);
    expect(chips).toContain("MP 14");
  });

  it("DoT/쿨다운 — 몹 독니는 지속피해 + 쿨 칩", () => {
    const chips = describeV2Skill(V2_SKILLS.mob_venom_bite);
    expect(chips.some((c) => c.includes("중독") && c.includes("지속피해"))).toBe(
      true,
    );
    expect(chips).toContain("쿨 3턴");
  });

  it("MP 0·무속성이면 MP·속성 칩 없음", () => {
    // 몹 독니(카탈로그 mpCost 0, element 없음, 인자 미전달) → MP·속성 칩 모두 없음.
    const chips = describeV2Skill(V2_SKILLS.mob_venom_bite);
    expect(chips.some((c) => c.startsWith("MP"))).toBe(false);
    expect(chips.some((c) => c.startsWith("속성"))).toBe(false);
  });

  it("실효 MP 인자를 주면 그 값으로 MP 칩 표기", () => {
    // 카탈로그 mpCost 0 스킬도 실효 비용(예: 12)을 넘기면 "MP 12" 로 정확히 표기 —
    // UI 가 v2SkillMpCost 를 넘긴다.
    const chips = describeV2Skill(V2_SKILLS.mob_venom_bite, 12);
    expect(chips).toContain("MP 12");
  });
});

describe("레거시 시그니처 id 제거 (P4 은퇴 + 카탈로그 청소)", () => {
  // 구 직업 시그니처(검무·폭풍 화살 등 requireClass 스킬)는 카탈로그에서 제거됐다.
  // 옛 세이브에 박혀있어도 parseV2SkillsState 가 유효 id 가 아니라 안전하게 걸러낸다.
  const REMOVED_SIG = "v2_skill_blade_dance"; // 제거된 레거시 시그니처 id 예.

  it("parseV2SkillsState — 제거된 시그니처 id 는 learned·equipped 에서 모두 탈락, 엘리멘탈은 보존", () => {
    const elem = V2_ELEMENTAL_SKILLS_BY_CLASS.swordsman[0];
    const parsed = parseV2SkillsState({
      learned: [REMOVED_SIG, elem],
      equipped: [REMOVED_SIG, elem], // 옛 세이브: 제거된 시그니처가 장착돼 있던 상태
    });
    expect(parsed.learned).toEqual([elem]);
    expect(parsed.equipped).toEqual([elem]);
  });

  it("idempotent — 유효 엘리멘탈만 있는 equipped 는 그대로", () => {
    const elem = V2_ELEMENTAL_SKILLS_BY_CLASS.mage[1];
    const parsed = parseV2SkillsState({ learned: [elem], equipped: [elem] });
    expect(parsed.equipped).toEqual([elem]);
  });
});
