import type {
  SignatureEffect,
  Tier6UniqueMechanic,
} from "@/adventure/data/v2/v2Equipment";

export type Tier6CoreMechanic =
  | "gravity"
  | "bleed"
  | "pursuit"
  | "shadow"
  | "venom"
  | "overload"
  | "sanctuary";

export type Tier6EventOrigin = {
  actionId: number;
  eventId: number;
  generatedBy?: Tier6UniqueMechanic;
  bonusAction?: boolean;
};

export type Tier6UniqueRuntimeState = {
  gravityReprisal: number;
  bleedBurstLastActionId: number | null;
  pursuitMarks: number;
  shadowEchoes: number;
  arcaneOverload: number;
  sanctuaryReserve: number;
  unityMechanics: Tier6CoreMechanic[];
  galeEvents: Array<"hit" | "crit" | "dodge">;
  heartCounts: Partial<Record<Tier6CoreMechanic, number>>;
  dominantMechanic: Tier6CoreMechanic | null;
  nextDirectDamagePct: number;
  nextHealPct: number;
  nextShieldPct: number;
  nextDirectFixedDamage: number;
};

export type Tier6UniqueEvent =
  | {
      kind: "shield_broken";
      shieldBefore: number;
      overflowDamage: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "shield_gained";
      amount: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "action_start";
      shield: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "direct_hit";
      damage: number;
      crit: boolean;
      attackKind: "basic" | "skill";
      paidMp: number;
      statusKinds: number;
      bleedStacks: number;
      bleedRemainingDamage: number;
      poisonStacks: number;
      poisonRemainingDamage: number;
      magicAtk: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | { kind: "direct_miss"; origin: Tier6EventOrigin }
  | { kind: "dodge"; origin: Tier6EventOrigin }
  | {
      kind: "mp_spent";
      amount: number;
      magicAtk: number;
      targetHasStatus: boolean;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "heal_calculated";
      amount: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "hp_threshold";
      currentHp: number;
      maxHp: number;
      origin: Tier6EventOrigin;
    }
  | {
      kind: "signature_damage";
      mechanic: Tier6UniqueMechanic;
      damage: number;
      origin: Tier6EventOrigin;
    };

type CommandBase = {
  label: string;
  mechanic: Tier6UniqueMechanic;
};

export type Tier6UniqueCommand =
  | (CommandBase & { kind: "damage_fixed"; amount: number })
  | (CommandBase & { kind: "damage_magic"; amount: number })
  | (CommandBase & { kind: "shield"; amount: number })
  | (CommandBase & { kind: "heal"; amount: number })
  | (CommandBase & { kind: "mp"; amount: number })
  | (CommandBase & {
      kind: "consume_dot";
      dot: "bleed" | "poison";
      stacks: number;
    })
  | (CommandBase & {
      kind: "apply_dot";
      dot: "bleed" | "poison";
      stacks: number;
    })
  | (CommandBase & { kind: "def_debuff"; pct: number; actions: number })
  | (CommandBase & { kind: "mdef_debuff"; pct: number; actions: number })
  | (CommandBase & { kind: "extra_action"; amount: 1 })
  | (CommandBase & {
      kind: "unity_buff";
      attackPct: number;
      healPct: number;
      actions: number;
    });

export type Tier6UniqueResolution = {
  state: Tier6UniqueRuntimeState;
  commands: Tier6UniqueCommand[];
};

const CORE_MECHANICS: Record<Tier6CoreMechanic, Tier6UniqueMechanic> = {
  gravity: "gravity_reprisal",
  bleed: "bleed_burst",
  pursuit: "pursuit_mark",
  shadow: "shadow_echo",
  venom: "venom_burst",
  overload: "arcane_overload",
  sanctuary: "sanctuary_reserve",
};

export function initialTier6UniqueRuntime(): Tier6UniqueRuntimeState {
  return {
    gravityReprisal: 0,
    bleedBurstLastActionId: null,
    pursuitMarks: 0,
    shadowEchoes: 0,
    arcaneOverload: 0,
    sanctuaryReserve: 0,
    unityMechanics: [],
    galeEvents: [],
    heartCounts: {},
    dominantMechanic: null,
    nextDirectDamagePct: 0,
    nextHealPct: 0,
    nextShieldPct: 0,
    nextDirectFixedDamage: 0,
  };
}

export function hasTier6Unique(
  signatures: SignatureEffect[] | undefined,
): boolean {
  return signatures?.some(
    (signature) =>
      signature.trigger === "tier6_unique" && Boolean(signature.mechanic),
  ) ?? false;
}

function mechanicsOf(
  signatures: SignatureEffect[] | undefined,
): Set<Tier6UniqueMechanic> {
  const mechanics = new Set<Tier6UniqueMechanic>();
  for (const signature of signatures ?? []) {
    if (signature.trigger === "tier6_unique" && signature.mechanic) {
      mechanics.add(signature.mechanic);
    }
  }
  return mechanics;
}

function finite(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function commandAmount(value: number): number {
  return Math.max(0, Math.floor(finite(value)));
}

export function resolveTier6UniqueEvent(
  signatures: SignatureEffect[] | undefined,
  current: Tier6UniqueRuntimeState | undefined,
  event: Tier6UniqueEvent,
): Tier6UniqueResolution {
  const equipped = mechanicsOf(signatures);
  if (equipped.size === 0) {
    return { state: current ?? initialTier6UniqueRuntime(), commands: [] };
  }
  let state = sanitizeState(current);
  const commands: Tier6UniqueCommand[] = [];
  const owns = (mechanic: Tier6UniqueMechanic) =>
    equipped.has(mechanic) && event.origin.generatedBy !== mechanic;
  const dominantScale = (core: Tier6CoreMechanic) =>
    state.dominantMechanic === core ? 1.35 : 1;

  const recordCore = (core: Tier6CoreMechanic) => {
    if (equipped.has("mechanic_unity")) {
      const unity = state.unityMechanics.includes(core)
        ? state.unityMechanics
        : [...state.unityMechanics, core];
      if (unity.length >= 3) {
        commands.push({
          kind: "unity_buff",
          mechanic: "mechanic_unity",
          label: "합일",
          attackPct: 18,
          healPct: 18,
          actions: 3,
        });
        state = { ...state, unityMechanics: [] };
      } else {
        state = { ...state, unityMechanics: unity };
      }
    }
    if (equipped.has("dominant_heart")) {
      const nextCount = finite((state.heartCounts[core] ?? 0) + 1, 0, 1_000_000);
      const heartCounts = { ...state.heartCounts, [core]: nextCount };
      state = {
        ...state,
        heartCounts,
        dominantMechanic:
          state.dominantMechanic ?? (nextCount >= 3 ? core : null),
      };
    }
  };

  const applySignatureDamageLinks = (
    mechanic: Tier6UniqueMechanic,
    damage: number,
    allowConfluence = true,
  ) => {
    const core = coreForMechanic(mechanic);
    if (equipped.has("triphase_link") && event.origin.generatedBy !== "triphase_link") {
      if (core === "gravity" || core === "bleed" || core === "venom") {
        state = {
          ...state,
          pursuitMarks: finite(state.pursuitMarks + 1, 0, 5),
        };
      }
      if (core === "pursuit" || core === "shadow" || core === "overload") {
        state = {
          ...state,
          sanctuaryReserve: finite(
            state.sanctuaryReserve + damage * 0.1,
            0,
          ),
        };
      }
    }
    if (
      allowConfluence &&
      equipped.has("storm_confluence") &&
      event.origin.generatedBy !== "storm_confluence"
    ) {
      state = {
        ...state,
        nextHealPct: Math.min(60, state.nextHealPct + 12),
        nextShieldPct: Math.min(60, state.nextShieldPct + 12),
      };
    }
  };

  const emitDamage = (
    mechanic: Tier6UniqueMechanic,
    label: string,
    amount: number,
    core: Tier6CoreMechanic,
    allowConfluence = true,
  ) => {
    const dealt = commandAmount(amount);
    if (dealt <= 0) return;
    commands.push({ kind: "damage_fixed", mechanic, label, amount: dealt });
    applySignatureDamageLinks(mechanic, dealt, allowConfluence);
    recordCore(core);
  };

  const emitMagicDamage = (
    mechanic: Tier6UniqueMechanic,
    label: string,
    amount: number,
    core: Tier6CoreMechanic,
  ) => {
    const dealt = commandAmount(amount);
    if (dealt <= 0) return;
    commands.push({ kind: "damage_magic", mechanic, label, amount: dealt });
    recordCore(core);
  };

  const noteGale = (galeEvent: "hit" | "crit" | "dodge") => {
    if (!owns("gale_circuit") || state.galeEvents.includes(galeEvent)) return;
    const galeEvents = [...state.galeEvents, galeEvent];
    if (galeEvents.length === 3) {
      commands.push({
        kind: "extra_action",
        mechanic: "gale_circuit",
        label: "질풍 연계",
        amount: 1,
      });
      state = { ...state, galeEvents: [] };
    } else {
      state = { ...state, galeEvents };
    }
  };

  if (event.kind === "signature_damage") {
    if (event.origin.generatedBy === event.mechanic) {
      return { state, commands };
    }
    applySignatureDamageLinks(event.mechanic, finite(event.damage));
    return { state: sanitizeState(state), commands };
  }

  if (event.kind === "shield_broken" && owns("gravity_reprisal")) {
    state = {
      ...state,
      gravityReprisal: finite(
        state.gravityReprisal +
          (finite(event.shieldBefore) + finite(event.overflowDamage)) *
            0.35 *
            dominantScale("gravity"),
        0,
        finite(event.maxHp),
      ),
    };
  }

  if (event.kind === "shield_gained") {
    if (owns("gravity_feedback")) {
      state = {
        ...state,
        gravityReprisal: finite(
          state.gravityReprisal + event.amount * 0.2 * dominantScale("gravity"),
          0,
          finite(event.maxHp),
        ),
      };
    }
    if (state.nextShieldPct > 0 && event.origin.generatedBy !== "storm_confluence") {
      const amount = commandAmount((event.amount * state.nextShieldPct) / 100);
      state = { ...state, nextShieldPct: 0 };
      if (amount > 0) {
        commands.push({
          kind: "shield",
          mechanic: "storm_confluence",
          label: "폭풍 합류",
          amount,
        });
      }
    }
    if (
      event.origin.generatedBy &&
      event.origin.generatedBy !== "storm_confluence" &&
      equipped.has("storm_confluence")
    ) {
      state = {
        ...state,
        nextDirectDamagePct: Math.min(60, state.nextDirectDamagePct + 12),
      };
    }
  }

  if (event.kind === "action_start" && owns("shield_conversion")) {
    const shield = finite(event.shield);
    const consumed = commandAmount(shield * 0.1);
    if (consumed > 0) {
      commands.push({
        kind: "shield",
        mechanic: "shield_conversion",
        label: "부유성채 동력 전환",
        amount: -consumed,
      });
      state = {
        ...state,
        nextDirectFixedDamage: finite(
          state.nextDirectFixedDamage +
            consumed * (shield >= finite(event.maxHp) * 0.2 ? 2 : 1),
        ),
      };
    }
  }

  if (event.kind === "direct_miss" && owns("pursuit_mark")) {
    state = { ...state, pursuitMarks: 0 };
  }

  if (event.kind === "dodge") {
    if (owns("shadow_echo")) {
      state = {
        ...state,
        shadowEchoes: Math.min(3, state.shadowEchoes + dominantScale("shadow")),
      };
    }
    noteGale("dodge");
  }

  if (event.kind === "direct_hit") {
    if (state.nextDirectFixedDamage > 0) {
      emitDamage(
        "shield_conversion",
        "부유성채 동력탄",
        state.nextDirectFixedDamage,
        "gravity",
      );
      state = { ...state, nextDirectFixedDamage: 0 };
    }
    if (state.nextDirectDamagePct > 0) {
      const pct = state.nextDirectDamagePct;
      state = { ...state, nextDirectDamagePct: 0 };
      emitDamage(
        "storm_confluence",
        "폭풍 합류",
        event.damage * (pct / 100),
        "pursuit",
        false,
      );
    }

    if (state.gravityReprisal > 0 && owns("gravity_reprisal")) {
      const amount = state.gravityReprisal;
      state = { ...state, gravityReprisal: 0 };
      emitDamage("gravity_reprisal", "중력 반발", amount, "gravity");
      if (owns("gravity_feedback")) {
        const shield = commandAmount(event.maxHp * 0.05 * dominantScale("gravity"));
        commands.push({
          kind: "shield",
          mechanic: "gravity_feedback",
          label: "반중력 보호막",
          amount: shield,
        });
        if (equipped.has("storm_confluence")) {
          state = {
            ...state,
            nextDirectDamagePct: Math.min(60, state.nextDirectDamagePct + 12),
          };
        }
      }
    }

    if (
      event.attackKind === "basic" &&
      event.bleedStacks > 0 &&
      (state.bleedBurstLastActionId == null ||
        event.origin.actionId - state.bleedBurstLastActionId >= 4) &&
      owns("bleed_burst")
    ) {
      state = {
        ...state,
        bleedBurstLastActionId: Math.floor(finite(event.origin.actionId)),
      };
      emitDamage(
        "bleed_burst",
        "혈맥 폭발",
        event.bleedRemainingDamage * 0.5 * dominantScale("bleed"),
        "bleed",
      );
      if (owns("bleed_aftermath")) {
        commands.push({
          kind: "def_debuff",
          mechanic: "bleed_aftermath",
          label: "상흔 계수",
          pct: event.bleedStacks * 3,
          actions: 2,
        });
        commands.push({
          kind: "apply_dot",
          mechanic: "bleed_aftermath",
          label: "남은 상흔",
          dot: "bleed",
          stacks: 1,
        });
      }
    }

    if (event.attackKind === "skill" && owns("venom_burst")) {
      commands.push({
        kind: "apply_dot",
        mechanic: "venom_burst",
        label: "양면침 중독",
        dot: "poison",
        stacks: 1,
      });
    }
    if (
      event.attackKind === "basic" &&
      event.poisonStacks >= 5 &&
      owns("venom_burst")
    ) {
      commands.push({
        kind: "consume_dot",
        mechanic: "venom_burst",
        label: "만독 폭발",
        dot: "poison",
        stacks: Math.floor(event.poisonStacks),
      });
      emitDamage(
        "venom_burst",
        "만독 폭발",
        event.poisonRemainingDamage * 0.75 * dominantScale("venom"),
        "venom",
      );
      if (owns("venom_balance")) {
        commands.push({
          kind: "apply_dot",
          mechanic: "venom_balance",
          label: "부식 잔독",
          dot: "poison",
          stacks: Math.ceil(event.poisonStacks / 2),
        });
        commands.push({
          kind: "mdef_debuff",
          mechanic: "venom_balance",
          label: "부식의 저울",
          pct: event.poisonStacks * 2,
          actions: 2,
        });
      }
    }

    if (owns("pursuit_mark")) {
      let marks = state.pursuitMarks + dominantScale("pursuit");
      if (marks >= 5) {
        marks -= 5;
        emitDamage(
          "pursuit_mark",
          "추적 사격",
          event.damage * 0.6 * dominantScale("pursuit"),
          "pursuit",
        );
      }
      state = { ...state, pursuitMarks: finite(marks, 0, 5) };
    }

    if (event.crit && state.shadowEchoes >= 1 && owns("shadow_echo")) {
      state = { ...state, shadowEchoes: Math.max(0, state.shadowEchoes - 1) };
      emitDamage(
        "shadow_echo",
        "그림자 잔상",
        event.damage * 0.45 * dominantScale("shadow"),
        "shadow",
      );
    }

    if (
      owns("status_mana_return") &&
      event.paidMp > 0 &&
      event.statusKinds > 0
    ) {
      commands.push({
        kind: "mp",
        mechanic: "status_mana_return",
        label: "귀환뇌명",
        amount: commandAmount(
          event.paidMp * (event.statusKinds >= 2 ? 0.16 : 0.08),
        ),
      });
    }
    noteGale("hit");
    if (event.crit) noteGale("crit");
  }

  if (event.kind === "mp_spent" && owns("arcane_overload")) {
    let overload = state.arcaneOverload +
      finite(event.amount) * dominantScale("overload");
    let guard = 0;
    while (overload >= 100 && guard < 100) {
      overload -= 100;
      emitMagicDamage(
        "arcane_overload",
        "과부하 낙뢰",
        event.magicAtk * 1.4 * dominantScale("overload"),
        "overload",
      );
      if (owns("arcane_feedback")) {
        commands.push({
          kind: "mp",
          mechanic: "arcane_feedback",
          label: "역류 환급",
          amount: commandAmount(event.amount * 0.2),
        });
        if (event.targetHasStatus) overload += 25 * dominantScale("overload");
      }
      guard += 1;
    }
    state = { ...state, arcaneOverload: finite(overload, 0, 99.999999) };
  }

  if (event.kind === "heal_calculated") {
    if (state.nextHealPct > 0 && event.origin.generatedBy !== "storm_confluence") {
      const amount = commandAmount((event.amount * state.nextHealPct) / 100);
      state = { ...state, nextHealPct: 0 };
      if (amount > 0) {
        commands.push({
          kind: "heal",
          mechanic: "storm_confluence",
          label: "폭풍 합류",
          amount,
        });
      }
    }
    if (owns("sanctuary_reserve")) {
      state = {
        ...state,
        sanctuaryReserve: finite(
          state.sanctuaryReserve +
            event.amount * 0.3 * dominantScale("sanctuary"),
          0,
          event.maxHp * 0.6,
        ),
      };
    }
    if (
      event.origin.generatedBy &&
      event.origin.generatedBy !== "storm_confluence" &&
      equipped.has("storm_confluence")
    ) {
      state = {
        ...state,
        nextDirectDamagePct: Math.min(60, state.nextDirectDamagePct + 12),
      };
    }
  }

  if (
    event.kind === "hp_threshold" &&
    event.maxHp > 0 &&
    event.currentHp > 0 &&
    event.currentHp <= event.maxHp * 0.35 &&
    state.sanctuaryReserve > 0 &&
    owns("sanctuary_reserve")
  ) {
    const amount = commandAmount(
      state.sanctuaryReserve * dominantScale("sanctuary"),
    );
    state = { ...state, sanctuaryReserve: 0 };
    commands.push({
      kind: "heal",
      mechanic: "sanctuary_reserve",
      label: "성역 소비",
      amount,
    });
    recordCore("sanctuary");
    if (equipped.has("storm_confluence")) {
      state = {
        ...state,
        nextDirectDamagePct: Math.min(60, state.nextDirectDamagePct + 12),
      };
    }
  }

  return { state: sanitizeState(state), commands };
}

function coreForMechanic(
  mechanic: Tier6UniqueMechanic,
): Tier6CoreMechanic | null {
  for (const [core, coreMechanic] of Object.entries(CORE_MECHANICS) as Array<
    [Tier6CoreMechanic, Tier6UniqueMechanic]
  >) {
    if (mechanic === coreMechanic) return core;
  }
  if (mechanic === "bleed_aftermath") return "bleed";
  if (mechanic === "gravity_feedback" || mechanic === "shield_conversion") {
    return "gravity";
  }
  if (mechanic === "venom_balance") return "venom";
  if (mechanic === "arcane_feedback") return "overload";
  return null;
}

function sanitizeState(
  state: Tier6UniqueRuntimeState | undefined,
): Tier6UniqueRuntimeState {
  const base = initialTier6UniqueRuntime();
  if (!state) return base;
  return {
    gravityReprisal: finite(state.gravityReprisal),
    bleedBurstLastActionId:
      typeof state.bleedBurstLastActionId === "number" &&
      Number.isFinite(state.bleedBurstLastActionId)
        ? Math.floor(Math.max(0, state.bleedBurstLastActionId))
        : null,
    pursuitMarks: finite(state.pursuitMarks, 0, 5),
    shadowEchoes: finite(state.shadowEchoes, 0, 3),
    arcaneOverload: finite(state.arcaneOverload, 0, 99.999999),
    sanctuaryReserve: finite(state.sanctuaryReserve),
    unityMechanics: Array.isArray(state.unityMechanics)
      ? [...new Set(state.unityMechanics)].slice(0, 2)
      : [],
    galeEvents: Array.isArray(state.galeEvents)
      ? [...new Set(state.galeEvents)].slice(0, 2)
      : [],
    heartCounts: Object.fromEntries(
      Object.entries(state.heartCounts ?? {}).map(([key, value]) => [
        key,
        finite(value ?? 0, 0, 1_000_000),
      ]),
    ),
    dominantMechanic: state.dominantMechanic ?? null,
    nextDirectDamagePct: finite(state.nextDirectDamagePct, 0, 60),
    nextHealPct: finite(state.nextHealPct, 0, 60),
    nextShieldPct: finite(state.nextShieldPct, 0, 60),
    nextDirectFixedDamage: finite(state.nextDirectFixedDamage),
  };
}

export function tier6ResourceSnapshot(
  current: Tier6UniqueRuntimeState | undefined,
): Record<string, number | string> {
  if (!current) return {};
  const state = sanitizeState(current);
  const snapshot: Record<string, number | string> = {};
  if (state.gravityReprisal > 0) snapshot.gravityReprisal = Math.floor(state.gravityReprisal);
  if (state.pursuitMarks > 0) snapshot.pursuitMarks = Number(state.pursuitMarks.toFixed(2));
  if (state.shadowEchoes > 0) snapshot.shadowEchoes = Math.floor(state.shadowEchoes);
  if (state.arcaneOverload > 0) snapshot.arcaneOverload = Number(state.arcaneOverload.toFixed(2));
  if (state.sanctuaryReserve > 0) snapshot.sanctuaryReserve = Math.floor(state.sanctuaryReserve);
  if (state.unityMechanics.length > 0) snapshot.unity = state.unityMechanics.length;
  if (state.galeEvents.length > 0) snapshot.gale = state.galeEvents.length;
  if (state.dominantMechanic) snapshot.dominant = state.dominantMechanic;
  if (state.nextDirectDamagePct > 0) snapshot.nextDamagePct = state.nextDirectDamagePct;
  if (state.nextHealPct > 0) snapshot.nextHealPct = state.nextHealPct;
  if (state.nextShieldPct > 0) snapshot.nextShieldPct = state.nextShieldPct;
  return snapshot;
}

/** 구형 로그의 직렬화 지문을 보존하기 위해 활성 자원이 없으면 필드 자체를 생략한다. */
export function activeTier6ResourceSnapshot(
  current: Tier6UniqueRuntimeState | undefined,
): Record<string, number | string> | undefined {
  const snapshot = tier6ResourceSnapshot(current);
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}
