// 다단 스킬과 DoT의 표시 피해를 비례 분배한다. 마지막 칸에 나머지를 배정해 합을 보존한다.
export function distributeBoostedHits(
  rawHits: readonly number[],
  boostedTotal: number,
): number[] {
  const n = rawHits.length;
  if (n === 0) return [];
  if (n === 1) return [boostedTotal];
  const rawSum = rawHits.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let allocated = 0;
  if (rawSum <= 0) {
    // 퇴화(전부 0) — 균등 분배.
    const base = Math.floor(boostedTotal / n);
    for (let i = 0; i < n - 1; i += 1) {
      out.push(base);
      allocated += base;
    }
  } else {
    for (let i = 0; i < n - 1; i += 1) {
      const share = Math.floor((boostedTotal * rawHits[i]) / rawSum);
      out.push(share);
      allocated += share;
    }
  }
  out.push(boostedTotal - allocated); // 마지막 칸이 나머지 흡수 → 합 정확.
  return out;
}
