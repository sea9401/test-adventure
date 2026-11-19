// 명장 산물 획득 표시 — 생활 요청 응답의 lifeMajor.masterProduct 를 결과 화면용으로 읽는다.
// 산물은 알림 대신 각 생활의 결과에 한 줄로 보여 준다(건의 #863).

export type MasterProductGain = { name: string; count: number };

export function parseMasterProductGain(response: unknown): MasterProductGain | null {
  const lifeMajor = (response as { lifeMajor?: unknown } | null)?.lifeMajor;
  const product = (lifeMajor as { masterProduct?: unknown } | null | undefined)?.masterProduct;
  if (!product || typeof product !== "object") return null;
  const { name, count } = product as { name?: unknown; count?: unknown };
  const amount = Math.floor(Number(count) || 0);
  if (typeof name !== "string" || !name || amount <= 0) return null;
  return { name, count: amount };
}

export function addMasterProductGain(
  total: MasterProductGain | null,
  gain: MasterProductGain | null,
): MasterProductGain | null {
  if (!gain) return total;
  if (!total) return gain;
  return { name: total.name, count: total.count + gain.count };
}

export function masterProductGainText(gain: MasterProductGain): string {
  return `${gain.name} +${gain.count.toLocaleString("ko-KR")}`;
}
