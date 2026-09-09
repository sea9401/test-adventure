/** 기류는 장착 패시브로 활성화되며 전투 안에서만 유지된다. */
export type WindCurrentSkill =
  | { kind: "gather" }
  | { kind: "release"; damagePctPerStack: number; hastePctPerStack: number };
export const WIND_CURRENT_MAX = 3;
export const normalizeWindCurrent = (value?: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(WIND_CURRENT_MAX, Math.floor(value!))) : 0;

export function previewWindCurrent(value: number | undefined, passivePct: number, skill?: WindCurrentSkill, extraGather = 0) {
  const current = passivePct > 0 ? normalizeWindCurrent(value) : undefined;
  const stacks = current ?? 0;
  // 실제 적중 여부가 확정되기 전에는 원래 자원을 변경하지 않는다.
  return {
    current,
    next: current === undefined || !skill
      ? current
      : skill.kind === "gather" ? Math.min(WIND_CURRENT_MAX, stacks + 1 + extraGather) : 0,
    damageMultiplier: !skill || current === undefined
      ? 1
      : 1 + stacks * (passivePct + (skill.kind === "release" ? skill.damagePctPerStack : 0)) / 100,
    hastePct: skill?.kind === "release" ? stacks * skill.hastePctPerStack : 0,
  };
}

export function finishWindCurrent(preview: ReturnType<typeof previewWindCurrent>, landed: boolean) {
  return { current: landed ? preview.next : preview.current, hastePct: landed ? preview.hastePct : 0 };
}

export function mergeWindCurrentSnapshot(base: Record<string, number | string> | undefined, value?: number, reboundReady = false): Record<string, number | string> | undefined {
  return value === undefined ? base : { ...base, windCurrent: `${normalizeWindCurrent(value)}/${WIND_CURRENT_MAX}${reboundReady ? " · 재생성 준비" : ""}` };
}
