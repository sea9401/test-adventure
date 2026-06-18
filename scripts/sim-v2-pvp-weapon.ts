// v2 PvP 밸런스 sim — 무기 위력/스탯계수 변경이 아레나에 미치는 영향 측정 (일회성 검토용).
//
// 배경: "무기 위력 상향 + ATK_PER_STR↓" (옵션1) 이 PvP 를 어떻게 흔드는지 확인.
//   - equipped vs equipped: 실제 PvP(양측 장비) — 아키타입 라운드로빈 승률.
//   - equipped player vs bot(무장비): 아레나 봇 매치 — 봇은 v2Equipped:{} 라 무기 바닥 0.
//     opt1 은 봇 atk(=STR×계수) 을 무기 보정 없이 너프 → 봇 매치가 쉬워지는지 검증.
//
// 모델: 기본공격 단판(arena/match/route 와 동일 pickAction), 속성 중립 고정(무기 위력 축 격리 —
//   baseline↔opt1 델타라 속성 RPS 는 어차피 상쇄), 스킬 미발동(양측 빈 상태=대칭).
//
// 실행: node --import tsx scripts/sim-v2-pvp-weapon.ts
//   env: LEVELS="50,100"  TRIALS=150

import { resolveBattlePvP } from "../src/adventure/v2/combat/engine-pvp";
import type { PlayerCombat } from "../src/adventure/v2/combat/engine";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import { emptyV2SkillsState } from "../src/adventure/data/v2/v2Skills";
import { BOT_TEMPLATES, buildBot } from "../src/adventure/data/v2/arenaBots";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

type Arch = "STR" | "DEX" | "VIT" | "INT" | "SPI" | "LUK" | "BAL";
const ARCHES: Arch[] = ["STR", "DEX", "VIT", "INT", "SPI", "LUK", "BAL"];

const LEVELS = (process.env.LEVELS ?? "50,100").split(",").map((s) => Number(s.trim()));
const TRIALS = Number(process.env.TRIALS ?? 150);

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level < 10) return 1;
  if (level < 25) return 2;
  if (level < 50) return 3;
  if (level < 75) return 4;
  return 5;
}

// progression sim 과 동일 장비 라인.
const WEAPON_LINE: Record<"sword" | "bow" | "staff", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  sword: { 1: "v2_iron_sword", 2: "v2_greatsword", 3: "v2_greatsword", 4: "v2_mithril_sword", 5: "v2_mithril_sword" },
  bow: { 1: "v2_wooden_bow", 2: "v2_horn_bow", 3: "v2_horn_bow", 4: "v2_starsong_bow", 5: "v2_starsong_bow" },
  staff: { 1: "v2_oak_staff", 2: "v2_obsidian_staff", 3: "v2_obsidian_staff", 4: "v2_starlit_staff", 5: "v2_starlit_staff" },
};
const ARMOR_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_chain_mail", 2: "v2_full_plate", 3: "v2_full_plate", 4: "v2_mithril_plate", 5: "v2_mithril_plate" },
  light: { 1: "v2_leather_armor", 2: "v2_shadow_cloak", 3: "v2_shadow_cloak", 4: "v2_windweave_cloak", 5: "v2_windweave_cloak" },
};
const GLOVES_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_leather_gloves", 2: "v2_shadow_gloves", 3: "v2_shadow_gloves", 4: "v2_windweave_gloves", 5: "v2_windweave_gloves" },
  light: { 1: "v2_leather_gloves", 2: "v2_shadow_gloves", 3: "v2_shadow_gloves", 4: "v2_windweave_gloves", 5: "v2_windweave_gloves" },
};
const BOOTS_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_leather_boots", 2: "v2_shadow_boots", 3: "v2_shadow_boots", 4: "v2_windweave_boots", 5: "v2_windweave_boots" },
  light: { 1: "v2_leather_boots", 2: "v2_shadow_boots", 3: "v2_shadow_boots", 4: "v2_windweave_boots", 5: "v2_windweave_boots" },
};
const RING_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_silver_ring", 2: "v2_lucky_charm", 3: "v2_lucky_charm", 4: "v2_fate_ring", 5: "v2_fate_ring" };
const NECKLACE_LINE: Record<1 | 2 | 3 | 4 | 5, V2EquipmentId> = { 1: "v2_jade_amulet", 2: "v2_crystal_amulet", 3: "v2_crystal_amulet", 4: "v2_mana_essence", 5: "v2_mana_essence" };

function equipFor(arch: Arch, level: number): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const tier = tierForLevel(level);
  const weapon =
    arch === "DEX" ? WEAPON_LINE.bow[tier] : arch === "INT" ? WEAPON_LINE.staff[tier] : WEAPON_LINE.sword[tier];
  const weight: "heavy" | "light" = arch === "STR" || arch === "VIT" || arch === "LUK" ? "heavy" : "light";
  return {
    weapon,
    armor: ARMOR_LINE[weight][tier],
    gloves: GLOVES_LINE[weight][tier],
    boots: BOOTS_LINE[weight][tier],
    ring: RING_LINE[tier],
    necklace: NECKLACE_LINE[tier],
  };
}

