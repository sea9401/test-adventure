export type RecoveryChargesUpdate = {
  hpCharges?: number;
  mpCharges?: number;
};

/**
 * 사냥 응답에 동봉된 회복약 권위값만 공용 게임 상태용 패치로 정리한다.
 * 일부 옛 응답은 한쪽 값을 생략할 수 있으므로 없는 값은 기존 상태를 보존한다.
 */
export function recoveryChargesUpdate(
  hpCharges: number | null | undefined,
  mpCharges: number | null | undefined,
): RecoveryChargesUpdate | null {
  const update: RecoveryChargesUpdate = {};
  if (typeof hpCharges === "number") update.hpCharges = hpCharges;
  if (typeof mpCharges === "number") update.mpCharges = mpCharges;
  return update.hpCharges === undefined && update.mpCharges === undefined
    ? null
    : update;
}
