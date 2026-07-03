import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_STARTER_SKILL_IDS,
  parseV2SkillsState,
  emptyV2SkillsState,
  orderedLearnedSkills,
  describeV2Skill,
  v2SkillSearchText,
  smartDefaultConditionForSkill,
  smartDefaultPatternFromEquipped,
  aggregateEquippedPassives,
  equippedFishingBonuses,
  spCostOf,
  rubricSpCost,
  type V2SkillId,
} from "./v2Skills";

describe("사제 회복 패시브 (SPI PR-4 — v2c_acolyte_mana 리스킨)", () => {
  it("v2c_acolyte_mana 는 회복강화(healPowerPct) 패시브 — 옛 마나(maxMpPct) 아님", () => {
    const p = V2_SKILLS.v2c_acolyte_mana?.passive;
    expect(p?.healPowerPct).toBe(20);
    expect(p?.maxMpPct ?? 0).toBe(0); // 리스킨으로 MP% 제거
    expect(V2_SKILLS.v2c_acolyte_mana?.name).toBe("회복");
  });
  it("aggregateEquippedPassives 가 healPowerPct 를 합산한다", () => {
    expect(aggregateEquippedPassives(["v2c_acolyte_mana"]).healPowerPct).toBe(20);
    expect(aggregateEquippedPassives([]).healPowerPct).toBe(0);
  });
});

describe("가디언 방벽 패시브 (방어% — 방패 강타 방어기반과 시너지)", () => {
  it("v2c_guardian_bulwark3 = 방어 20%(받피감→방어% 전환)", () => {
    expect(V2_SKILLS.v2c_guardian_bulwark3?.passive?.defPct).toBe(20);
    expect(
      V2_SKILLS.v2c_guardian_bulwark3?.passive?.damageTakenReductionPct,
    ).toBeUndefined();
  });
  it("damageTakenReductionPct 어휘는 배선 보존(현재 미사용·aggregate 기본 0)", () => {
    expect(aggregateEquippedPassives([]).damageTakenReductionPct).toBe(0);
  });
});

describe("원소 통달 패시브 칩 (속성 상성 양방향 — 로드아웃 간략 설명)", () => {
  it("describeV2Skill 가 속성 유리/불리 칩을 낸다 (옛 0개 → 2개)", () => {
    const chips = describeV2Skill(V2_SKILLS.v2c_elementalist_mastery);
    expect(chips.some((c) => c.includes("속성 유리 피해 +15%"))).toBe(true);
    expect(chips.some((c) => c.includes("속성 불리 받피 -15%"))).toBe(true);
  });
});

describe("낚시 생활 패시브", () => {
  it("미끼 고르기와 물때 읽기는 장착형 낚시 보너스로 합산된다", () => {
    expect(
      equippedFishingBonuses([
        "v2c_survivor_baitcraft",
        "v2c_camper_tidereading",
        "v2c_angler_pointreading",
        "v2c_masterangler_bigcatchsense",
        "v2c_fullcatchking_bountyhaul",
        "v2c_seagod_deepcurrent",
      ]),
    ).toEqual({
      sizeBonusPct: 7,
      specialWeightPct: 45,
      rareSizeBonusPct: 7,
      bigCatchSizeBonusPct: 4,
    });
    expect(equippedFishingBonuses([])).toEqual({
      sizeBonusPct: 0,
      specialWeightPct: 0,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
    });
  });

  it("describeV2Skill 가 낚시 효과 칩을 낸다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_baitcraft)).toContain(
      "물고기 크기 +4%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_camper_tidereading)).toContain(
      "물때 한정 어종 가중치 +25%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_angler_pointreading)).toContain(
      "희귀 이상 물고기 크기 +3%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_masterangler_bigcatchsense)).toContain(
      "대물급 물고기 크기 +2%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_fullcatchking_bountyhaul)).toContain(
      "물고기 크기 +3%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_fullcatchking_bountyhaul)).toContain(
      "대물급 물고기 크기 +2%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_seagod_deepcurrent)).toContain(
      "물때 한정 어종 가중치 +20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_seagod_deepcurrent)).toContain(
      "희귀 이상 물고기 크기 +4%",
    );
  });
});