const SUB_STAT: Record<V2StatKey, V2StatKey> = { str: "vit", dex: "luk", vit: "str", int: "vit", spi: "vit", luk: "dex" };
const FILL_STAT: Record<V2StatKey, V2StatKey> = { str: "luk", dex: "vit", vit: "luk", int: "luk", spi: "luk", luk: "vit" };
function allocate(arch: Arch, level: number): Record<V2StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
  if (total === 0) return a;
  if (arch === "BAL") {
    a.str = Math.round(total * 0.25);
    a.vit = Math.round(total * 0.25);
    a.dex = Math.round(total * 0.2);
    a.luk = Math.round(total * 0.15);
    a.spi = total - a.str - a.vit - a.dex - a.luk;
    return a;
  }
  const main = arch.toLowerCase() as V2StatKey;
  a[main] = Math.round(total * 0.6);
  a[SUB_STAT[main]] = Math.round(total * 0.3);
  a[FILL_STAT[main]] = total - a[main] - a[SUB_STAT[main]];
  return a;
}

function makePlayer(arch: Arch, level: number): PlayerCombat {
  const d = derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocate(arch, level),
    v2Equipped: equipFor(arch, level),
    hp: undefined,
  });
  return { ...d.player, hp: d.maxHp, attackElement: "neutral", characterElement: "neutral" };
}

const CTX = {
  pickAction: () => ({ kind: "attack" as const }),
  potions: { p1: {}, p2: {} },
  v2Skills: { p1: emptyV2SkillsState(), p2: emptyV2SkillsState() },
};

// p1 관점 결과: 1 = p1 승, 0 = p1 패, 0.5 = 무승부.
function duel(p1: PlayerCombat, p2: PlayerCombat): number {
  const r = resolveBattlePvP({ ...p1, hp: p1.maxHp }, { ...p2, hp: p2.maxHp }, "A", "B", CTX);
  return r.outcome === "p1_win" ? 1 : r.outcome === "p2_win" ? 0 : 0.5;
}

function pad(s: string | number, n: number, left = false): string {
  const str = String(s);
  return left ? str.padStart(n) : str.padEnd(n);
}

console.log(`\nv2 PvP 무기위력 sim — TRIALS=${TRIALS}/매치, 기본공격 단판, 속성 중립`);
console.log(`(현재 코드 상수/위력 값으로 측정 — baseline vs opt1 은 코드 바꿔 두 번 돌려 비교)\n`);

for (const level of LEVELS) {
  const players = Object.fromEntries(ARCHES.map((a) => [a, makePlayer(a, level)])) as Record<Arch, PlayerCombat>;
  const bots = BOT_TEMPLATES.map((t) => {
    const b = buildBot(t, level);
    return { name: t.name, p: { ...b.combat.player, hp: b.combat.maxHp, attackElement: "neutral" as const, characterElement: "neutral" as const } };
  });

  // ── equipped 라운드로빈 ──
  const rrScore: Record<Arch, { w: number; n: number }> = Object.fromEntries(ARCHES.map((a) => [a, { w: 0, n: 0 }])) as Record<Arch, { w: number; n: number }>;
  for (const a of ARCHES) {
    for (const b of ARCHES) {
      if (a === b) continue;
      for (let t = 0; t < TRIALS; t++) {
        const res = duel(players[a], players[b]);
        rrScore[a].w += res;
        rrScore[a].n += 1;
      }
    }
  }

  // ── equipped vs bot(무장비) ──
  const vsBot: Record<Arch, { w: number; n: number }> = Object.fromEntries(ARCHES.map((a) => [a, { w: 0, n: 0 }])) as Record<Arch, { w: number; n: number }>;
  for (const a of ARCHES) {
    for (const bot of bots) {
      for (let t = 0; t < TRIALS; t++) {
        vsBot[a].w += duel(players[a], bot.p);
        vsBot[a].n += 1;
      }
    }
  }

  console.log(`━━━ Lv${level} (T${tierForLevel(level)} 장비) ━━━`);
  console.log(`${pad("Arch", 6)}${pad("atk", 6, true)}${pad("magАtk", 7, true)}${pad("def", 6, true)}${pad("maxHp", 7, true)}${pad("spd", 6, true)} │ ${pad("PvP승률", 9, true)}${pad("vs봇", 8, true)}`);
  for (const a of ARCHES) {
    const p = players[a];
    const rr = ((rrScore[a].w / rrScore[a].n) * 100).toFixed(0);
    const vb = ((vsBot[a].w / vsBot[a].n) * 100).toFixed(0);
    console.log(
      `${pad(a, 6)}${pad(p.atk, 6, true)}${pad((p.magicAtk ?? 0), 7, true)}${pad(p.def, 6, true)}${pad(p.maxHp, 7, true)}${pad(p.spd ?? 0, 6, true)} │ ${pad(rr + "%", 9, true)}${pad(vb + "%", 8, true)}`,
    );
  }
  console.log("");
}
console.log("해석: PvP승률 = 7아키타입 라운드로빈 평균(50%=균형). vs봇 = 무장비 봇 7종 상대 평균(높을수록 봇 매치 쉬움).\n");
