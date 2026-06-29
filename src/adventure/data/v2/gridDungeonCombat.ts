import type { Monster } from "@/adventure/data/monsters/types";
import type { StatKey } from "@/adventure/data/stats";
import {
  evaluateCombatPattern,
  type V2CombatPattern,
  type V2CombatRole,
} from "@/adventure/v2/combat/combatPattern";
import {
  V2_SKILLS,
  v2SkillMpCostValue,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import type {
  GridDungeonCombatPartyMember,
  GridDungeonSupporterSnapshot,
  GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";

export const GRID_DUNGEON_PARTY_SCALING: Partial<
  Record<GridDungeonTileKind, { hpPerSupporter: number; atkPerSupporter: number }>
> = {
  monster: { hpPerSupporter: 0.35, atkPerSupporter: 0.12 },
  elite: { hpPerSupporter: 0.55, atkPerSupporter: 0.2 },
  boss: { hpPerSupporter: 0.35, atkPerSupporter: 0.18 },
};

export type GridDungeonPartyActor = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  magicAtk: number;
  def: number;
  spd: number;
  healMult: number;
  isMain: boolean;
  skills: string[];
  pattern?: V2CombatPattern;
  cooldowns: Partial<Record<V2SkillId, number>>;
  usedOnceSkills: Set<V2SkillId>;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  skillUses: Record<string, number>;
};

export type GridDungeonPartyCombatResult = {
  outcome: "win" | "lose";
  turns: number;
  playerMaxHp: number;
  playerHpAfter: number;
  enemyHp: number;
  enemyMaxHp: number;
  party: GridDungeonCombatPartyMember[];
  log: string[];
};

function partyActionInterval(spd: number): number {
  return 100 / Math.max(1, spd);
}

function partyDamage(atk: number, def: number): number {
  return Math.max(1, Math.round(atk - def * 0.45));
}

function tickPartyCooldowns(actor: GridDungeonPartyActor) {
  const next: Partial<Record<V2SkillId, number>> = {};
  for (const [skillId, turns] of Object.entries(actor.cooldowns)) {
    const left = Math.max(0, Math.floor(Number(turns) || 0) - 1);
    if (left > 0) next[skillId as V2SkillId] = left;
  }
  actor.cooldowns = next;
}

function partySkillRole(role: V2CombatRole, actor: GridDungeonPartyActor): string | null {
  for (const skillId of actor.skills) {
    const def = V2_SKILLS[skillId as V2SkillId];
    if (!def || def.category === "passive") continue;
    if (role === "main_attack" && def.category !== "attack") continue;
    if (role !== "main_attack" && def.category !== role) continue;
    return skillId;
  }
  return null;
}

function partyPatternCtx({
  actor,
  party,
  enemyHp,
  enemyMaxHp,
  turn,
}: {
  actor: GridDungeonPartyActor;
  party: GridDungeonPartyActor[];
  enemyHp: number;
  enemyMaxHp: number;
  turn: number;
}) {
  const lowestHpPct = Math.min(
    ...party
      .filter((member) => member.hp > 0)
      .map((member) => (member.hp / member.maxHp) * 100),
    (actor.hp / actor.maxHp) * 100,
  );
  return {
    selfHpPct: lowestHpPct,
    selfMpPct: actor.maxMp > 0 ? (actor.mp / actor.maxMp) * 100 : 100,
    selfBuffStats: new Set<StatKey>(),
    selfBuffPctTargets: new Set<"evasion" | "crit" | "damageReduction">(),
    enemyHpPct: (enemyHp / enemyMaxHp) * 100,
    enemyBleed: 0,
    enemyPoison: 0,
    enemyVuln: 0,
    turn,
  };
}

function choosePartySkill({
  actor,
  party,
  enemyHp,
  enemyMaxHp,
  turn,
}: {
  actor: GridDungeonPartyActor;
  party: GridDungeonPartyActor[];
  enemyHp: number;
  enemyMaxHp: number;
  turn: number;
}): V2SkillId | null {
  const pattern = actor.pattern;
  if (!pattern || pattern.blocks.length === 0) return null;
  const equipped = new Set(actor.skills);
  const isUsable = (skillId: string) => {
    const def = V2_SKILLS[skillId as V2SkillId];
    const cost = def ? v2SkillMpCostValue(def) : 0;
    return (
      equipped.has(skillId) &&
      !!def &&
      def.category !== "passive" &&
      def.effects.some((effect) => effect.kind === "damage" || effect.kind === "heal") &&
      !(
        def.effects.some((effect) => effect.kind === "heal" && effect.oncePerCombat) &&
        actor.usedOnceSkills.has(skillId as V2SkillId)
      ) &&
      (actor.cooldowns[skillId as V2SkillId] ?? 0) <= 0 &&
      actor.mp >= cost
    );
  };
  return evaluateCombatPattern(
    pattern,
    partyPatternCtx({ actor, party, enemyHp, enemyMaxHp, turn }),
    isUsable,
    (role) => partySkillRole(role, actor),
  ) as V2SkillId | null;
}

function partySkillDamage(
  actor: GridDungeonPartyActor,
  enemyDef: number,
  skillId: V2SkillId,
): number {
  const def = V2_SKILLS[skillId];
  if (!def) return 0;
  let total = 0;
  for (const effect of def.effects) {
    if (effect.kind !== "damage") continue;
    const base =
      effect.scaling === "magic"
        ? actor.magicAtk
        : effect.scaling === "def"
          ? actor.def
          : actor.atk;
    const flat =
      effect.baseFlat ??
      (effect.baseFlatByTier ? effect.baseFlatByTier[0] : 0);
    total += partyDamage(Math.round(base * effect.statCoef + flat), enemyDef);
  }
  return total;
}

function partySkillHeal(
  actor: GridDungeonPartyActor,
  target: GridDungeonPartyActor,
  skillId: V2SkillId,
): number {
  const def = V2_SKILLS[skillId];
  if (!def) return 0;
  let total = 0;
  for (const effect of def.effects) {
    if (effect.kind !== "heal") continue;
    const missing = Math.max(0, target.maxHp - target.hp);
    total +=
      Math.floor(target.maxHp * ((effect.pctMaxHp ?? 0) / 100)) +
      Math.floor(missing * ((effect.pctLostHp ?? 0) / 100)) +
      (effect.flat ?? 0);
  }
  return Math.max(0, Math.floor(total * actor.healMult));
}

function partySkillHealTarget(
  actor: GridDungeonPartyActor,
  party: GridDungeonPartyActor[],
  skillId: V2SkillId,
): GridDungeonPartyActor {
  const def = V2_SKILLS[skillId];
  const canHealAlly = def?.effects.some(
    (effect) => effect.kind === "heal" && effect.target === "ally",
  );
  if (!canHealAlly) return actor;
  return party
    .filter((member) => member.hp > 0)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? actor;
}

function partySkillCooldownAfterCast(skillId: V2SkillId): number {
  const def = V2_SKILLS[skillId];
  if (!def) return 0;
  return def.effects.some((effect) => effect.kind === "heal" && effect.oncePerCombat)
    ? 9999
    : def.cooldown;
}

function recordPartySkillUse(actor: GridDungeonPartyActor, skillName: string) {
  actor.skillUses[skillName] = (actor.skillUses[skillName] ?? 0) + 1;
}

export function makeGridDungeonPartyActor({
  id,
  name,
  maxHp,
  mp = 0,
  maxMp = 0,
  atk,
  magicAtk = 0,
  def,
  spd,
  healMult = 1,
  isMain,
  skills = [],
  pattern,
}: {
  id: string;
  name: string;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  atk: number;
  magicAtk?: number;
  def: number;
  spd: number;
  healMult?: number;
  isMain: boolean;
  skills?: string[];
  pattern?: V2CombatPattern;
}): GridDungeonPartyActor {
  return {
    id,
    name,
    hp: maxHp,
    maxHp,
    mp,
    maxMp,
    atk,
    magicAtk,
    def,
    spd,
    healMult,
    isMain,
    skills,
    pattern,
    cooldowns: {},
    usedOnceSkills: new Set<V2SkillId>(),
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    skillUses: {},
  };
}

export function resolveGridDungeonPartyCombat({
  main,
  supporters,
  enemy,
  scaling,
}: {
  main: GridDungeonPartyActor;
  supporters: GridDungeonSupporterSnapshot[];
  enemy: Monster;
  scaling: { hpPerSupporter: number; atkPerSupporter: number };
}): GridDungeonPartyCombatResult {
  const party: GridDungeonPartyActor[] = [
    main,
    ...supporters.map((supporter) =>
      makeGridDungeonPartyActor({
        id: supporter.userId,
        name: supporter.name,
        maxHp: supporter.maxHp,
        mp: supporter.mp,
        maxMp: supporter.maxMp,
        atk: supporter.atk,
        magicAtk: supporter.magicAtk,
        def: supporter.def,
        spd: supporter.spd,
        healMult: supporter.healMult,
        isMain: false,
        skills: supporter.skills,
        pattern: supporter.pattern,
      }),
    ),
  ];
  const enemyMaxHp = Math.max(
    1,
    Math.round(enemy.hp * (1 + supporters.length * scaling.hpPerSupporter)),
  );
  let enemyHp = enemyMaxHp;
  const enemyAtk = Math.max(
    1,
    Math.round(enemy.atk * (1 + supporters.length * scaling.atkPerSupporter)),
  );
  const enemyDef = Math.max(0, enemy.def);
  const ticks = new Map<string, number>();
  for (const actor of party) ticks.set(actor.id, 0);
  ticks.set("enemy", partyActionInterval(enemy.spd));
  const log: string[] = [];
  let actions = 0;
  let turns = 0;
  let enemyActions = 0;

  while (actions < 400 && enemyHp > 0 && party[0].hp > 0) {
    const aliveParty = party.filter((actor) => actor.hp > 0);
    if (aliveParty.length === 0) break;
    const next = [...aliveParty.map((actor) => actor.id), "enemy"]
      .map((id) => ({ id, tick: ticks.get(id) ?? 0 }))
      .sort((a, b) => a.tick - b.tick || (a.id === "enemy" ? 1 : -1))[0];
    actions += 1;
    if (next.id === "enemy") {
      enemyActions += 1;
      const livingSupporters = party.filter((actor) => !actor.isMain && actor.hp > 0);
      const target =
        enemyActions % 2 === 1 || livingSupporters.length === 0
          ? party[0]
          : livingSupporters.sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
      const damage = partyDamage(enemyAtk, target.def);
      target.hp = Math.max(0, target.hp - damage);
      target.damageTaken += damage;
      log.push(`${enemy.name}이(가) ${target.name}에게 ${damage.toLocaleString()} 피해`);
      ticks.set("enemy", (ticks.get("enemy") ?? 0) + partyActionInterval(enemy.spd));
      continue;
    }

    const actor = party.find((candidate) => candidate.id === next.id);
    if (!actor || actor.hp <= 0) continue;
    tickPartyCooldowns(actor);
    const skillId = choosePartySkill({
      actor,
      party,
      enemyHp,
      enemyMaxHp,
      turn: turns + 1,
    });
    const skill = skillId ? V2_SKILLS[skillId] : null;
    if (skill?.category === "heal" && skillId) {
      const target = partySkillHealTarget(actor, aliveParty, skillId);
      const heal = partySkillHeal(actor, target, skillId);
      if (heal > 0) {
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + heal);
        const healed = target.hp - before;
        actor.mp = Math.max(0, actor.mp - v2SkillMpCostValue(skill));
        actor.usedOnceSkills.add(skillId);
        actor.healingDone += healed;
        recordPartySkillUse(actor, skill.name);
        const cooldown = partySkillCooldownAfterCast(skillId);
        if (cooldown > 0) actor.cooldowns[skillId] = cooldown;
        log.push(
          `${actor.name}이(가) ${skill.name}(으)로 ${target.name} HP +${healed.toLocaleString()}`,
        );
        ticks.set(actor.id, (ticks.get(actor.id) ?? 0) + partyActionInterval(actor.spd));
        turns += 1;
        continue;
      }
    }
    const skillDamage =
      skill?.category === "attack" && skillId
        ? partySkillDamage(actor, enemyDef, skillId)
        : 0;
    const damage = skillDamage > 0 ? skillDamage : partyDamage(actor.atk, enemyDef);
    enemyHp = Math.max(0, enemyHp - damage);
    actor.damageDealt += damage;
    if (skillDamage > 0 && skillId && skill) {
      actor.mp = Math.max(0, actor.mp - v2SkillMpCostValue(skill));
      recordPartySkillUse(actor, skill.name);
      const cooldown = partySkillCooldownAfterCast(skillId);
      if (cooldown > 0) actor.cooldowns[skillId] = cooldown;
      log.push(
        `${actor.name}이(가) ${skill.name}(으)로 ${enemy.name}에게 ${damage.toLocaleString()} 피해`,
      );
    } else {
      log.push(`${actor.name}이(가) ${enemy.name}에게 ${damage.toLocaleString()} 피해`);
    }
    ticks.set(actor.id, (ticks.get(actor.id) ?? 0) + partyActionInterval(actor.spd));
    turns += 1;
  }

  return {
    outcome: enemyHp <= 0 ? "win" : "lose",
    turns,
    playerMaxHp: main.maxHp,
    playerHpAfter: party[0].hp,
    enemyHp,
    enemyMaxHp,
    party: party.map((actor) => ({
      id: actor.id,
      name: actor.name,
      role: actor.isMain ? "main" : "supporter",
      hpAfter: actor.hp,
      maxHp: actor.maxHp,
      damageDealt: actor.damageDealt,
      damageTaken: actor.damageTaken,
      healingDone: actor.healingDone,
      skillUses: actor.skillUses,
    })),
    log: log.slice(-6),
  };
}