describe("v2Skills 카탈로그", () => {
  it("스킬 검색 색인은 이름뿐 아니라 설명과 효과 칩도 포함한다", () => {
    const corrosion = v2SkillSearchText(V2_SKILLS.v2c_venomist_corrosion);
    expect(corrosion).toContain("부식");
    expect(corrosion).toContain("독");
    expect(corrosion).toContain("중독 적 방어");

    const guard = v2SkillSearchText(V2_SKILLS.v2c_ironknight_guard);
    expect(guard).toContain("보호막");
  });

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

  it("skillOrder 는 학습한 유효 id 만 표시 순서로 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_dash", "v2_skill_recover"],
      equipped: ["v2_skill_strike"],
      skillOrder: [
        "v2_skill_dash",
        "unknown_id",
        "v2_skill_dash",
        "v2_skill_recover",
        "v2_skill_flurry",
      ],
    });
    expect(r.skillOrder).toEqual(["v2_skill_dash", "v2_skill_recover"]);
  });

  it("favoriteSkills 는 학습한 유효 id 만 즐겨찾기로 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_dash", "v2_skill_recover"],
      equipped: ["v2_skill_strike"],
      favoriteSkills: [
        "v2_skill_recover",
        "v2_skill_flurry",
        "v2_skill_recover",
        "unknown_id",
        "v2_skill_dash",
      ],
    });
    expect(r.favoriteSkills).toEqual(["v2_skill_recover", "v2_skill_dash"]);
  });

  it("orderedLearnedSkills 는 커스텀 순서 뒤에 누락 학습분을 붙인다", () => {
    const learned: V2SkillId[] = [
      "v2_skill_strike",
      "v2_skill_dash",
      "v2_skill_recover",
    ];
    expect(orderedLearnedSkills(learned, ["v2_skill_dash"])).toEqual([
      "v2_skill_dash",
      "v2_skill_strike",
      "v2_skill_recover",
    ]);
  });

  it("프리셋(C4) 라운드트립 — 검증 파싱 후 보존, 빈 라이브러리는 키 생략", () => {
    const withPresets = parseV2SkillsState({
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
      presets: [
        {
          name: "보스용",
          pattern: {
            blocks: [
              { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2_skill_strike" } },
            ],
          },
        },
      ],
    });
    expect(withPresets.presets).toHaveLength(1);
    expect(withPresets.presets?.[0].name).toBe("보스용");
    expect(withPresets.presets?.[0].pattern.blocks).toHaveLength(1);
    // 프리셋 없으면 키 자체 생략(하위호환).
    const none = parseV2SkillsState({ learned: [], equipped: [] });
    expect(none.presets).toBeUndefined();
  });
});

