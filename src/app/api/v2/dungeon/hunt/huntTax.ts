// 사냥 세금 계산 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉).
//   세금 행선지(taxOwnerId/npcTaxOutpostId/tileTaxOutpostId)·세율 결정은 라우트(tx read)가
//   하고, 여기선 결정된 입력으로 금액만 산출한다. 영속(거점 금고 입금 등)도 라우트가 한다.
import { parseTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { isTradeRouteTile } from "@/adventure/data/v2/tileConfig";
import { TRADE_ROUTE_TAX_MULT } from "@/adventure/data/v2/settlementWarfareConfig";
import { V2_CORE_LOOP_V2, lossTaxOf } from "@/adventure/data/v2/coreLoopConfig";

// 사냥세 금액 — 세금 owner/거점/타일이 있고 세율>0·승리·gross>0 일 때만 발생.
//   outpost FOR UPDATE 로 정책/세율 스냅샷을 잡은 뒤 라우트가 호출(진입 시점 값으로 일관).
//   교역로(trade_route) 칸 정착지 = 세금 발생 ×1.15(P3). 발생 지점이라 사냥꾼 net 에서 더 떼어
//   금고로 갈 뿐 새 골드를 찍지 않음(보존). goldTaxed 는 goldGross 로 상한.
export function computeGoldTax(params: {
  taxOwnerId: string | null;
  npcTaxOutpostId: string | null;
  tileTaxOutpostId: string | null;
  taxRate: number;
  won: boolean;
  goldGross: number;
}): number {
  const { taxOwnerId, npcTaxOutpostId, tileTaxOutpostId, taxRate, won, goldGross } =
    params;
  let goldTaxed = 0;
  if (
    (taxOwnerId || npcTaxOutpostId || tileTaxOutpostId) &&
    taxRate > 0 &&
    won &&
    goldGross > 0
  ) {
    goldTaxed = Math.max(1, Math.floor(goldGross * taxRate));
    if (tileTaxOutpostId) {
      const pos = parseTileOutpostId(tileTaxOutpostId);
      if (pos && isTradeRouteTile(pos.col, pos.row)) {
        goldTaxed = Math.floor(goldTaxed * TRADE_ROUTE_TAX_MULT);
      }
    }
    if (goldTaxed > goldGross) goldTaxed = goldGross;
  }
  return goldTaxed;
}

// 코어루프 패배 페널티 — 마지막 패배 이후 번 골드(atRiskGold)를 승리마다 누적, 패배 시 그
//   절반(보유 한도 클램프)을 소실하고 0 리셋. 원금이 아닌 최근 승리분만 대상 → 전멸 없음.
//   off = lossTax 0·atRiskGold 미기록(byte-identical). 소실 골드는 어디에도 입금하지 않는다.
export function computeLossTax(params: {
  won: boolean;
  goldNet: number;
  atRiskGoldRaw: unknown;
  goldRaw: number | undefined;
}): { lossTax: number; nextAtRisk: number } {
  const { won, goldNet, atRiskGoldRaw, goldRaw } = params;
  const prevAtRisk = V2_CORE_LOOP_V2
    ? Math.max(0, Number(atRiskGoldRaw) || 0)
    : 0;
  let lossTax = 0;
  let nextAtRisk = prevAtRisk;
  if (V2_CORE_LOOP_V2) {
    if (won) {
      nextAtRisk = prevAtRisk + Math.max(0, goldNet);
    } else {
      lossTax = lossTaxOf(prevAtRisk, Math.max(0, goldRaw ?? 0)).tax;
      nextAtRisk = 0;
    }
  }
  return { lossTax, nextAtRisk };
}
