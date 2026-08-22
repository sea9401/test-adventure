import type { BattleLogEntry } from "@/adventure/v2/combat/engine";

type AttackEntry = BattleLogEntry & {
  kind: "player_attack" | "enemy_attack";
};

type ParsedHit = {
  entry: AttackEntry;
  title: string;
  labels: string;
  damage: number;
};

const HIT_PATTERN =
  /^([^!]+)!\s*((?:\[[^\]]+\]\s*)*)([\d,]+)\s*피해를 입혔다\.?$/;

function isAttackEntry(entry: BattleLogEntry): entry is AttackEntry {
  return entry.kind === "player_attack" || entry.kind === "enemy_attack";
}

function parsedHit(entry: BattleLogEntry): ParsedHit | null {
  if (!isAttackEntry(entry)) return null;
  const match = entry.text.match(HIT_PATTERN);
  if (!match || match[1].trim() === "공격") return null;
  return {
    entry,
    title: match[1].trim(),
    labels: match[2].trim(),
    damage: Number(match[3].replaceAll(",", "")),
  };
}

function sameCast(previous: ParsedHit, next: ParsedHit): boolean {
  return (
    previous.title === next.title &&
    previous.entry.kind === next.entry.kind &&
    previous.entry.turn === next.entry.turn &&
    previous.entry.side === next.entry.side &&
    previous.entry.t === next.entry.t
  );
}

export function gridDungeonSoloCombatLog(
  entries: BattleLogEntry[],
  limit = 4,
): string[] {
  const lines: string[] = [];
  let hits: ParsedHit[] = [];

  const flushHits = () => {
    if (hits.length === 1) lines.push(hits[0].entry.text);
    if (hits.length > 1) {
      const total = hits.reduce((sum, hit) => sum + hit.damage, 0);
      const detail = hits
        .map(
          (hit, index) =>
            `${index + 1}타${hit.labels ? ` ${hit.labels}` : ""} ${hit.damage.toLocaleString("ko-KR")}`,
        )
        .join(" / ");
      lines.push(
        `${hits[0].title}! ${hits.length}타 · 총 ${total.toLocaleString("ko-KR")} 피해 (${detail})`,
      );
    }
    hits = [];
  };

  for (const entry of entries) {
    const hit = parsedHit(entry);
    if (hit) {
      if (hits.length > 0 && !sameCast(hits[hits.length - 1], hit)) {
        flushHits();
      }
      hits.push(hit);
      continue;
    }
    flushHits();
    if (entry.kind !== "hp_bar" && entry.text) lines.push(entry.text);
  }
  flushHits();

  return lines.slice(-Math.max(0, Math.floor(limit)));
}