describe("스마트 기본 패턴 (유틸 스팸 방지)", () => {
  it("스킬 종류별 합리적 기본 조건", () => {
    // 공격(강타) → 항상.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2_skill_strike)).toEqual({ kind: "always" });
    // 마나 회복(명상) → MP 낮을 때(매 턴 스팸 방지 — 0코스트라 "항상"이면 무한 발동).
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_mage_meditate)).toEqual({
      kind: "self_mp", op: "below", pct: 40,
    });
    // 힐(기공 순환) → HP 낮을 때.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_martial_chi)).toEqual({
      kind: "self_hp", op: "below", pct: 50,
    });
    // 스탯 버프(함성) → 그 버프 없을 때(재버프 낭비 방지).
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_warrior_warcry)).toEqual({
      kind: "self_buff", stat: "str", active: false,
    });
    // 파생버프(철포=받피감 selfBuffPct) → 그 버프 없을 때(만료 시 재시전·오프너 한계 해소).
    //   무인 재설계(2026-06-22): 철포가 수도승 monk_palm 으로 이전·steelguard 는 하급 권법(공격→항상).
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_monk_palm)).toEqual({
      kind: "self_buff_pct", target: "damageReduction", active: false,
    });
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_martial_steelguard)).toEqual({
      kind: "always",
    });
  });

  it("명상은 기본 패턴에서 '항상' 이 아니다 (매 턴 발동 → 공격 안 함 버그 방지)", () => {
    const p = smartDefaultPatternFromEquipped(["v2c_mage_meditate", "v2_skill_strike"]);
    expect(p.blocks).toHaveLength(2);
    // 슬롯 순서(우선순위) 보존.
    expect(p.blocks[0].action).toEqual({ kind: "skill", skillId: "v2c_mage_meditate" });
    expect(p.blocks[1].action).toEqual({ kind: "skill", skillId: "v2_skill_strike" });
    // 명상은 조건부, 강타는 항상.
    expect(p.blocks[0].condition.kind).toBe("self_mp");
    expect(p.blocks[1].condition).toEqual({ kind: "always" });
  });

  it("순수 DoT 공격 스킬(출혈·중독)도 '항상' — 첫 턴만 발동하는 회귀 방지", () => {
    // dot 효과만 있고 직접 데미지 없는 공격기. damage 버킷에서 빠지면 opener(turn atMost 1)로
    //   잘못 분류돼 첫 턴 후 안 나간다(Codex BLOCK). dot 도 "적 피해"라 항상 발동.
    expect(smartDefaultConditionForSkill(V2_SKILLS.mob_rending_claw)).toEqual({ kind: "always" });
    expect(smartDefaultConditionForSkill(V2_SKILLS.mob_venom_bite)).toEqual({ kind: "always" });
  });

  it("카탈로그에 없는 id 는 안전하게 '항상'", () => {
    const p = smartDefaultPatternFromEquipped(["__nonexistent__"]);
    expect(p.blocks[0].condition).toEqual({ kind: "always" });
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
  it("원소 풀 스킬은 element 보유 / 그 외는 미부여 허용(캐릭터 속성 상속)", () => {
    // 스킬 재설계 — 공용/전문화 스킬은 의도적 elementless: 시전 시 캐릭터가 고른 속성 상속
    // (def.element ?? characterElement). "화염구"도 void 마법사가 쓰면 void 상성.
    // 원소 풀(v2_skill_elem_*)만 속성이 정체성이라 반드시 태깅(회귀 가드).
    for (const s of Object.values(V2_SKILLS)) {
      if (s.monsterOnly) continue;
      if (s.id.startsWith("v2_skill_elem_")) {
        expect(s.element, `${s.id} 원소 스킬인데 element 없음`).toBeTruthy();
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
    const chips = describeV2Skill(V2_SKILLS.v2_skill_strike); // 강타: 대지, coef 1.0
    expect(chips.some((c) => c.includes("공격력×1"))).toBe(true);
    expect(chips).toContain("속성 대지");
  });

  it("디버프 스킬은 적 스탯 감소 칩 + MP 칩", () => {
    // 파쇄 = 병사 계열(×1.0) tier 2 → 기준풀 600 × 7% × 1.4 = 58.8 → "MP 59".
    const chips = describeV2Skill(V2_SKILLS.v2c_warrior_sunder);
    expect(chips.some((c) => c.startsWith("적 활력 −"))).toBe(true);
    expect(chips).toContain("MP 59");
  });

  it("액티브 스킬은 100% 발동도 확률 칩으로 표시", () => {
    const chips = describeV2Skill(V2_SKILLS.v2c_ironknight_guard);
    expect(chips).toContain("발동 100%");
  });

  it("회복 스킬은 계수·피해량 회복·전투당 1회를 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_acolyte_smite)).toContain(
      "회복 잃은 체력 4% + 공격력×0.35 +30~30 (마법)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_darkpriest_reap)).toContain(
      "피해량 14% 회복",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_firstaid)).toContain(
      "전투당 1회",
    );
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

  it("MP 칩 = 고정 절대값 — 계열 차등 + 차수 스케일", () => {
    // 비용 = 기준풀 600 × 7% × 계열 × 차수. 같은 t1 에서 캐스터(×1.3·55) > 병사(×1.0·42):
    expect(describeV2Skill(V2_SKILLS.v2c_mage_fireball)).toContain("MP 55"); // 캐스터 t1
    expect(describeV2Skill(V2_SKILLS.v2c_warrior_strike)).toContain("MP 42"); // 병사 t1
    // 같은 병사 계열에서 차수 스케일 t1(42) < t2(600×7%×1.4=58.8→59):
    expect(describeV2Skill(V2_SKILLS.v2c_warrior_sunder)).toContain("MP 59");
    // 같은 t2 에서 도적(×0.7·41) < 병사(59) — 계열 차등 재확인:
    expect(describeV2Skill(V2_SKILLS.v2c_assassin_ambush)).toContain("MP 41");
    // 무료 스킬(마력탄 mpCost 0)은 MP 칩 생략:
    expect(
      describeV2Skill(V2_SKILLS.v2c_mage_boltcast).some((c) =>
        c.startsWith("MP"),
      ),
    ).toBe(false);
  });
});

describe("spCostOf — SP 로드아웃 코스트 (코어루프)", () => {
  it("코스트는 성능(power)에 비례 — 강타 스타터(dmg 1.0)=4", () => {
    // 강타(attack, dmg 1.0·proc100) = 루브릭 4. 차수가 아니라 effects power 로 도출.
    expect(spCostOf(V2_SKILLS.v2_skill_strike)).toBe(4);
  });

  it("약한 유틸은 싸다 — 회복 스타터=3, 함성=2", () => {
    // 회복(heal 1회) = 3, 함성(짧은 버프) = 2 — 강타(4)보다 싼 예산 옵션.
    expect(spCostOf(V2_SKILLS.v2_skill_recover)).toBe(3);
    expect(spCostOf(V2_SKILLS.v2c_warrior_warcry)).toBe(2);
  });

  it("명시 spCost override 는 루브릭 위로만(max) 적용", () => {
    // 강타 루브릭 = 4. override 7 > 4 → 7. override 0/소수는 무시→루브릭. 5.9→floor 5(>4).
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 7 })).toBe(7);
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 0 })).toBe(4);
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 5.9 })).toBe(5);
  });

  it("카탈로그 모든 스킬 코스트 ≥ 1 (NaN/0 누출 방지)", () => {
    for (const def of Object.values(V2_SKILLS)) {
      const c = spCostOf(def);
      expect(Number.isFinite(c), def.id).toBe(true);
      expect(c, def.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("🔑 트립와이어 — 어떤 스킬도 루브릭 미만으로 underprice 금지 (정체성 붕괴 가드)", () => {
    // override 는 루브릭 "위로만"(아웃라이어 너프) 허용. 아래로 깎으면 값싼+강한 공용으로
    // 직업 무관 유틸 스택 길이 열린다(PR-5 잔여 리스크). 새 스킬/override 가 바닥을 뚫으면 실패.
    for (const def of Object.values(V2_SKILLS)) {
      expect(
        spCostOf(def),
        `${def.id} 가 루브릭(${rubricSpCost(def)}) 미만으로 underprice 됨`,
      ).toBeGreaterThanOrEqual(rubricSpCost(def));
    }
  });
});

describe("레거시 시그니처 id 제거 (P4 은퇴 + 카탈로그 청소)", () => {
  // 구 직업 시그니처(검무·폭풍 화살 등 requireClass 스킬)는 카탈로그에서 제거됐다.
  // 옛 세이브에 박혀있어도 parseV2SkillsState 가 유효 id 가 아니라 안전하게 걸러낸다.
  const REMOVED_SIG = "v2_skill_blade_dance"; // 제거된 레거시 시그니처 id 예.

  it("parseV2SkillsState — 제거된 시그니처 id 는 learned·equipped 에서 모두 탈락, 유효 스킬은 보존", () => {
    const valid = "v2c_warrior_strike"; // 살아있는 공용 스킬
    const parsed = parseV2SkillsState({
      learned: [REMOVED_SIG, valid],
      equipped: [REMOVED_SIG, valid], // 옛 세이브: 제거된 시그니처가 장착돼 있던 상태
    });
    expect(parsed.learned).toEqual([valid]);
    expect(parsed.equipped).toEqual([valid]);
  });

  it("idempotent — 유효 공용 스킬만 있는 equipped 는 그대로", () => {
    const valid = "v2c_mage_fireball";
    const parsed = parseV2SkillsState({ learned: [valid], equipped: [valid] });
    expect(parsed.equipped).toEqual([valid]);
  });
});
