import { HUNT_MONSTER_CODEX } from "./dungeon";

export type MonsterHuntCodexEntry = {
  name: string;
  areas: string[];
  firstDepth: number;
  defeated: boolean;
  kills: number;
};

export type MonsterHuntCodexView = {
  huntableSpecies: number;
  currentKilled: number;
  recordedSpecies: number;
  legacyKilled: number;
  entries: MonsterHuntCodexEntry[];
};

/** 현재 사냥 가능 목록과 adventure-log.v2의 이름별 처치 기록을 합친다. */
export function deriveMonsterHuntCodex(raw: unknown): MonsterHuntCodexView {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const monsters =
    obj.monsters && typeof obj.monsters === "object"
      ? (obj.monsters as Record<string, unknown>)
      : {};
  const killsByName = new Map<string, number>();
  for (const [name, value] of Object.entries(monsters)) {
    const entry =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const kills = Math.max(0, Math.floor(Number(entry.kills) || 0));
    if (kills > 0) killsByName.set(name, kills);
  }

  const currentNames = new Set(HUNT_MONSTER_CODEX.map((entry) => entry.name));
  const entries = HUNT_MONSTER_CODEX.map((entry) => {
    const kills = killsByName.get(entry.name) ?? 0;
    return {
      ...entry,
      areas: [...entry.areas],
      defeated: kills > 0,
      kills,
    };
  });
  const currentKilled = entries.filter((entry) => entry.defeated).length;
  const legacyKilled = [...killsByName.keys()].filter(
    (name) => !currentNames.has(name),
  ).length;

  return {
    huntableSpecies: entries.length,
    currentKilled,
    recordedSpecies: killsByName.size,
    legacyKilled,
    entries,
  };
}
