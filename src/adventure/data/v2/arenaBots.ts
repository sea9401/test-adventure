// v2 아레나 봇 — 실유저 매칭 풀이 비었을 때 폴백 (PR-8a).
//
// 봇은 라이브 PvP 의 NPC 데이터를 이식하지 않는다 (라이브 코드 영향 0 룰).
// 6 스탯 분배 + 레벨만 가진 가벼운 템플릿. derivePlayerCombatV2Pure 로 PlayerCombat
// 변환 — 장비/룬/스킬/파라곤 모두 비워서 라이브 시스템 의존 0.
//
// PR-7a: 옛 spell 시스템 (equippedSpells/learnedSpellsForInt) 폐기. 봇은 현재 v2 스킬 미장착
// (PR-5b 처럼 monster v2 카탈로그 도입은 가능하나 봇 디자인은 후속 PR 에서).

import {
  derivePlayerCombatV2Pure,
  V2_STAT_POINTS_PER_LEVEL,
  type DerivedPlayerCombatV2,
} from "@/lib/server/derivePlayerCombatV2";
import {
  emptyV2StatMap,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import type { V2Element } from "@/adventure/data/v2/elements";

export type BotTemplate = {
  /** 안정적 식별자 — recentOpponents 매칭에 사용. */
  id: string;
  name: string;
  /** 주력 스탯에 60% 배분. */
  focus: V2StatKey;
  /** 보조 스탯에 30% 배분. 남은 10% 는 vit 로. */
  secondary: V2StatKey;
  /** PR-5 — 봇 속성(상성). 7템플릿 = 7-ring 1:1 스프레드 (PvP 상성 의미 부여). */
  element: V2Element;
};

// PR-2 — 봇 분배는 v2 6스탯(str/dex/vit/int/spi/luk)만. 속도(spd)는 파생이라
// 분배 대상 아님 → 옛 spd 봇은 dex(속도 파생원)/luk(회피)로 이관 (소실 방지).
// PR-5 — 7템플릿에 7-ring 속성 1:1 부착 (봇 풀이 모든 속성 커버 → PvP 상성 활성).
export const BOT_TEMPLATES: ReadonlyArray<BotTemplate> = [
  { id: "bot-veno-warrior", name: "유랑 전사", focus: "str", secondary: "vit", element: "fire" },
  { id: "bot-veno-rogue", name: "그림자 적", focus: "dex", secondary: "luk", element: "void" },
  { id: "bot-veno-mage", name: "방랑 술사", focus: "int", secondary: "luk", element: "water" },
  { id: "bot-veno-duelist", name: "결투가", focus: "dex", secondary: "str", element: "lightning" },
  { id: "bot-veno-templar", name: "맹세의 기수", focus: "vit", secondary: "str", element: "earth" },
  { id: "bot-veno-gambler", name: "행운의 검", focus: "luk", secondary: "dex", element: "wind" },
  { id: "bot-veno-mystic", name: "별빛 신탁자", focus: "int", secondary: "spi", element: "starlight" },
];

export type ArenaBot = {
  id: string;
  name: string;
  level: number;
  /** 매칭 가중치 산정용 가짜 점수 — 봇은 항상 0. */
  score: number;
  /** PR-5 — 봇 속성(상성). */
  element: V2Element;
  combat: DerivedPlayerCombatV2;
};

function emptyStatRecord(): Record<V2StatKey, number> {
  return emptyV2StatMap();
}

/**
 * 단련 포인트 배분: 레벨 N 캐릭의 총 보유 포인트는 (N-1) × V2_STAT_POINTS_PER_LEVEL.
 * 60/30/10 으로 focus/secondary/vit(또는 luk) 에 배분. 음수/0 클램프 (level ≤ 1 = 0).
 */
function allocatePoints(
  totalPoints: number,
  template: BotTemplate,
): Record<V2StatKey, number> {
  const allocated = emptyStatRecord();
  if (totalPoints <= 0) return allocated;
  const focusPts = Math.floor(totalPoints * 0.6);
  const secondaryPts = Math.floor(totalPoints * 0.3);
  const vitPts = totalPoints - focusPts - secondaryPts;
  allocated[template.focus] += focusPts;
  if (template.secondary === template.focus) {
    // focus 와 secondary 가 우연히 같으면 secondary 를 vit 로 (단, vit 가 focus 인
    // 템플릿이면 luk 로). 현재 BOT_TEMPLATES 에는 없지만 안전망.
    allocated[template.focus === "vit" ? "luk" : "vit"] += secondaryPts;
  } else {
    allocated[template.secondary] += secondaryPts;
  }
  // 잔여는 vit. focus/secondary 가 vit 면 luk 로.
  if (template.focus !== "vit" && template.secondary !== "vit") {
    allocated.vit += vitPts;
  } else {
    allocated.luk += vitPts;
  }
  return allocated;
}

export function buildBot(template: BotTemplate, level: number): ArenaBot {
  const lv = Math.max(1, Math.floor(level));
  // (lv-1) × 5 — 1레벨 봇은 베이스만, 2레벨부터 1레벨업분(5pt) 누적.
  // hunt route 의 grant 와 동일 정책.
  const totalPoints = Math.max(0, lv - 1) * V2_STAT_POINTS_PER_LEVEL;
  const allocated = allocatePoints(totalPoints, template);
  const combat = derivePlayerCombatV2Pure({
    level: lv,
    allocatedStats: allocated,
    v2Equipped: {}, // 봇은 장비 없음
    hp: undefined, // 풀충 (maxHp 로 클램프)
  });
  return {
    id: `${template.id}-l${lv}`,
    name: template.name,
    level: lv,
    score: 0,
    element: template.element,
    combat,
  };
}

/**
 * 본인 레벨 ±BOT_LEVEL_BAND 안의 봇 변종을 모두 생성. 각 템플릿마다 level 변종 1개씩.
 * 빈 배열 반환 X (테스트 가능하도록 항상 ≥ 1 — playerLevel 자체로 1개씩 생성 보장).
 */
export function buildBotsAroundLevel(
  playerLevel: number,
  band: number,
): ArenaBot[] {
  const lvLow = Math.max(1, Math.floor(playerLevel - band));
  const lvHigh = Math.max(lvLow, Math.floor(playerLevel + band));
  const out: ArenaBot[] = [];
  for (const t of BOT_TEMPLATES) {
    // 각 템플릿마다 [lvLow, lvHigh] 범위에서 3개 변종 (low/mid/high) — 너무 많아도 가중치
    // 계산만 늘어나니 3개로 제한. 같은 레벨이 겹치면 dedupe (한 변종만 생성).
    const levels = new Set<number>();
    levels.add(lvLow);
    levels.add(Math.floor((lvLow + lvHigh) / 2));
    levels.add(lvHigh);
    for (const lv of levels) {
      out.push(buildBot(t, lv));
    }
  }
  return out;
}
