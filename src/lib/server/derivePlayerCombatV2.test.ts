// derivePlayerCombatV2 자체는 db 의존이라 단위 테스트가 어렵다.
// PR-1 의 핵심 (V2_EQUIPMENT 의 stats 가 derive 결과에 합산) 은 v2ToDeriveItem 결과를
// 라이브 derivePlayerCombat 에 직접 넣어 검증 — db 우회.

import { describe, expect, it } from "vitest";
import { pickV2OrLiveSlots, v2ToDeriveItem } from "./derivePlayerCombatV2";
import {
  derivePlayerCombat,
  type EquippedItemForDerive,
} from "@/adventure/character/derivePlayerCombat";
import { baseCharacter } from "@/adventure/character/defaults";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

function emptyStats(): Record<StatKey, number> {
  return STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = 0;
      return acc;
    },
    {} as Record<StatKey, number>,
  );
}

function deriveBase(equipped: {
  weapon?: ReturnType<typeof v2ToDeriveItem> | null;
  armor?: ReturnType<typeof v2ToDeriveItem> | null;
  accessory?: ReturnType<typeof v2ToDeriveItem> | null;
}) {
  return derivePlayerCombat({
    level: 1,
    baseStats: baseCharacter.stats,
    allocatedStats: emptyStats(),
    equipped: {
      weapon: equipped.weapon ?? null,
      armor: equipped.armor ?? null,
      accessory: equipped.accessory ?? null,
    },
    equippedSkills: undefined,
    storyFlagIds: new Set<string>(),
    hp: 100,
    paragonAllocations: {},
  });
}

describe("v2ToDeriveItem", () => {
  it("이름/슬롯/bonus 를 그대로 옮긴다", () => {
    const sword = v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword);
    expect(sword.name).toBe("철검");
    expect(sword.slot).toBe("weapon");
    expect(sword.bonus).toEqual({ str: 5, atk: 3 });
  });

  it("bonus 가 원본을 mutate 하지 않는 사본이어야 함", () => {
    const sword = v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword);
    expect(sword.bonus).not.toBe(V2_EQUIPMENT.v2_iron_sword.stats);
  });

  it("derive 표시용 stats 배열은 비어 있다 (UI 가 V2_EQUIPMENT 를 직접 본다)", () => {
    const sword = v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword);
    expect(sword.stats).toEqual([]);
  });

  it("enchantSlots 는 박지 않는다 (v2 결정: 마법부여 폐기)", () => {
    const sword = v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword);
    expect(sword.enchantSlots).toBeUndefined();
  });
});

describe("derivePlayerCombat + v2 장비 합산", () => {
  it("장비 미장착 baseline 보다 철검 장착이 str·atk 가 늘어남", () => {
    const baseline = deriveBase({});
    const withSword = deriveBase({
      weapon: v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword),
    });

    // V2_iron_sword.stats = { str: 5, atk: 3 }
    expect(withSword.totalStats.str).toBe(baseline.totalStats.str + 5);
    expect(withSword.player.atk).toBeGreaterThanOrEqual(baseline.player.atk + 3);
  });

  it("baseAllocatedStats 는 장비 영향을 받지 않는다 (UI base 표시)", () => {
    const baseline = deriveBase({});
    const withSword = deriveBase({
      weapon: v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword),
    });
    expect(withSword.baseAllocatedStats).toEqual(baseline.baseAllocatedStats);
  });

  it("쇠사슬 갑옷 장착 시 vit + def 가 늘어남", () => {
    const baseline = deriveBase({});
    const withMail = deriveBase({
      armor: v2ToDeriveItem(V2_EQUIPMENT.v2_chain_mail),
    });
    // chain_mail = { vit: 5, def: 6 }
    expect(withMail.totalStats.vit).toBe(baseline.totalStats.vit + 5);
    expect(withMail.player.def).toBeGreaterThanOrEqual(baseline.player.def + 6);
  });

  it("vit + 으로 maxHp 가 늘어난다 (VIT 1pt = +3 hp)", () => {
    const baseline = deriveBase({});
    const withMail = deriveBase({
      armor: v2ToDeriveItem(V2_EQUIPMENT.v2_chain_mail),
    });
    // chain_mail.vit = 5 → maxHp 최소 +15
    expect(withMail.maxHp).toBeGreaterThanOrEqual(baseline.maxHp + 15);
  });

  it("3슬롯 동시 장착의 효과가 합산", () => {
    const baseline = deriveBase({});
    const full = deriveBase({
      weapon: v2ToDeriveItem(V2_EQUIPMENT.v2_iron_sword), // str+5 atk+3
      armor: v2ToDeriveItem(V2_EQUIPMENT.v2_chain_mail), // vit+5 def+6
      accessory: v2ToDeriveItem(V2_EQUIPMENT.v2_silver_ring), // luk+3 dex+1
    });

    expect(full.totalStats.str).toBe(baseline.totalStats.str + 5);
    expect(full.totalStats.vit).toBe(baseline.totalStats.vit + 5);
    expect(full.totalStats.luk).toBe(baseline.totalStats.luk + 3);
    expect(full.totalStats.dex).toBe(baseline.totalStats.dex + 1);
    // baseAllocatedStats 는 영향 X
    expect(full.baseAllocatedStats).toEqual(baseline.baseAllocatedStats);
  });

  it("int 장비 장착 시 maxMp 가 늘어난다 (INT 1pt = MP 10)", () => {
    const baseline = deriveBase({});
    const withStaff = deriveBase({
      weapon: v2ToDeriveItem(V2_EQUIPMENT.v2_oak_staff), // int+5 atk+1
    });
    // int 5 → maxMp +50. derive 결과의 maxMp 는 optional 이지만 INT 합산 시 항상 정의됨.
    expect(withStaff.player.maxMp ?? 0).toBe((baseline.player.maxMp ?? 0) + 50);
  });
});

// 라이브 잔존 슬롯 + v2 슬롯 병합 우선순위 — 마이그레이션 중간 상태 안전성.
describe("pickV2OrLiveSlots — v2/라이브 슬롯 병합 우선순위", () => {
  const liveDagger: EquippedItemForDerive = {
    name: "live dagger",
    slot: "weapon",
    stats: [],
    bonus: { str: 7, atk: 4 },
  };
  const liveCloak: EquippedItemForDerive = {
    name: "live cloak",
    slot: "armor",
    stats: [],
    bonus: { vit: 2, def: 2 },
  };
  const liveCharm: EquippedItemForDerive = {
    name: "live charm",
    slot: "accessory",
    stats: [],
    bonus: { luk: 2 },
  };
  const emptyLive = { weapon: null, armor: null, accessory: null };

  it("v2 save 가 빈 객체면 라이브 슬롯이 그대로 유지", () => {
    const out = pickV2OrLiveSlots(
      {},
      { weapon: liveDagger, armor: liveCloak, accessory: liveCharm },
    );
    expect(out.weapon).toBe(liveDagger);
    expect(out.armor).toBe(liveCloak);
    expect(out.accessory).toBe(liveCharm);
  });

  it("v2 weapon + 라이브 weapon 충돌 시 v2 가 우선", () => {
    const out = pickV2OrLiveSlots(
      { weapon: "v2_iron_sword" },
      { weapon: liveDagger, armor: null, accessory: null },
    );
    expect(out.weapon?.bonus).toEqual({ str: 5, atk: 3 }); // v2 iron_sword
    expect(out.weapon).not.toBe(liveDagger);
  });

  it("v2 armor 만 있고 라이브 weapon 이 있으면 두 슬롯 다 유지 (서로 다른 슬롯)", () => {
    const out = pickV2OrLiveSlots(
      { armor: "v2_chain_mail" },
      { weapon: liveDagger, armor: null, accessory: liveCharm },
    );
    // 라이브 weapon 유지
    expect(out.weapon).toBe(liveDagger);
    // v2 armor 적용
    expect(out.armor?.bonus).toEqual({ vit: 5, def: 6 });
    // 라이브 accessory 유지
    expect(out.accessory).toBe(liveCharm);
  });

  it("v2 슬롯만 있고 라이브 전부 비면 v2 만 채워짐", () => {
    const out = pickV2OrLiveSlots(
      { weapon: "v2_iron_sword", accessory: "v2_silver_ring" },
      emptyLive,
    );
    expect(out.weapon?.bonus).toEqual({ str: 5, atk: 3 });
    expect(out.armor).toBeNull();
    expect(out.accessory?.bonus).toEqual({ luk: 3, dex: 1 });
  });
});
